import type { LiteratureProviderTransport } from "../provider-types.js";
import {
  invalidNcbiResponse,
  pubMedIdentityConflict,
  withNcbiPayloadErrors
} from "./ncbi.errors.js";
import { parseNcbiXml } from "./ncbi.payload.js";
import { normalizePubMedFetchArticle } from "./ncbi.pubmed-normalize.js";
import type { PubMedRequest } from "./ncbi.request.js";
import { pubMedFetchResponseSchema } from "./ncbi.schema.js";
import type { PubMedNormalizedArticle } from "./ncbi.types.js";
import { extractPubMedOrderedText } from "./ncbi.xml-text.js";

export type PubMedFetchContext = {
  readonly action: "fetch_seed" | "doi_lookup";
  readonly pmid: string;
  readonly expectedDoi?: string;
  readonly operationDeadlineMs: number;
  readonly signal?: AbortSignal;
};

export async function fetchPubMedArticle(
  transport: LiteratureProviderTransport<PubMedRequest>,
  context: PubMedFetchContext
): Promise<PubMedNormalizedArticle> {
  const result = await transport.get({
    request: { kind: "fetch", action: context.action, pmid: context.pmid },
    operationDeadlineMs: context.operationDeadlineMs,
    ...(context.signal === undefined ? {} : { signal: context.signal })
  });
  return withNcbiPayloadErrors("pubmed", context.action, result.attempts, () => {
    const parsed = parseNcbiXml({
      text: result.body,
      schema: pubMedFetchResponseSchema
    });
    const article = parsed.PubmedArticleSet.PubmedArticle[0];
    if (parsed.PubmedArticleSet.PubmedArticle.length !== 1 || article === undefined) {
      throw invalidNcbiResponse("pubmed", context.action, result.attempts);
    }
    const normalized = normalizePubMedFetchArticle(
      article,
      context.pmid,
      extractPubMedOrderedText(result.body)
    );
    if (context.expectedDoi !== undefined && normalized.doi !== context.expectedDoi) {
      throw pubMedIdentityConflict(context.action, result.attempts);
    }
    return normalized;
  });
}

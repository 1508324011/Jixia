import { isCanonicalLiteratureDoi } from "../../literature.normalization.js";
import {
  LiteraturePayloadError,
  LiteratureProviderError,
  LiteratureProviderIdentityConflictError
} from "../provider-errors.js";
import {
  createLiteratureProviderRateGate,
  literatureRateGateDefaults
} from "../provider-rate-gate.js";
import { createLiteratureProviderTransport } from "../provider-transport.js";
import { parseLiteratureJson } from "../safe-parser.js";
import { normalizeUnpaywallResponse } from "./unpaywall.normalization.js";
import {
  buildUnpaywallRequest,
  unpaywallOrigin,
  type UnpaywallRequest
} from "./unpaywall.request.js";
import { unpaywallResponseSchema } from "./unpaywall.schema.js";
import type {
  UnpaywallAdapter,
  UnpaywallAdapterConfigState,
  UnpaywallAdapterDependencies
} from "./unpaywall.types.js";

export type {
  UnpaywallAdapter,
  UnpaywallAdapterConfigState,
  UnpaywallAdapterDependencies,
  UnpaywallEnrichment,
  UnpaywallEnrichmentInput
} from "./unpaywall.types.js";

export function createUnpaywallAdapter(
  configState: UnpaywallAdapterConfigState,
  dependencies: UnpaywallAdapterDependencies = {}
): UnpaywallAdapter {
  if (configState.status === "disabled") {
    return createDisabledUnpaywallAdapter();
  }
  const rateGate = dependencies.rateGate ?? createLiteratureProviderRateGate(
    literatureRateGateDefaults.unpaywall
  );
  const transport = createLiteratureProviderTransport<UnpaywallRequest>(
    {
      providerKey: "unpaywall",
      origin: unpaywallOrigin,
      rateGate,
      buildRequest: (request) => buildUnpaywallRequest(configState.config, request)
    },
    dependencies.transport
  );

  return {
    async enrichDoi(input) {
      if (input.doi.length > 512 || !isCanonicalLiteratureDoi(input.doi)) {
        throw unpaywallError("provider_rejected", 0, null);
      }
      const call = await transport.get({
        request: { doi: input.doi },
        operationDeadlineMs: input.operationDeadlineMs,
        ...(input.signal === undefined ? {} : { signal: input.signal })
      });
      try {
        const response = parseLiteratureJson({
          text: call.body,
          schema: unpaywallResponseSchema
        });
        const enrichment = normalizeUnpaywallResponse(response);
        if (enrichment.doi !== input.doi) {
          throw new LiteratureProviderIdentityConflictError({
            providerKey: "unpaywall",
            action: "doi_enrichment",
            attempt: call.attempts,
            statusClass: "2xx",
            latencyMs: 0
          });
        }
        return enrichment;
      } catch (error) {
        if (error instanceof LiteraturePayloadError) {
          throw unpaywallError(
            error.code === "response_too_large" ? "response_too_large" : "invalid_response",
            call.attempts,
            "2xx"
          );
        }
        throw error;
      }
    }
  };
}

function createDisabledUnpaywallAdapter(): UnpaywallAdapter {
  return {
    async enrichDoi() {
      throw unpaywallError("provider_unconfigured", 0, null);
    }
  };
}

function unpaywallError(
  code: LiteratureProviderError["code"],
  attempt: number,
  statusClass: LiteratureProviderError["statusClass"]
): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey: "unpaywall",
    action: "doi_enrichment",
    attempt,
    statusClass,
    latencyMs: 0,
    code
  });
}

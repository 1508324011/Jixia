import { createLiteratureProviderTransport } from "../provider-transport.js";
import type {
  LiteratureProviderRateGate,
  LiteratureProviderTransportDependencies
} from "../provider-types.js";
import {
  rejectedNcbiRequest,
  withNcbiPayloadErrors
} from "./ncbi.errors.js";
import { isCanonicalPmcRecordKey } from "../provider-identities.js";
import { parseNcbiXml } from "./ncbi.payload.js";
import { normalizePmcResponse } from "./ncbi.pmc-normalize.js";
import {
  buildPmcRequest,
  pmcOrigin,
  type PmcRequest
} from "./ncbi.request.js";
import { pmcResponseSchema } from "./ncbi.schema.js";
import type {
  NcbiServiceConfig,
  PmcAdapter
} from "./ncbi.types.js";

type BoundNcbiDependencies = {
  readonly rateGate: LiteratureProviderRateGate;
  readonly transport?: LiteratureProviderTransportDependencies;
};

export function createPmcAdapter(
  config: NcbiServiceConfig,
  dependencies: BoundNcbiDependencies
): PmcAdapter {
  const transport = createLiteratureProviderTransport<PmcRequest>({
    providerKey: "pmc",
    origin: pmcOrigin,
    rateGate: dependencies.rateGate,
    buildRequest: (request) => buildPmcRequest(config, request)
  }, dependencies.transport);

  return {
    async lookup(input) {
      if (!isCanonicalPmcRecordKey(input.pmcid)) {
        throw rejectedNcbiRequest("pmc", "oa_lookup");
      }
      const result = await transport.get({
        request: { pmcid: input.pmcid },
        operationDeadlineMs: input.operationDeadlineMs,
        ...(input.signal === undefined ? {} : { signal: input.signal })
      });
      return withNcbiPayloadErrors("pmc", "oa_lookup", result.attempts, () =>
        normalizePmcResponse(parseNcbiXml({
          text: result.body,
          schema: pmcResponseSchema
        }), input.pmcid)
      );
    }
  };
}

import { Agent, fetch as undiciFetch } from "undici";

import { adaptLiteratureProviderBody } from "./provider-network-body.js";
import {
  createPinnedLookup,
  type ApprovedLiteratureProviderAddress
} from "./provider-network-address.js";
import type {
  LiteratureProviderFetchInit,
  LiteratureProviderFetchResponse
} from "./provider-types.js";

export async function fetchPinnedLiteratureProvider(input: {
  readonly url: string;
  readonly init: LiteratureProviderFetchInit;
  readonly hostname: string;
  readonly addresses: readonly ApprovedLiteratureProviderAddress[];
}): Promise<LiteratureProviderFetchResponse> {
  const dispatcher = new Agent({
    connect: { lookup: createPinnedLookup(input.hostname, input.addresses) }
  });
  try {
    const response = await undiciFetch(input.url, {
      ...input.init,
      dispatcher
    });
    const adaptedBody = adaptLiteratureProviderBody(response.body);
    const headers = new Headers();
    response.headers.forEach((value, name) => headers.append(name, value));
    return {
      status: response.status,
      headers,
      body: adaptedBody.stream,
      dispose: async () => {
        try {
          await adaptedBody.dispose();
        } finally {
          await dispatcher.close();
        }
      }
    };
  } catch (error) {
    await dispatcher.close();
    throw error;
  }
}

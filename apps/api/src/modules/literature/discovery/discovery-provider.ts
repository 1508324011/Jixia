import type {
  LiteratureDiscoveryProviderFailureCode,
  LiteratureDiscoveryProviderStatusDTO,
  LiteratureSearchProviderKey
} from "@jixia/shared";

import type { LiteratureCursorProviderState } from "./cursor-codec.js";
import type {
  LiteratureDiscoveryNormalizedRecord,
  LiteratureDiscoveryProviderSearchInput,
  LiteratureDiscoverySearchAdapter
} from "./discovery.types.js";
import {
  LiteratureProviderError,
  type LiteratureProviderErrorCode
} from "./provider-errors.js";

export type LiteratureDiscoveryProviderOutcome = {
  readonly providerKey: LiteratureSearchProviderKey;
  readonly records: readonly LiteratureDiscoveryNormalizedRecord[];
  readonly status: LiteratureDiscoveryProviderStatusDTO;
  readonly cursorState: LiteratureCursorProviderState;
  readonly calledSuccessfully: boolean;
};

export async function invokeLiteratureDiscoveryProvider(input: {
  readonly providerKey: LiteratureSearchProviderKey;
  readonly adapter: LiteratureDiscoverySearchAdapter;
  readonly request: LiteratureDiscoveryProviderSearchInput;
  readonly priorState: LiteratureCursorProviderState;
}): Promise<LiteratureDiscoveryProviderOutcome> {
  if (input.priorState.status !== "active") {
    return carryProviderState(input.providerKey, input.priorState);
  }
  if (input.request.limit === 0) {
    return {
      providerKey: input.providerKey,
      records: [],
      status: { providerKey: input.providerKey, status: "succeeded", resultCount: 0 },
      cursorState: { status: "exhausted", continuation: null },
      calledSuccessfully: false
    };
  }
  try {
    const result = await input.adapter.search(input.request);
    return {
      providerKey: input.providerKey,
      records: result.records,
      status: {
        providerKey: input.providerKey,
        status: "succeeded",
        resultCount: result.records.length
      },
      cursorState: result.nextCursor === null
        ? { status: "exhausted", continuation: null }
        : { status: "active", continuation: result.nextCursor },
      calledSuccessfully: true
    };
  } catch (error) {
    if (!(error instanceof LiteratureProviderError)) {
      throw error;
    }
    return providerFailureOutcome(input.providerKey, error);
  }
}

function providerFailureOutcome(
  providerKey: LiteratureSearchProviderKey,
  error: LiteratureProviderError
): LiteratureDiscoveryProviderOutcome {
  if (error.code === "rate_limited") {
    return {
      providerKey,
      records: [],
      status: { providerKey, status: "rate_limited", retryAfterSeconds: null },
      cursorState: { status: "rate_limited", continuation: null },
      calledSuccessfully: false
    };
  }
  if (error.code === "provider_unconfigured") {
    return {
      providerKey,
      records: [],
      status: { providerKey, status: "unconfigured" },
      cursorState: { status: "unconfigured", continuation: null },
      calledSuccessfully: false
    };
  }
  const failureCode = discoveryFailureCode(error.code);
  return {
    providerKey,
    records: [],
    status: { providerKey, status: "unavailable", failureCode },
    cursorState: { status: "unavailable", continuation: null },
    calledSuccessfully: false
  };
}

function carryProviderState(
  providerKey: LiteratureSearchProviderKey,
  state: Exclude<LiteratureCursorProviderState, { readonly status: "active" }>
): LiteratureDiscoveryProviderOutcome {
  switch (state.status) {
    case "exhausted":
      return {
        providerKey,
        records: [],
        status: { providerKey, status: "succeeded", resultCount: 0 },
        cursorState: state,
        calledSuccessfully: false
      };
    case "rate_limited":
      return {
        providerKey,
        records: [],
        status: { providerKey, status: "rate_limited", retryAfterSeconds: null },
        cursorState: state,
        calledSuccessfully: false
      };
    case "unavailable":
      return {
        providerKey,
        records: [],
        status: { providerKey, status: "unavailable", failureCode: "provider_unavailable" },
        cursorState: state,
        calledSuccessfully: false
      };
    case "unconfigured":
      return {
        providerKey,
        records: [],
        status: { providerKey, status: "unconfigured" },
        cursorState: state,
        calledSuccessfully: false
      };
  }
}

function discoveryFailureCode(
  code: LiteratureProviderErrorCode
): LiteratureDiscoveryProviderFailureCode {
  switch (code) {
    case "deadline_exhausted":
    case "timeout":
      return "timeout";
    case "network_error":
      return "network_error";
    case "invalid_response":
      return "invalid_response";
    case "response_too_large":
      return "response_too_large";
    case "redirect_rejected":
    case "unexpected_content_type":
    case "unsafe_destination":
      return "unsafe_response";
    case "cancelled":
    case "internal_error":
    case "not_found":
    case "provider_rejected":
    case "provider_unavailable":
      return "provider_unavailable";
    case "provider_unconfigured":
    case "rate_limited":
      return "provider_unavailable";
  }
}

export type ApiFetchInit = RequestInit & {
  readonly acceptedStatuses?: readonly number[];
  readonly json?: unknown;
};

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { acceptedStatuses = [], json, headers, ...requestInit } = init;
  const requestHeaders = new Headers(headers);
  const hasJsonBody = json !== undefined;

  if (hasJsonBody && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const fetchInit: RequestInit = {
    ...requestInit,
    headers: requestHeaders,
    credentials: "include"
  };

  if (hasJsonBody) {
    fetchInit.body = JSON.stringify(json);
  } else if (requestInit.body !== undefined) {
    fetchInit.body = requestInit.body;
  }

  const response = await fetch(apiPath(path), fetchInit);

  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    throw new Error(await responseErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function apiStream(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const { acceptedStatuses = [], json, headers, ...requestInit } = init;
  const requestHeaders = new Headers(headers);

  if (json !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(apiPath(path), {
    ...requestInit,
    headers: requestHeaders,
    credentials: "include",
    ...(json === undefined ? {} : { body: JSON.stringify(json) })
  });

  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    throw new Error(await responseErrorMessage(response));
  }

  return response;
}

function apiPath(path: string): string {
  return `/api${path.startsWith("/") ? path : `/${path}`}`;
}

async function responseErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed with status ${response.status}`;
  const text = (await response.text()).trim();

  if (!text) {
    return response.statusText ? `${fallback}: ${response.statusText}` : fallback;
  }

  try {
    const payload = JSON.parse(text) as unknown;
    if (isErrorPayload(payload)) {
      return payload.error;
    }

    if (isMessagePayload(payload)) {
      return payload.message;
    }
  } catch {
    return response.statusText ? `${fallback}: ${response.statusText}` : fallback;
  }

  return fallback;
}

function isErrorPayload(payload: unknown): payload is { readonly error: string } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.length > 0
  );
}

function isMessagePayload(payload: unknown): payload is { readonly message: string } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string" &&
    payload.message.length > 0
  );
}

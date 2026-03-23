export async function requestJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const requestUrl =
    input.startsWith('/') && typeof window !== 'undefined'
      ? new URL(input, window.location.origin).toString()
      : input;

  const response = await fetch(requestUrl, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

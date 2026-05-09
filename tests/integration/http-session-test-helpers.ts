import { once } from "node:events";

import type { RuntimeConfigEnv } from "../../src/server/runtime-config";
import { createHttpServer } from "../../src/server/http-server";

export async function startTestServer(
  env: RuntimeConfigEnv,
): Promise<{
  close: () => Promise<void>;
  url: string;
}> {
  const httpServer = createHttpServer({ env });

  httpServer.server.listen(0, "127.0.0.1");
  await once(httpServer.server, "listening");
  const address = httpServer.server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server.");
  }

  return {
    close: async () => {
      await httpServer.close();
    },
    url: `http://127.0.0.1:${address.port}`,
  };
}

export async function loginAs(
  serverUrl: string,
  userId: string,
): Promise<string> {
  const response = await fetch(`${serverUrl}/api/session/login`, {
    body: JSON.stringify({ userId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Login failed for ${userId} with status ${response.status}: ${errorText}`,
    );
  }

  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error(`Login for ${userId} did not return Set-Cookie.`);
  }

  return setCookie.split(";")[0] ?? setCookie;
}

export function withSessionCookie(
  cookie: string,
  headers: HeadersInit = {},
): HeadersInit {
  return {
    ...headers,
    Cookie: cookie,
  };
}

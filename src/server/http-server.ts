import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJixiaApp } from './app';
import { bootstrapNativeDemoState } from './demo/bootstrap';
import { handleHttpApiRequest } from './http-api';
import { readRuntimeConfig, type RuntimeConfig, type RuntimeConfigEnv } from './runtime-config';

const DIST_ROOT = resolve(process.cwd(), 'dist');
const INDEX_FILE = resolve(DIST_ROOT, 'index.html');

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

interface LoggerLike {
  info(message: string): void;
}

export interface HttpServerOptions {
  env?: RuntimeConfigEnv;
  logger?: LoggerLike;
}

export interface JixiaHttpServer {
  runtimeConfig: RuntimeConfig;
  server: Server;
}

function hasErrnoCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && typeof error.code === 'string';
}

function loadProjectEnvFile(): void {
  try {
    process.loadEnvFile();
  } catch (error: unknown) {
    if (hasErrnoCode(error) && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

function sendBody(
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  body: Buffer | string,
  method: string,
): void {
  response.writeHead(statusCode, { 'Content-Type': contentType });

  if (method === 'HEAD') {
    response.end();
    return;
  }

  response.end(body);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  method: string,
): void {
  sendBody(
    response,
    statusCode,
    'application/json; charset=utf-8',
    JSON.stringify(payload),
    method,
  );
}

function sendText(
  response: ServerResponse,
  statusCode: number,
  payload: string,
  method: string,
): void {
  sendBody(response, statusCode, 'text/plain; charset=utf-8', payload, method);
}

function serveFile(
  response: ServerResponse,
  filePath: string,
  method: string,
): void {
  const fileExtension = extname(filePath);
  const contentType = CONTENT_TYPES[fileExtension] ?? 'application/octet-stream';
  const fileContent = readFileSync(filePath);

  sendBody(response, 200, contentType, fileContent, method);
}

function resolveAssetPath(pathname: string): string | null {
  const assetPath = resolve(DIST_ROOT, `.${pathname}`);

  return assetPath.startsWith(DIST_ROOT) ? assetPath : null;
}

function shouldServeShell(pathname: string): boolean {
  return !pathname.includes('.') || pathname.endsWith('/');
}

function handleStaticRequest(
  response: ServerResponse,
  pathname: string,
  method: string,
): void {
  if (!existsSync(DIST_ROOT) || !existsSync(INDEX_FILE)) {
    sendText(
      response,
      503,
      'Web build output not found. Run npm run build before starting the lab server.',
      method,
    );
    return;
  }

  const assetPath = resolveAssetPath(pathname);

  if (assetPath && existsSync(assetPath) && statSync(assetPath).isFile()) {
    serveFile(response, assetPath, method);
    return;
  }

  if (shouldServeShell(pathname)) {
    serveFile(response, INDEX_FILE, method);
    return;
  }

  sendText(response, 404, 'Not found', method);
}

export function createHttpServer(options: HttpServerOptions = {}): JixiaHttpServer {
  loadProjectEnvFile();

  const runtimeEnv = options.env ?? process.env;
  const runtimeConfig = readRuntimeConfig(runtimeEnv);
  bootstrapNativeDemoState(runtimeEnv);
  const app = createJixiaApp({ env: runtimeEnv });
  const server = createServer((request, response) => {
    const method = request.method ?? 'GET';

    void (async () => {
      const requestUrl = new URL(request.url ?? '/', `http://${runtimeConfig.host}`);
      const apiResponse = await handleHttpApiRequest(app, request, requestUrl);

      if (apiResponse) {
        sendJson(response, apiResponse.statusCode, apiResponse.payload, method);
        return;
      }

      if (method !== 'GET' && method !== 'HEAD') {
        sendText(response, 405, 'Method not allowed', method);
        return;
      }

      if (requestUrl.pathname === '/health') {
        sendJson(response, 200, app.health.getHealth(), method);
        return;
      }

      handleStaticRequest(response, requestUrl.pathname, method);
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unexpected server error';
      sendJson(response, 500, { error: message }, method);
    });
  });

  return {
    runtimeConfig,
    server,
  };
}

export async function startHttpServer(
  options: HttpServerOptions = {},
): Promise<JixiaHttpServer> {
  const logger = options.logger ?? console;
  const httpServer = createHttpServer(options);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    httpServer.server.once('error', rejectPromise);
    httpServer.server.listen(
      httpServer.runtimeConfig.port,
      httpServer.runtimeConfig.host,
      () => {
        httpServer.server.off('error', rejectPromise);
        resolvePromise();
      },
    );
  });

  logger.info(
    `Jixia server listening on http://${httpServer.runtimeConfig.host}:${httpServer.runtimeConfig.port} with storage root ${httpServer.runtimeConfig.storageRoot} and database ${httpServer.runtimeConfig.databaseUrl}`,
  );

  return httpServer;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void startHttpServer();
}

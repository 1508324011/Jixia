import type {
  CurrentSessionView,
  SpaceRole
} from "@jixia/shared";
import type {
  FastifyInstance,
  FastifyServerOptions
} from "fastify";

import { createApiApp } from "../../app.js";
import { createTestApiApp } from "../../test-utils/app.js";
import { unauthorized } from "../auth/errors.js";
import type { AuthSessionRecord, AuthUserRecord } from "../auth/repository.js";
import type { AuthService, CurrentSessionResult } from "../auth/service.js";
import type { LiteratureDiscoveryService } from "./discovery/discovery.service.js";
import { RecordingImportService } from "./literature.import-routes.test-fixture.js";
import type { LiteratureImportService } from "./literature.import-service.js";
import {
  RecordingDiscoveryService,
  RecordingLiteratureService
} from "./literature.routes.recording-services.js";

export { RecordingDiscoveryService, RecordingLiteratureService } from "./literature.routes.recording-services.js";

const now = new Date("2026-07-17T08:00:00.000Z");

export const literatureTestCookieName = "jixia_literature_test_session";

function currentSessionFor(input: {
  readonly sessionId: string;
  readonly userId: string;
  readonly spaceRole: SpaceRole;
}): CurrentSessionResult {
  const user: AuthUserRecord = {
    id: input.userId,
    email: `${input.userId}@example.test`,
    displayName: input.userId,
    passwordHash: "not-used-in-literature-routes",
    spaceMembers: [
      {
        id: `${input.userId}-space-member`,
        role: input.spaceRole,
        createdAt: now,
        space: { id: "space-1", name: "Jixia Lab" }
      }
    ],
    projectMembers: []
  };
  const session: AuthSessionRecord = {
    id: input.sessionId,
    userId: input.userId,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
    user
  };
  const currentSession: CurrentSessionView = {
    user: {
      id: input.userId,
      email: user.email,
      displayName: user.displayName,
      space: { id: "space-1", name: "Jixia Lab", role: input.spaceRole },
      projectMemberships: []
    },
    expiresAt: session.expiresAt.toISOString()
  };

  return { session, currentSession, renewed: false };
}

function createRouteAuthService(
  session: CurrentSessionResult,
  onCurrentSessionLookup?: () => void
): AuthService {
  return {
    async login() {
      throw new Error("not used");
    },
    async getCurrentSession(sessionId: string) {
      onCurrentSessionLookup?.();
      if (sessionId !== session.session.id) {
        throw unauthorized();
      }

      return session;
    },
    async logout() {},
    async logoutAll() {},
    async createInvitation() {
      throw new Error("not used");
    },
    async acceptInvitation() {
      throw new Error("not used");
    }
  } satisfies AuthService;
}

export async function createLiteratureRouteTestApp(): Promise<{
  readonly app: FastifyInstance;
  readonly discoveryService: RecordingDiscoveryService;
  readonly importService: RecordingImportService;
  readonly service: RecordingLiteratureService;
}> {
  const session = currentSessionFor({
    sessionId: "session-user-1",
    userId: "user-1",
    spaceRole: "SpaceMember"
  });
  const service = new RecordingLiteratureService();
  const discoveryService = new RecordingDiscoveryService();
  const importService = new RecordingImportService();
  const app = await createTestApiApp({
    literature: {
      authService: createRouteAuthService(session),
      discoveryService,
      importService,
      literatureService: service,
      sessionCookieName: literatureTestCookieName
    }
  });

  return { app, discoveryService, importService, service };
}

export async function createInjectedLiteratureDiscoveryRouteApp(
  discoveryService: LiteratureDiscoveryService,
  logger: FastifyServerOptions["logger"] = false
): Promise<{
  readonly app: FastifyInstance;
  readonly literatureService: RecordingLiteratureService;
}> {
  const session = currentSessionFor({
    sessionId: "session-user-1",
    userId: "user-1",
    spaceRole: "SpaceMember"
  });
  const literatureService = new RecordingLiteratureService();
  const app = createApiApp({
    literature: {
      authService: createRouteAuthService(session),
      discoveryService,
      literatureService,
      sessionCookieName: literatureTestCookieName
    },
    logger
  });
  await app.ready();
  return { app, literatureService };
}

export async function createInjectedLiteratureImportRouteApp(
  importService: LiteratureImportService,
  logger: FastifyServerOptions["logger"] = false,
  onCurrentSessionLookup?: () => void
): Promise<FastifyInstance> {
  const session = currentSessionFor({
    sessionId: "session-user-1",
    userId: "user-1",
    spaceRole: "SpaceMember"
  });
  const app = createApiApp({
    literature: {
      authService: createRouteAuthService(session, onCurrentSessionLookup),
      importService,
      sessionCookieName: literatureTestCookieName
    },
    logger
  });
  await app.ready();
  return app;
}

import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import { aiRoutes, type AIRoutesOptions } from "./modules/ai/ai.routes.js";
import { auditRoutes, type AuditRoutesOptions } from "./modules/audit/audit.routes.js";
import { attachmentRoutes, type AttachmentRoutesOptions } from "./modules/attachments/attachment.routes.js";
import { authRoutes, type AuthRoutesOptions } from "./modules/auth/routes.js";
import { documentRoutes, type DocumentRoutesOptions } from "./modules/documents/document.routes.js";
import { projectRoutes, type ProjectRoutesOptions } from "./modules/projects/project.routes.js";
import { cookiePlugin } from "./plugins/cookies.js";
import { healthRoutes } from "./routes/health.js";

export type CreateApiAppOptions = {
  readonly ai?: AIRoutesOptions;
  readonly audit?: AuditRoutesOptions;
  readonly attachments?: AttachmentRoutesOptions;
  readonly auth?: AuthRoutesOptions;
  readonly documents?: DocumentRoutesOptions;
  readonly logger?: FastifyServerOptions["logger"];
  readonly projects?: ProjectRoutesOptions;
};

export function createApiApp(options: CreateApiAppOptions = {}): FastifyInstance {
  const app = Fastify({
    disableRequestLogging: true,
    logger: options.logger ?? false
  });

  app.register(cookiePlugin);
  app.register(authRoutes, options.auth ?? {});
  app.register(projectRoutes, options.projects ?? {});
  app.register(documentRoutes, options.documents ?? {});
  app.register(attachmentRoutes, options.attachments ?? {});
  app.register(aiRoutes, options.ai ?? {});
  app.register(auditRoutes, options.audit ?? {});
  app.register(healthRoutes);

  return app;
}

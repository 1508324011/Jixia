import { createPrismaLiteratureRepository } from "./literature.prisma-repository.js";
import { createLiteratureLibraryCursorCodec } from "./literature.library-cursor.js";
import { loadLiteratureProviderConfig } from "./discovery/provider-config.js";
import {
  createLiteratureService,
  type LiteratureService
} from "./literature.service.js";

let defaultLiteratureService: LiteratureService | null = null;

export async function getDefaultLiteratureService(): Promise<LiteratureService> {
  if (defaultLiteratureService) {
    return defaultLiteratureService;
  }

  const { prisma } = await import("@jixia/db");
  const cursorConfig = loadLiteratureProviderConfig(process.env).cursor;
  defaultLiteratureService = createLiteratureService(
    createPrismaLiteratureRepository(prisma),
    cursorConfig.status === "enabled"
      ? { libraryCursorCodec: createLiteratureLibraryCursorCodec({ secret: cursorConfig.secret }) }
      : {}
  );
  return defaultLiteratureService;
}

import type { AuthService } from "./service.js";

let cachedService: AuthService | undefined;

export async function getDefaultAuthService(): Promise<AuthService> {
  if (!cachedService) {
    const [{ prisma }, { PrismaAuthRepository }, { createAuthService }] = await Promise.all([
      import("@jixia/db"),
      import("./prisma-repository.js"),
      import("./service.js")
    ]);

    cachedService = createAuthService(new PrismaAuthRepository(prisma));
  }

  return cachedService;
}

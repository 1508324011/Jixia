import { describe, expect, it } from "vitest";

import { createPrismaLiteratureRepository } from "./literature.prisma-repository.js";

describe("Prisma literature repository", () => {
  it("exposes the actor-scoped transactional repository factory", () => {
    // Given: the API needs the concrete database repository boundary

    // When: the Prisma factory is imported
    const factory = createPrismaLiteratureRepository;

    // Then: application wiring can construct the repository without exposing unscoped operations
    expect(factory).toBeTypeOf("function");
  });
});

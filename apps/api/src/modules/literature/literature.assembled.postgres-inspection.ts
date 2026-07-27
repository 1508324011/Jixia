import type { PrismaClient } from "@jixia/db";

export const rawProviderPersistenceFragments = [
  "abstract_inverted_index",
  "message-type",
  "esearchresult",
  "querytranslation"
] as const;

export async function readLiteraturePersistenceCounts(prisma: PrismaClient) {
  const [
    annotation,
    assertion,
    assertionAuthor,
    assertionIdentifier,
    assertionOpenAccess,
    assertionPublisher,
    auditEvent,
    citationOccurrence,
    evidence,
    excerpt,
    importOperation,
    literature,
    literatureIdentity,
    providerRecord,
    relationAssertion,
    sourceRevision
  ] = await prisma.$transaction([
    prisma.annotation.count(),
    prisma.assertion.count(),
    prisma.assertionAuthor.count(),
    prisma.assertionIdentifier.count(),
    prisma.assertionOpenAccess.count(),
    prisma.assertionPublisher.count(),
    prisma.auditEvent.count(),
    prisma.citationOccurrence.count(),
    prisma.evidence.count(),
    prisma.excerpt.count(),
    prisma.importOperation.count(),
    prisma.literature.count(),
    prisma.literatureIdentity.count(),
    prisma.providerRecord.count(),
    prisma.relationAssertion.count(),
    prisma.sourceRevision.count()
  ]);
  return {
    annotation,
    assertion,
    assertionAuthor,
    assertionIdentifier,
    assertionOpenAccess,
    assertionPublisher,
    auditEvent,
    citationOccurrence,
    evidence,
    excerpt,
    importOperation,
    literature,
    literatureIdentity,
    providerRecord,
    relationAssertion,
    sourceRevision
  };
}

export async function serializeLiteraturePersistence(
  prisma: PrismaClient,
  literatureId: string
): Promise<string> {
  const [literature, identities, providers, assertions, authors, identifiers, openAccess, publisher] =
    await prisma.$transaction([
      prisma.literature.findUniqueOrThrow({ where: { id: literatureId } }),
      prisma.literatureIdentity.findMany({ where: { literatureId } }),
      prisma.providerRecord.findMany({ where: { literatureId } }),
      prisma.assertion.findMany({ where: { literatureId } }),
      prisma.assertionAuthor.findMany({ where: { literatureId } }),
      prisma.assertionIdentifier.findMany({ where: { literatureId } }),
      prisma.assertionOpenAccess.findMany({ where: { literatureId } }),
      prisma.assertionPublisher.findMany({ where: { literatureId } })
    ]);
  return JSON.stringify({
    literature,
    identities,
    providers,
    assertions,
    authors,
    identifiers,
    openAccess,
    publisher
  });
}

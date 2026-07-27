import type { PrismaClient } from "@jixia/db";
import {
  canonicalAssertionKinds,
  type CreateLiteratureImportResponse,
  type GetLiteratureResponse,
  type ImportOperationDTO,
  type ListLiteratureResponse,
  type LiteratureDiscoverySearchResponse,
  type RetryLiteratureImportOperationResponse
} from "@jixia/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createLiteratureAssembledHttpPostgresFixture,
  type LiteratureAssembledHttpPostgresFixture
} from "./literature.assembled.http.postgres-fixture.js";
import {
  rawProviderPersistenceFragments,
  readLiteraturePersistenceCounts,
  serializeLiteraturePersistence
} from "./literature.assembled.postgres-inspection.js";
import {
  fixtureDoi,
  fixtureProviderError,
  pubmedNoDoiFixtureWork
} from "./literature.import-provider.test-fixture.js";
import { requireLiteraturePostgresEnvironment } from "./literature.postgres-environment.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";
const runPrefix = `t25e${process.pid}${Date.now()}`;
let fixture: LiteratureAssembledHttpPostgresFixture | undefined;
let prisma: PrismaClient | undefined;

function requireFixture(): LiteratureAssembledHttpPostgresFixture {
  if (fixture === undefined) {
    throw new Error("Assembled literature PostgreSQL fixture is not configured");
  }
  return fixture;
}

function requirePrisma(): PrismaClient {
  if (prisma === undefined) {
    throw new Error("Assembled literature PostgreSQL client is not connected");
  }
  return prisma;
}

function requireLiteratureId(operation: ImportOperationDTO): string {
  if (operation.literatureId === null) {
    throw new Error("Succeeded assembled import is missing Literature");
  }
  return operation.literatureId;
}

describe.skipIf(!runPostgresIntegration)("assembled literature HTTP PostgreSQL behavior", () => {
  beforeAll(async () => {
    requireLiteraturePostgresEnvironment();
    const database = await import("@jixia/db");
    prisma = database.prisma;
    fixture = await createLiteratureAssembledHttpPostgresFixture(database.prisma, runPrefix);
  });

  afterAll(async () => {
    await fixture?.app.close();
    await prisma?.$disconnect();
  });

  it("searches every raw fixture provider without changing any literature or audit count", async () => {
    const setup = requireFixture();
    const database = requirePrisma();
    const before = await readLiteraturePersistenceCounts(database);

    const response = await setup.app.inject({
      method: "POST",
      url: "/literature/discovery/search",
      headers: { cookie: setup.cookies.owner },
      payload: { query: "glioblastoma", limit: 6 }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<LiteratureDiscoverySearchResponse>();
    expect(body.candidates[0]).toMatchObject({ doi: "10.1000/alpha" });
    expect(body.providerStatuses.map(({ providerKey }) => providerKey)).toEqual([
      "openalex", "crossref", "pubmed"
    ]);
    const openalexUrl = new URL(setup.discovery.openalex.fetchImplementation.mock.calls[0]?.[0] ?? "https://invalid.test");
    const crossrefUrl = new URL(setup.discovery.crossref.fetchImplementation.mock.calls[0]?.[0] ?? "https://invalid.test");
    const pubmedUrl = new URL(setup.discovery.pubmed.fetchImplementation.mock.calls[0]?.[0] ?? "https://invalid.test");
    expect(openalexUrl.searchParams.get("search")).toBe("glioblastoma");
    expect(crossrefUrl.searchParams.get("query.bibliographic")).toBe("glioblastoma");
    expect(pubmedUrl.searchParams.get("term")).toBe("glioblastoma");
    expect(setup.discovery.pubmed.fetchImplementation).toHaveBeenCalledTimes(2);
    expect(await readLiteraturePersistenceCounts(database)).toEqual(before);
  });

  it("rejects an invalid discovery cursor before any provider fixture call", async () => {
    const setup = requireFixture();
    const calls = [
      setup.discovery.openalex.fetchImplementation.mock.calls.length,
      setup.discovery.crossref.fetchImplementation.mock.calls.length,
      setup.discovery.pubmed.fetchImplementation.mock.calls.length
    ];

    const response = await setup.app.inject({
      method: "POST",
      url: "/literature/discovery/search",
      headers: { cookie: setup.cookies.owner },
      payload: { query: "glioblastoma", limit: 6, cursor: "not-a-signed-cursor" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_cursor" });
    expect([
      setup.discovery.openalex.fetchImplementation.mock.calls.length,
      setup.discovery.crossref.fetchImplementation.mock.calls.length,
      setup.discovery.pubmed.fetchImplementation.mock.calls.length
    ]).toEqual(calls);
  });

  it("imports a normalized personal aggregate and excludes raw and audit-sensitive values", async () => {
    const setup = requireFixture();
    const database = requirePrisma();
    const idempotencyKey = "29b3dc84-1f51-41d5-9bd8-0cab8e900001";

    const imported = await setup.app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: { cookie: setup.cookies.owner, "idempotency-key": idempotencyKey },
      payload: { target: { scope: "personal" }, seed: { providerKey: "openalex", recordKey: "W1" } }
    });
    const operation = imported.json<CreateLiteratureImportResponse>().operation;
    const literatureId = requireLiteratureId(operation);
    const operationRead = await setup.app.inject({
      method: "GET",
      url: `/literature/imports/${operation.id}`,
      headers: { cookie: setup.cookies.owner }
    });
    const listing = await setup.app.inject({
      method: "GET",
      url: "/literature?scope=personal&limit=20",
      headers: { cookie: setup.cookies.owner }
    });
    const detail = await setup.app.inject({
      method: "GET",
      url: `/literature/${literatureId}`,
      headers: { cookie: setup.cookies.owner }
    });

    expect([imported.statusCode, operationRead.statusCode, listing.statusCode, detail.statusCode]).toEqual([201, 200, 200, 200]);
    expect(operation).toMatchObject({ status: "succeeded", attemptCount: 1 });
    expect(listing.json<ListLiteratureResponse>().literature.map(({ id }) => id)).toContain(literatureId);
    expect(detail.json<GetLiteratureResponse>().projection.doi.current?.value).toBe(fixtureDoi);
    const assertions = await database.assertion.findMany({
      where: { literatureId },
      select: { kind: true, textValue: true, integerValue: true, structuredItemCount: true }
    });
    expect(new Set(assertions.map(({ kind }) => kind))).toEqual(
      new Set(canonicalAssertionKinds)
    );
    expect(assertions.every((item) => [item.textValue, item.integerValue, item.structuredItemCount]
      .filter((value) => value !== null).length === 1)).toBe(true);
    const persisted = await serializeLiteraturePersistence(database, literatureId);
    for (const fragment of rawProviderPersistenceFragments) {
      expect(persisted).not.toContain(fragment);
    }
    const audits = await database.auditEvent.findMany({ where: { targetId: operation.id } });
    const auditText = JSON.stringify(audits);
    for (const forbidden of [idempotencyKey, "W1", fixtureDoi, "https://"]) {
      expect(auditText).not.toContain(forbidden);
    }
    await database.auditEvent.create({
      data: {
        actorUserId: setup.ids.ownerUserId,
        action: "project.updated",
        targetType: "Project",
        targetId: setup.ids.projectId,
        metadata: { outcome: "updated" }
      }
    });
    const visibleAudits = await setup.app.inject({
      method: "GET",
      url: "/audit/events?limit=100",
      headers: { cookie: setup.cookies.admin }
    });
    const visibleActions = visibleAudits.json<{ readonly events: readonly { readonly action: string }[] }>()
      .events.map(({ action }) => action);
    expect(visibleAudits.statusCode).toBe(200);
    expect(visibleActions).toContain("project.updated");
    expect(visibleActions.some((action) => action.startsWith("literature."))).toBe(false);
  });

  it("converges concurrent project imports through the assembled HTTP service", async () => {
    const setup = requireFixture();
    setup.armImportFinalizationRace();
    const requests = [
      setup.app.inject({
        method: "POST",
        url: "/literature/imports",
        headers: { cookie: setup.cookies.owner, "idempotency-key": "29b3dc84-1f51-41d5-9bd8-0cab8e900002" },
        payload: { target: { scope: "project", projectId: setup.ids.projectId }, seed: { providerKey: "openalex", recordKey: "W1" } }
      }),
      setup.app.inject({
        method: "POST",
        url: "/literature/imports",
        headers: { cookie: setup.cookies.editor, "idempotency-key": "29b3dc84-1f51-41d5-9bd8-0cab8e900003" },
        payload: { target: { scope: "project", projectId: setup.ids.projectId }, seed: { providerKey: "crossref", recordKey: fixtureDoi } }
      })
    ];

    const responses = await Promise.all(requests);
    const operations = responses.map((response) => response.json<CreateLiteratureImportResponse>().operation);

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([201, 201]);
    expect(operations.every(({ status }) => status === "succeeded")).toBe(true);
    expect(new Set(operations.map(({ literatureId }) => literatureId)).size).toBe(1);
    expect(await requirePrisma().literature.count({ where: { projectId: setup.ids.projectId } })).toBe(1);
  });

  it("lets a viewer read while denying mutation, hiding inaccessible scope, and supporting explicit retry", async () => {
    const setup = requireFixture();
    setup.importProviders.pubmedSeedError = fixtureProviderError("pubmed", "timeout");
    const failed = await setup.app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: { cookie: setup.cookies.editor, "idempotency-key": "29b3dc84-1f51-41d5-9bd8-0cab8e900004" },
      payload: { target: { scope: "project", projectId: setup.ids.projectId }, seed: { providerKey: "pubmed", recordKey: "99" } }
    });
    const failedOperation = failed.json<CreateLiteratureImportResponse>().operation;
    const viewerRead = await setup.app.inject({ method: "GET", url: `/literature/imports/${failedOperation.id}`, headers: { cookie: setup.cookies.viewer } });
    const callsBeforeDeniedWrites = setup.importProviders.calls.length;
    const viewerImport = await setup.app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: { cookie: setup.cookies.viewer, "idempotency-key": "29b3dc84-1f51-41d5-9bd8-0cab8e900005" },
      payload: { target: { scope: "project", projectId: setup.ids.projectId }, seed: { providerKey: "openalex", recordKey: "W1" } }
    });
    const viewerRetry = await setup.app.inject({ method: "POST", url: `/literature/imports/${failedOperation.id}/retry`, headers: { cookie: setup.cookies.viewer } });
    const hiddenOperation = await setup.app.inject({ method: "GET", url: `/literature/imports/${failedOperation.id}`, headers: { cookie: setup.cookies.missingMember } });
    const hiddenLibrary = await setup.app.inject({ method: "GET", url: `/literature?scope=project&projectId=${setup.ids.projectId}`, headers: { cookie: setup.cookies.missingMember } });
    expect(setup.importProviders.calls).toHaveLength(callsBeforeDeniedWrites);
    setup.importProviders.pubmedSeed = {
      ...pubmedNoDoiFixtureWork,
      source: { providerKey: "pubmed", recordKey: "99" },
      identifiers: [{ scheme: "pmid", value: "99" }]
    };
    setup.importProviders.pubmedSeedError = null;
    const retried = await setup.app.inject({ method: "POST", url: `/literature/imports/${failedOperation.id}/retry`, headers: { cookie: setup.cookies.editor } });
    const retriedOperation = retried.json<RetryLiteratureImportOperationResponse>().operation;
    const retriedLiteratureId = requireLiteratureId(retriedOperation);
    const viewerLibrary = await setup.app.inject({ method: "GET", url: `/literature?scope=project&projectId=${setup.ids.projectId}&limit=20`, headers: { cookie: setup.cookies.viewer } });
    const viewerDetail = await setup.app.inject({ method: "GET", url: `/literature/${retriedLiteratureId}`, headers: { cookie: setup.cookies.viewer } });
    const invalidCursor = await setup.app.inject({ method: "GET", url: `/literature?scope=project&projectId=${setup.ids.projectId}&cursor=invalid`, headers: { cookie: setup.cookies.viewer } });

    expect(failedOperation).toMatchObject({ status: "failed", failureCode: "seed_unavailable" });
    expect(viewerRead.statusCode).toBe(200);
    expect([viewerImport.statusCode, viewerRetry.statusCode]).toEqual([403, 403]);
    expect(setup.importProviders.calls).toHaveLength(callsBeforeDeniedWrites + 1);
    expect([hiddenOperation.statusCode, hiddenLibrary.statusCode]).toEqual([404, 404]);
    expect(retriedOperation).toMatchObject({ status: "succeeded", attemptCount: 2 });
    expect(viewerLibrary.statusCode).toBe(200);
    expect(viewerDetail.statusCode).toBe(200);
    expect(invalidCursor.statusCode).toBe(400);
  });
});

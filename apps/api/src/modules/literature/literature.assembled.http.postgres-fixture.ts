import type { PrismaClient } from "@jixia/db";

import { createAuditService, PrismaAuditRepository } from "../audit/audit.service.js";
import {
  createCrossrefTestAdapter,
  crossrefJsonResponse,
  readCrossrefFixture,
  type CrossrefTestAdapter
} from "./discovery/crossref/crossref.test-fixture.js";
import { createDiscoveryTestCodec, discoveryTestNowMs } from "./discovery/discovery.test-fixture.js";
import { createLiteratureDiscoveryService } from "./discovery/discovery.service.js";
import {
  createNcbiTestService,
  ncbiJsonResponse,
  readNcbiFixture,
  type NcbiTestService
} from "./discovery/ncbi/ncbi.test-fixture.js";
import {
  createOpenAlexTestAdapter,
  openAlexJsonResponse,
  readOpenAlexFixture,
  type OpenAlexTestAdapter
} from "./discovery/openalex/openalex.test-fixture.js";
import {
  createLiteratureHttpPostgresFixture,
  type LiteratureHttpPostgresFixture
} from "./literature.http.postgres-fixture.js";
import { FixtureImportProviders } from "./literature.import-provider.test-fixture.js";
import type { LiteratureImportRepository } from "./literature.import-repository.js";
import { createLiteratureImportService } from "./literature.import-service.js";
import { createPrismaLiteratureImportRepository } from "./literature.prisma-import-repository.js";

export type LiteratureAssembledHttpPostgresFixture = LiteratureHttpPostgresFixture & {
  readonly discovery: {
    readonly crossref: CrossrefTestAdapter;
    readonly openalex: OpenAlexTestAdapter;
    readonly pubmed: NcbiTestService;
  };
  readonly armImportFinalizationRace: () => void;
  readonly importProviders: FixtureImportProviders;
};

export type LiteratureAssembledPostgresListener = {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
};

class ImportFinalizationBarrier {
  private pending: Promise<void> = Promise.resolve();
  private release: (() => void) | undefined;
  private waiting = 0;

  arm(): void {
    this.waiting = 0;
    this.pending = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  async wait(): Promise<void> {
    const release = this.release;
    if (release === undefined) {
      return;
    }
    this.waiting += 1;
    if (this.waiting === 2) {
      this.release = undefined;
      release();
    }
    await this.pending;
  }
}

class BarrierLiteratureImportRepository implements LiteratureImportRepository {
  private readonly finalization = new ImportFinalizationBarrier();

  constructor(private readonly delegate: LiteratureImportRepository) {}

  armFinalizationRace(): void {
    this.finalization.arm();
  }

  admitImport(input: Parameters<LiteratureImportRepository["admitImport"]>[0]) {
    return this.delegate.admitImport(input);
  }

  getImportOperation(input: Parameters<LiteratureImportRepository["getImportOperation"]>[0]) {
    return this.delegate.getImportOperation(input);
  }

  retryImport(input: Parameters<LiteratureImportRepository["retryImport"]>[0]) {
    return this.delegate.retryImport(input);
  }

  async finalizeImport(input: Parameters<LiteratureImportRepository["finalizeImport"]>[0]) {
    await this.finalization.wait();
    return this.delegate.finalizeImport(input);
  }

  failImport(input: Parameters<LiteratureImportRepository["failImport"]>[0]) {
    return this.delegate.failImport(input);
  }
}

export async function createLiteratureAssembledHttpPostgresFixture(
  prisma: PrismaClient,
  prefix: string
): Promise<LiteratureAssembledHttpPostgresFixture> {
  const [openalexBody, crossrefBody, pubmedSearchBody, pubmedSummaryBody] = await Promise.all([
    readOpenAlexFixture("search-rich.json"),
    readCrossrefFixture("search-rich.json"),
    readNcbiFixture("esearch-page-0.json"),
    readNcbiFixture("esummary-page-0.json")
  ]);
  const openalex = createOpenAlexTestAdapter([
    () => openAlexJsonResponse(openalexBody)
  ]);
  const crossref = createCrossrefTestAdapter([
    () => crossrefJsonResponse(crossrefBody)
  ]);
  const pubmed = createNcbiTestService([
    () => ncbiJsonResponse(pubmedSearchBody),
    () => ncbiJsonResponse(pubmedSummaryBody)
  ]);
  const discoveryService = createLiteratureDiscoveryService({
    adapters: {
      openalex: openalex.adapter,
      crossref: crossref.adapter,
      pubmed: pubmed.adapters.pubmed
    },
    cursorCodec: createDiscoveryTestCodec(),
    now: () => discoveryTestNowMs
  });
  const importProviders = new FixtureImportProviders();
  const importRepository = new BarrierLiteratureImportRepository(
    createPrismaLiteratureImportRepository(prisma)
  );
  const importService = createLiteratureImportService({
    repository: importRepository,
    providers: importProviders.adapters
  });
  const fixture = await createLiteratureHttpPostgresFixture(prisma, prefix, {
    auditService: createAuditService(new PrismaAuditRepository(prisma)),
    discoveryService,
    importService
  });
  return {
    ...fixture,
    armImportFinalizationRace: () => importRepository.armFinalizationRace(),
    discovery: { crossref, openalex, pubmed },
    importProviders
  };
}

export async function startLiteratureAssembledPostgresListener(
  fixture: LiteratureAssembledHttpPostgresFixture
): Promise<LiteratureAssembledPostgresListener> {
  const baseUrl = await fixture.app.listen({ host: "127.0.0.1", port: 0 });
  return { baseUrl, close: () => fixture.app.close() };
}

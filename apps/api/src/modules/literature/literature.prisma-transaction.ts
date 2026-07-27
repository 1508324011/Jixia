import type { Prisma } from "@jixia/db";
import type { LiteratureAssertionDTO, LiteratureAssertionInput } from "@jixia/shared";

import {
  toAssertionCreateData
} from "./literature.prisma-mappers.js";
import {
  listCanonicalAssertions,
  listLiteratureLibraryPage
} from "./literature.prisma-read.js";
import type {
  LiteratureLibraryRecord,
  LiteratureListAnchor,
  LiteratureListScope,
  LiteratureRecord,
  ProviderRecord
} from "./literature.repository.js";
import type { StoredCanonicalLiteratureAssertion } from "./literature.stored-assertion.js";
import {
  findLockedLiterature,
  findLockedProjectAccess
} from "./literature.prisma-access.js";
import type {
  LiteratureAccessContext,
  LiteratureAuditEventInput,
  LiteratureTransaction,
  ProjectAccessScope
} from "./literature.transactional-repository.js";

const literatureSelect = {
  id: true,
  ownerUserId: true,
  projectId: true,
  createdByUserId: true,
  createdAt: true
} satisfies Prisma.LiteratureSelect;

const providerRecordSelect = {
  id: true,
  literatureId: true,
  providerKey: true,
  recordKey: true,
  createdByUserId: true,
  createdAt: true
} satisfies Prisma.ProviderRecordSelect;

export class PrismaLiteratureTransaction implements LiteratureTransaction {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  async findProjectAccess(input: {
    readonly projectId: string;
    readonly userId: string;
    readonly mode: "read" | "mutation";
  }): Promise<ProjectAccessScope | null> {
    if (input.mode === "mutation") {
      return findLockedProjectAccess(this.transaction, input);
    }

    const project = await this.transaction.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, spaceId: true }
    });
    if (project === null) {
      return null;
    }

    const [spaceMember, projectMember] = await Promise.all([
      this.transaction.spaceMember.findUnique({
        where: { spaceId_userId: { spaceId: project.spaceId, userId: input.userId } },
        select: { userId: true }
      }),
      this.transaction.projectMember.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: input.userId } },
        select: { role: true }
      })
    ]);

    return {
      kind: "project",
      projectId: project.id,
      projectSpaceId: project.spaceId,
      activeSpaceMember: spaceMember !== null,
      projectRole: projectMember?.role ?? null
    };
  }

  async findLiteratureAccess(input: {
    readonly literatureId: string;
    readonly userId: string;
    readonly mode: "read" | "mutation";
  }): Promise<LiteratureAccessContext | null> {
    const literature =
      input.mode === "mutation"
        ? await findLockedLiterature(this.transaction, input.literatureId)
        : await this.transaction.literature.findUnique({
            where: { id: input.literatureId },
            select: literatureSelect
          });
    if (literature === null) {
      return null;
    }
    if (literature.ownerUserId !== null && literature.projectId === null) {
      return {
        literature,
        scope: { kind: "personal", ownerUserId: literature.ownerUserId }
      };
    }
    if (literature.ownerUserId === null && literature.projectId !== null) {
      const scope = await this.findProjectAccess({
        projectId: literature.projectId,
        userId: input.userId,
        mode: input.mode
      });
      return scope === null ? null : { literature, scope };
    }
    return null;
  }

  async createLiterature(input: {
    readonly ownerUserId: string | null;
    readonly projectId: string | null;
    readonly createdByUserId: string;
  }): Promise<LiteratureRecord> {
    return this.transaction.literature.create({
      data: input,
      select: literatureSelect
    });
  }

  async allocateAssertionOrdinals(input: {
    readonly literatureId: string;
    readonly count: number;
  }): Promise<number> {
    const literature = await this.transaction.literature.update({
      where: { id: input.literatureId },
      data: { nextAssertionOrdinal: { increment: input.count } },
      select: { nextAssertionOrdinal: true }
    });
    return literature.nextAssertionOrdinal - input.count;
  }

  async findProviderRecord(input: {
    readonly literatureId: string;
    readonly provider: { readonly providerKey: string; readonly recordKey: string };
  }): Promise<ProviderRecord | null> {
    return this.transaction.providerRecord.findUnique({
      where: {
        literatureId_providerKey_recordKey: {
          literatureId: input.literatureId,
          providerKey: input.provider.providerKey,
          recordKey: input.provider.recordKey
        }
      },
      select: providerRecordSelect
    });
  }

  async createProviderRecord(input: {
    readonly literatureId: string;
    readonly provider: { readonly providerKey: string; readonly recordKey: string };
    readonly createdByUserId: string;
  }): Promise<ProviderRecord> {
    return this.transaction.providerRecord.create({
      data: {
        literatureId: input.literatureId,
        providerKey: input.provider.providerKey,
        recordKey: input.provider.recordKey,
        createdByUserId: input.createdByUserId
      },
      select: providerRecordSelect
    });
  }

  async createAssertion(input: {
    readonly literatureId: string;
    readonly providerRecordId: string;
    readonly createdByUserId: string;
    readonly ordinal: number;
    readonly assertion: LiteratureAssertionInput;
  }): Promise<LiteratureAssertionDTO> {
    const assertion = await this.transaction.assertion.create({
      data: toAssertionCreateData(input),
      select: { id: true, providerRecordId: true, ordinal: true }
    });
    return toAssertionDto(assertion, input.assertion);
  }

  async listProviderRecords(input: {
    readonly literatureId: string;
  }): Promise<readonly ProviderRecord[]> {
    return this.transaction.providerRecord.findMany({
      where: { literatureId: input.literatureId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: providerRecordSelect
    });
  }

  async listAssertions(input: {
    readonly literatureId: string;
  }): Promise<readonly StoredCanonicalLiteratureAssertion[]> {
    return listCanonicalAssertions(this.transaction, input.literatureId);
  }

  async listLiteraturePage(input: {
    readonly userId: string;
    readonly scope: LiteratureListScope;
    readonly limit: number;
    readonly anchor: LiteratureListAnchor | null;
  }): Promise<readonly LiteratureLibraryRecord[]> {
    return listLiteratureLibraryPage(this.transaction, input);
  }

  async writeAuditEvent(input: LiteratureAuditEventInput): Promise<void> {
    await this.transaction.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.payload
      },
      select: { id: true }
    });
  }
}

function toAssertionDto(
  record: { readonly id: string; readonly providerRecordId: string; readonly ordinal: number },
  assertion: LiteratureAssertionInput
): LiteratureAssertionDTO {
  const provenance = {
    assertionId: record.id,
    providerRecordId: record.providerRecordId,
    ordinal: record.ordinal
  };
  switch (assertion.kind) {
    case "title":
    case "abstract":
    case "doi":
      return { ...provenance, kind: assertion.kind, value: assertion.value };
    case "publicationYear":
      return { ...provenance, kind: assertion.kind, value: assertion.value };
    default: {
      const unreachable: never = assertion;
      throw unreachable;
    }
  }
}

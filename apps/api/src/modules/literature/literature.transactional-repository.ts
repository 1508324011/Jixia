import { ensureMetadataOnlyAuditPayload } from "../audit/audit.service.js";
import {
  appendAssertionsAuditMetadata,
  createLiteratureAuditMetadata
} from "./literature.prisma-mappers.js";
import {
  authorizeLiteratureAccess,
  type AppendLiteratureRepositoryInput,
  type AppendLiteratureRepositoryResult,
  type CreateLiteratureRepositoryInput,
  type LiteratureActor,
  type LiteratureLibraryRecord,
  type LiteratureListAnchor,
  type LiteratureListScope,
  type LiteratureRecord,
  type LiteratureRepository,
  type LiteratureSnapshot
} from "./literature.repository.js";
import { LiteratureError } from "./literature.service.js";
import type {
  LiteratureAccessContext,
  LiteratureTransaction,
  LiteratureTransactionRunner,
  PersonalAccessScope,
  ProjectAccessScope
} from "./literature.transaction.js";

export type {
  LiteratureAccessContext,
  LiteratureAuditEventInput,
  LiteratureTransaction,
  LiteratureTransactionRunner,
  ProjectAccessScope
} from "./literature.transaction.js";

export class TransactionalLiteratureRepository implements LiteratureRepository {
  constructor(private readonly runner: LiteratureTransactionRunner) {}

  async createLiterature(input: CreateLiteratureRepositoryInput): Promise<LiteratureRecord> {
    return this.runner.run(async (transaction) => {
      if (input.scope.kind === "personal") {
        const literature = await transaction.createLiterature({
          ownerUserId: input.actor.userId,
          projectId: null,
          createdByUserId: input.actor.userId
        });
        await writeCreateAudit(transaction, literature, {
          kind: "personal",
          ownerUserId: input.actor.userId
        });
        return literature;
      }

      const projectScope = await transaction.findProjectAccess({
        projectId: input.scope.projectId,
        userId: input.actor.userId,
        mode: "mutation"
      });
      if (projectScope === null) {
        throw notFound();
      }
      ensureAccess(
        authorizeLiteratureAccess({ operation: "create", actor: input.actor, scope: projectScope })
      );

      const literature = await transaction.createLiterature({
        ownerUserId: null,
        projectId: input.scope.projectId,
        createdByUserId: input.actor.userId
      });
      await writeCreateAudit(transaction, literature, {
        kind: "project",
        projectId: input.scope.projectId
      });
      return literature;
    });
  }

  async appendLiteratureAssertions(
    input: AppendLiteratureRepositoryInput
  ): Promise<AppendLiteratureRepositoryResult> {
    return this.runner.run(async (transaction) => {
      const context = await requireLiteratureAccess(
        transaction,
        input.literatureId,
        input.actor.userId,
        "mutation"
      );
      ensureAccess(authorizeExistingLiterature("append", input.actor, context.scope));

      const firstOrdinal = await transaction.allocateAssertionOrdinals({
        literatureId: input.literatureId,
        count: input.assertions.length
      });
      const existingProvider = await transaction.findProviderRecord({
        literatureId: input.literatureId,
        provider: input.provider
      });
      const providerRecord =
        existingProvider ??
        (await transaction.createProviderRecord({
          literatureId: input.literatureId,
          provider: input.provider,
          createdByUserId: input.actor.userId
        }));
      const assertions = await Promise.all(
        input.assertions.map((assertion, index) =>
          transaction.createAssertion({
            literatureId: input.literatureId,
            providerRecordId: providerRecord.id,
            createdByUserId: input.actor.userId,
            ordinal: firstOrdinal + index,
            assertion
          })
        )
      );
      const payload = appendAssertionsAuditMetadata({
        literatureId: input.literatureId,
        providerRecordId: providerRecord.id,
        assertionKinds: input.assertions.map((assertion) => assertion.kind),
        firstOrdinal
      });
      ensureMetadataOnlyAuditPayload(payload);
      await transaction.writeAuditEvent({
        actorUserId: input.actor.userId,
        action: "literature.assertions_appended",
        targetType: "Literature",
        targetId: input.literatureId,
        payload
      });
      return { literatureId: input.literatureId, providerRecord, assertions };
    });
  }

  async getLiteratureSnapshot(input: {
    readonly actor: CreateLiteratureRepositoryInput["actor"];
    readonly literatureId: string;
  }): Promise<LiteratureSnapshot> {
    return this.runner.run(
      async (transaction) => {
        const context = await requireLiteratureAccess(
          transaction,
          input.literatureId,
          input.actor.userId,
          "read"
        );
        ensureAccess(authorizeExistingLiterature("read", input.actor, context.scope));
        const [providerRecords, assertions] = await Promise.all([
          transaction.listProviderRecords({ literatureId: input.literatureId }),
          transaction.listAssertions({ literatureId: input.literatureId })
        ]);
        return { literature: context.literature, providerRecords, assertions };
      },
      { isolationLevel: "RepeatableRead" }
    );
  }

  async listLiteraturePage(input: {
    readonly actor: LiteratureActor;
    readonly scope: LiteratureListScope;
    readonly limit: number;
    readonly anchor: LiteratureListAnchor | null;
  }): Promise<readonly LiteratureLibraryRecord[]> {
    return this.runner.run(
      async (transaction) => {
        if (input.scope.kind === "project") {
          const projectScope = await transaction.findProjectAccess({
            projectId: input.scope.projectId,
            userId: input.actor.userId,
            mode: "read"
          });
          if (projectScope === null) {
            throw notFound();
          }
          ensureAccess(
            authorizeLiteratureAccess({ operation: "read", actor: input.actor, scope: projectScope })
          );
        }
        return transaction.listLiteraturePage({
          userId: input.actor.userId,
          scope: input.scope,
          limit: input.limit,
          anchor: input.anchor
        });
      },
      { isolationLevel: "RepeatableRead" }
    );
  }
}

async function requireLiteratureAccess(
  transaction: LiteratureTransaction,
  literatureId: string,
  userId: string,
  mode: "read" | "mutation"
): Promise<LiteratureAccessContext> {
  const context = await transaction.findLiteratureAccess({ literatureId, userId, mode });
  if (context === null) {
    throw notFound();
  }
  return context;
}

async function writeCreateAudit(
  transaction: LiteratureTransaction,
  literature: LiteratureRecord,
  scope: PersonalAccessScope | Pick<ProjectAccessScope, "kind" | "projectId">
): Promise<void> {
  const payload = createLiteratureAuditMetadata({ literatureId: literature.id, scope });
  ensureMetadataOnlyAuditPayload(payload);
  await transaction.writeAuditEvent({
    actorUserId: literature.createdByUserId,
    action: "literature.created",
    targetType: "Literature",
    targetId: literature.id,
    payload
  });
}

function ensureAccess(decision: ReturnType<typeof authorizeLiteratureAccess>): void {
  switch (decision) {
    case "allow":
      return;
    case "not-found":
      throw notFound();
    case "forbidden":
      throw new LiteratureError("Forbidden", 403);
    default: {
      const unreachable: never = decision;
      throw unreachable;
    }
  }
}

function authorizeExistingLiterature(
  operation: "read" | "append",
  actor: LiteratureActor,
  scope: PersonalAccessScope | ProjectAccessScope
): ReturnType<typeof authorizeLiteratureAccess> {
  switch (scope.kind) {
    case "personal":
      return authorizeLiteratureAccess({ operation, actor, scope });
    case "project":
      return authorizeLiteratureAccess({ operation, actor, scope });
    default: {
      const unreachable: never = scope;
      throw unreachable;
    }
  }
}

function notFound(): LiteratureError {
  return new LiteratureError("Not found", 404);
}

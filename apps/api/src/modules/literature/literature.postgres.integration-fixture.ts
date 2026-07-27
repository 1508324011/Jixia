import type { Prisma, PrismaClient } from "@jixia/db";

import { findLockedProjectAccess } from "./literature.prisma-access.js";
import type { LiteratureActor } from "./literature.repository.js";

type Deferred = {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
};

type LockHandle = {
  readonly release: () => void;
  readonly done: Promise<void>;
};

export type ProjectLiteratureFixture = {
  readonly actor: LiteratureActor;
  readonly editorUserId: string;
  readonly literatureId: string;
  readonly projectId: string;
  readonly spaceId: string;
};

function createDeferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  if (!resolvePromise) {
    throw new Error("Deferred initialization failed");
  }
  return { promise, resolve: resolvePromise };
}

export async function seedProjectLiterature(
  prisma: PrismaClient,
  prefix: string
): Promise<ProjectLiteratureFixture> {
  const ownerUserId = `${prefix}-owner`;
  const editorUserId = `${prefix}-editor`;
  const spaceId = `${prefix}-space`;
  const projectId = `${prefix}-project`;
  const literatureId = `${prefix}-literature`;
  const updatedAt = new Date();

  await prisma.user.createMany({
    data: [
      {
        id: ownerUserId,
        email: `${ownerUserId}@task25.test`,
        displayName: "Owner",
        passwordHash: "hash",
        updatedAt
      },
      {
        id: editorUserId,
        email: `${editorUserId}@task25.test`,
        displayName: "Editor",
        passwordHash: "hash",
        updatedAt
      }
    ]
  });
  await prisma.space.create({ data: { id: spaceId, name: "Task25", updatedAt } });
  await prisma.spaceMember.createMany({
    data: [
      {
        id: `${prefix}-space-owner`,
        spaceId,
        userId: ownerUserId,
        role: "SpaceMember"
      },
      {
        id: `${prefix}-space-editor`,
        spaceId,
        userId: editorUserId,
        role: "SpaceMember"
      }
    ]
  });
  await prisma.project.create({
    data: {
      id: projectId,
      spaceId,
      name: "Task25",
      createdByUserId: ownerUserId,
      updatedAt
    }
  });
  await prisma.projectMember.createMany({
    data: [
      {
        id: `${prefix}-project-owner`,
        projectId,
        userId: ownerUserId,
        role: "ProjectOwner"
      },
      {
        id: `${prefix}-project-editor`,
        projectId,
        userId: editorUserId,
        role: "ProjectEditor"
      }
    ]
  });
  await prisma.literature.create({
    data: { id: literatureId, projectId, createdByUserId: ownerUserId }
  });

  return {
    actor: { userId: editorUserId, spaceId, spaceRole: "SpaceMember" },
    editorUserId,
    literatureId,
    projectId,
    spaceId
  };
}

export async function startProjectAccessLock(
  prisma: PrismaClient,
  fixture: ProjectLiteratureFixture
): Promise<LockHandle> {
  const acquired = createDeferred();
  const release = createDeferred();
  const done = prisma.$transaction(async (transaction) => {
    const access = await findLockedProjectAccess(transaction, {
      projectId: fixture.projectId,
      userId: fixture.editorUserId
    });
    if (access?.projectRole !== "ProjectEditor") {
      throw new Error("Expected ProjectEditor access while acquiring locks");
    }
    acquired.resolve();
    await release.promise;
  });

  await Promise.race([
    acquired.promise,
    done.then(() => {
      throw new Error("Access lock transaction completed before release");
    })
  ]);
  return { release: release.resolve, done };
}

export async function expectProjectMutationBlocked(
  prisma: PrismaClient,
  fixture: ProjectLiteratureFixture,
  mutate: (transaction: Prisma.TransactionClient) => Promise<void>
): Promise<void> {
  const holder = await startProjectAccessLock(prisma, fixture);
  try {
    await prisma
      .$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT set_config('lock_timeout', '750ms', true)`;
        await mutate(transaction);
      })
      .then(
        () => {
          throw new Error("Expected membership mutation to wait for the access locks");
        },
        (error: unknown) => {
          if (!(error instanceof Error) || !error.message.includes("lock timeout")) {
            throw error;
          }
        }
      );
  } finally {
    holder.release();
    await holder.done;
  }
}

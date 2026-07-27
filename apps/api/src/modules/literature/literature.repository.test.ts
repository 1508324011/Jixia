import { describe, expect, it } from "vitest";

import {
  authorizeLiteratureAccess,
  type LiteratureActor
} from "./literature.repository.js";

const memberActor: LiteratureActor = {
  userId: "user-1",
  spaceId: "space-1",
  spaceRole: "SpaceMember"
};

describe("literature repository authorization", () => {
  it("allows a personal owner to read and append", () => {
    const scope = { kind: "personal" as const, ownerUserId: memberActor.userId };

    expect(authorizeLiteratureAccess({ operation: "read", actor: memberActor, scope })).toBe(
      "allow"
    );
    expect(authorizeLiteratureAccess({ operation: "append", actor: memberActor, scope })).toBe(
      "allow"
    );
  });

  it("hides personal Literature from another owner", () => {
    const decision = authorizeLiteratureAccess({
      operation: "read",
      actor: memberActor,
      scope: { kind: "personal", ownerUserId: "user-2" }
    });

    expect(decision).toBe("not-found");
  });

  it("fails closed for a wrong-space, inactive, or missing project member", () => {
    expect(
      authorizeLiteratureAccess({
        operation: "read",
        actor: memberActor,
        scope: {
          kind: "project",
          projectId: "project-1",
          projectSpaceId: "space-2",
          activeSpaceMember: true,
          projectRole: "ProjectOwner"
        }
      })
    ).toBe("not-found");
    expect(
      authorizeLiteratureAccess({
        operation: "read",
        actor: memberActor,
        scope: {
          kind: "project",
          projectId: "project-1",
          projectSpaceId: "space-1",
          activeSpaceMember: false,
          projectRole: "ProjectOwner"
        }
      })
    ).toBe("not-found");
    expect(
      authorizeLiteratureAccess({
        operation: "read",
        actor: memberActor,
        scope: {
          kind: "project",
          projectId: "project-1",
          projectSpaceId: "space-1",
          activeSpaceMember: true,
          projectRole: null
        }
      })
    ).toBe("not-found");
  });

  it("allows a project viewer to read but forbids mutation", () => {
    const scope = {
      kind: "project" as const,
      projectId: "project-1",
      projectSpaceId: "space-1",
      activeSpaceMember: true,
      projectRole: "ProjectViewer" as const
    };
    const membership = {
      actor: memberActor,
      scope
    };

    expect(authorizeLiteratureAccess({ ...membership, operation: "read" })).toBe("allow");
    expect(authorizeLiteratureAccess({ ...membership, operation: "append" })).toBe("forbidden");
    expect(authorizeLiteratureAccess({ ...membership, operation: "create" })).toBe("forbidden");
  });

  it("allows project owners and editors to create and append", () => {
    for (const projectRole of ["ProjectOwner", "ProjectEditor"] as const) {
      const scope = {
        kind: "project" as const,
        projectId: "project-1",
        projectSpaceId: "space-1",
        activeSpaceMember: true,
        projectRole
      };
      expect(
        authorizeLiteratureAccess({
          operation: "create",
          actor: memberActor,
          scope
        })
      ).toBe("allow");
      expect(
        authorizeLiteratureAccess({
          operation: "append",
          actor: memberActor,
          scope
        })
      ).toBe("allow");
    }
  });

  it("does not grant SpaceAdmin implicit project access", () => {
    const decision = authorizeLiteratureAccess({
      operation: "read",
      actor: { ...memberActor, spaceRole: "SpaceAdmin" },
      scope: {
        kind: "project",
        projectId: "project-1",
        projectSpaceId: "space-1",
        activeSpaceMember: true,
        projectRole: null
      }
    });

    expect(decision).toBe("not-found");
  });
});

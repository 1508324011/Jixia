export * from "./auth";
export * from "./documents";
export * from "./attachments";
export * from "./ai";

export const workspacePackageNames = [
  "@jixia/api",
  "@jixia/web",
  "@jixia/worker",
  "@jixia/db",
  "@jixia/shared"
] as const;

export type WorkspacePackageName = (typeof workspacePackageNames)[number];

export type FoundationPackageStatus<TPackageName extends WorkspacePackageName = WorkspacePackageName> = {
  packageName: TPackageName;
  businessModules: "deferred";
};

export function describeFoundationPackage<TPackageName extends WorkspacePackageName>(
  packageName: TPackageName
): FoundationPackageStatus<TPackageName> {
  return {
    packageName,
    businessModules: "deferred"
  };
}

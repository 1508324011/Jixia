import { requireDisposableDatabaseUrl } from "@jixia/db/postgres-integration-environment";

export function requireLiteraturePostgresEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env
): string {
  return requireDisposableDatabaseUrl(environment);
}

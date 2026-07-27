import { readdir, readFile } from "node:fs/promises";

import { Client, type QueryResult, type QueryResultRow } from "pg";

import { phase2DeploymentContract } from "./database-deployment-config.js";
import {
  provisionDatabaseDeploymentRoles,
  type DatabaseQuery
} from "./database-deployment.js";
import { requireDisposableMigrationDatabaseUrl } from "./postgres-integration-environment.js";

const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
const literatureMigrationDirectory = new URL(
  "../prisma/migrations/20260717000000_literature_domain_foundation/",
  import.meta.url
);
const literaturePhase2MigrationDirectory = new URL(
  "../prisma/migrations/20260718000000_literature_discovery_import_library/",
  import.meta.url
);

const literaturePhase2MigrationName = "20260718000000_literature_discovery_import_library";

async function readAllMigrationSql(options?: {
  readonly beforeLiteraturePhase2?: boolean;
}): Promise<readonly string[]> {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(
      (directory) => !options?.beforeLiteraturePhase2 || directory < literaturePhase2MigrationName
    )
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    directories.map((directory) =>
      readFile(new URL(`${directory}/migration.sql`, migrationsDirectory), "utf8")
    )
  );
}

export class PostgresIntegrationHarness {
  private constructor(
    private readonly databaseUrl: string,
    private readonly client: Client
  ) {}

  static async connectFromEnvironment(): Promise<PostgresIntegrationHarness> {
    const databaseUrl = requireDisposableMigrationDatabaseUrl();
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    return new PostgresIntegrationHarness(databaseUrl, client);
  }

  async close(): Promise<void> {
    await this.client.end();
  }

  async query<Row extends QueryResultRow>(
    sql: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<Row>> {
    return this.client.query<Row>(sql, [...values]);
  }

  async resetAndApplyAllMigrations(): Promise<void> {
    await this.client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await this.prepareLiteraturePhase2Deployment();
    const migrations = await readAllMigrationSql();
    for (const migration of migrations) {
      await this.client.query(migration);
    }
  }

  async resetAndApplyMigrationsBeforeLiteraturePhase2(): Promise<void> {
    await this.client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await this.prepareLiteraturePhase2Deployment();
    const migrations = await readAllMigrationSql({ beforeLiteraturePhase2: true });
    for (const migration of migrations) {
      await this.client.query(migration);
    }
  }

  async applyLiteratureMigration(): Promise<void> {
    const migration = await readFile(new URL("migration.sql", literatureMigrationDirectory), "utf8");
    await this.client.query(migration);
  }

  async rollbackLiteratureMigration(): Promise<void> {
    await this.rollbackLiteraturePhase2Migration();
    const rollback = await readFile(new URL("rollback.sql", literatureMigrationDirectory), "utf8");
    const rollbackClient = new Client({ connectionString: this.databaseUrl });
    await rollbackClient.connect();
    try {
      await rollbackClient.query(rollback);
    } finally {
      await rollbackClient.end();
    }
  }

  async applyLiteraturePhase2Migration(): Promise<void> {
    const migration = await readFile(
      new URL("migration.sql", literaturePhase2MigrationDirectory),
      "utf8"
    );
    await this.client.query(migration);
  }

  async rollbackLiteraturePhase2Migration(): Promise<void> {
    const rollback = await readFile(
      new URL("rollback.sql", literaturePhase2MigrationDirectory),
      "utf8"
    );
    const rollbackClient = new Client({ connectionString: this.databaseUrl });
    await rollbackClient.connect();
    try {
      await rollbackClient.query(rollback);
    } finally {
      await rollbackClient.end();
    }
  }

  private async prepareLiteraturePhase2Deployment(): Promise<void> {
    const query: DatabaseQuery = <Row extends QueryResultRow>(
      sql: string,
      values: readonly unknown[] = []
    ) => this.query<Row>(sql, values);
    await provisionDatabaseDeploymentRoles(query);
    await this.client.query("SELECT set_config($1, $2, false)", [
      phase2DeploymentContract.setting,
      phase2DeploymentContract.value
    ]);
  }
}

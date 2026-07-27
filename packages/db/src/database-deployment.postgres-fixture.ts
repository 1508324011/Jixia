import { readdir, readFile } from "node:fs/promises";

import { Client, type QueryResultRow } from "pg";

import { requireDisposableMigrationDatabaseUrl } from "./postgres-integration-environment.js";

const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
const phase2MigrationName = "20260718000000_literature_discovery_import_library";
const phase2MigrationDirectory = new URL(`${phase2MigrationName}/`, migrationsDirectory);

export const deploymentTestRoles = {
  insufficient: "task25_deploy_insufficient",
  migrator: "task25_deploy_migrator",
  runtime: "task25_deploy_runtime"
} as const;

type SqlRow = QueryResultRow & { readonly sql: string };

export class DatabaseDeploymentPostgresFixture {
  private readonly databases = new Set<string>();

  private constructor(
    private readonly adminUrl: string,
    private readonly admin: Client
  ) {}

  static async connectFromEnvironment(): Promise<DatabaseDeploymentPostgresFixture> {
    const adminUrl = requireDisposableMigrationDatabaseUrl();
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const fixture = new DatabaseDeploymentPostgresFixture(adminUrl, admin);
    await fixture.createTestRoles();
    return fixture;
  }

  async close(): Promise<void> {
    for (const databaseName of this.databases) {
      await this.executeFormatted("DROP DATABASE IF EXISTS %I WITH (FORCE)", [databaseName]);
    }
    await this.admin.query(`
      DROP ROLE IF EXISTS "task25_deploy_runtime";
      DROP ROLE IF EXISTS "task25_deploy_insufficient";
      DROP ROLE IF EXISTS "task25_deploy_migrator";
    `);
    await this.admin.end();
  }

  async createEnvironment(
    databaseName: string,
    migrationRole: string = deploymentTestRoles.migrator
  ): Promise<Readonly<Record<string, string>>> {
    this.databases.add(databaseName);
    await this.executeFormatted("DROP DATABASE IF EXISTS %I WITH (FORCE)", [databaseName]);
    await this.executeFormatted("CREATE DATABASE %I OWNER %I", [databaseName, migrationRole]);

    return {
      DATABASE_URL: this.databaseUrl(deploymentTestRoles.runtime, databaseName),
      MIGRATION_DATABASE_URL: this.databaseUrl(migrationRole, databaseName)
    };
  }

  async connect(connectionString: string): Promise<Client> {
    const client = new Client({ connectionString });
    await client.connect();
    return client;
  }

  async applyMigrationsBeforePhase2(connectionString: string): Promise<void> {
    const entries = await readdir(migrationsDirectory, { withFileTypes: true });
    const names = entries
      .filter((entry) => entry.isDirectory() && entry.name < phase2MigrationName)
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
    const client = await this.connect(connectionString);
    try {
      for (const name of names) {
        const sql = await readFile(new URL(`${name}/migration.sql`, migrationsDirectory), "utf8");
        await client.query(sql);
      }
    } finally {
      await client.end();
    }
  }

  async applyPhase2Directly(connectionString: string): Promise<void> {
    const sql = await readFile(new URL("migration.sql", phase2MigrationDirectory), "utf8");
    const client = await this.connect(connectionString);
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
  }

  async rollbackPhase2(connectionString: string): Promise<void> {
    const sql = await readFile(new URL("rollback.sql", phase2MigrationDirectory), "utf8");
    const client = await this.connect(connectionString);
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
  }

  private databaseUrl(role: string, databaseName: string): string {
    const url = new URL(this.adminUrl);
    url.username = role;
    url.password = "";
    url.pathname = `/${databaseName}`;
    return url.toString();
  }

  private async createTestRoles(): Promise<void> {
    await this.admin.query(`
      DO $roles$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'task25_deploy_migrator') THEN
          CREATE ROLE "task25_deploy_migrator" LOGIN SUPERUSER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'task25_deploy_runtime') THEN
          CREATE ROLE "task25_deploy_runtime" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'task25_deploy_insufficient') THEN
          CREATE ROLE "task25_deploy_insufficient" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
        END IF;
      END
      $roles$;
      ALTER ROLE "task25_deploy_migrator" WITH LOGIN SUPERUSER;
      ALTER ROLE "task25_deploy_runtime" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
      ALTER ROLE "task25_deploy_insufficient" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
    `);
  }

  private async executeFormatted(template: string, identifiers: readonly string[]): Promise<void> {
    const result = await this.admin.query<SqlRow>(
      "SELECT format($1::text, VARIADIC $2::text[]) AS sql",
      [template, [...identifiers]]
    );
    const sql = result.rows[0]?.sql;
    if (!sql) {
      throw new Error("PostgreSQL did not format the identifier command");
    }
    await this.admin.query(sql);
  }
}

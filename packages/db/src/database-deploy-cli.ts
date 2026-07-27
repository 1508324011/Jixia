import { deployDatabase, verifyDatabaseDeployment } from "./database-deployment.js";

const commands = {
  deploy: deployDatabase,
  verify: verifyDatabaseDeployment
} as const;

async function main(): Promise<void> {
  const commandName = process.argv[2] ?? "deploy";
  if (commandName === "--help" || commandName === "-h") {
    process.stdout.write(
      "Usage: database-deploy-cli.ts [deploy|verify]\nRequires MIGRATION_DATABASE_URL and DATABASE_URL.\n"
    );
    return;
  }
  if (commandName !== "deploy" && commandName !== "verify") {
    throw new Error("Usage: database-deploy-cli.ts [deploy|verify]");
  }
  const summary = await commands[commandName](process.env);
  process.stdout.write(
    `Database ${commandName} contract passed for migrator ${summary.migrationRole} and runtime ${summary.runtimeRole}\n`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Database deployment failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

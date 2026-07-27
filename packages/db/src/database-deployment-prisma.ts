import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { DatabaseDeploymentContractError } from "./database-deployment-errors.js";

export async function runPrismaMigration(connectionString: string): Promise<void> {
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      executable,
      ["exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
      {
        cwd: packageRoot,
        env: { ...process.env, DATABASE_URL: connectionString },
        stdio: "inherit"
      }
    );
    child.once("error", () => reject(new DatabaseDeploymentContractError("deployment_command_failed")));
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new DatabaseDeploymentContractError("deployment_command_failed"));
      }
    });
  });
}

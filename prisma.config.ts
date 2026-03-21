import "dotenv/config";

import { defineConfig } from "prisma/config";

const databaseUrl = process.env.JIXIA_DATABASE_URL ?? "file:./prisma/dev.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
});

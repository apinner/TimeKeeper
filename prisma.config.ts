import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
    // Only needed by `migrate dev` and by the CI check that migrations still
    // describe the schema. Never used at runtime.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  migrations: { seed: "tsx prisma/seed.ts" },
});

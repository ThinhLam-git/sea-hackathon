import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./apps/web/db/schema.ts",
  dialect: "sqlite",
});

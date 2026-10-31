import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
export const runs = sqliteTable("rescue_runs", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), mode: text("mode").notNull(),
  state: text("state").notNull(), revision: integer("revision").notNull().default(0),
  writeToken: text("write_token").notNull(), createdAt: text("created_at").notNull(),
});
export const decisions = sqliteTable("rescue_decisions", {
  id: text("id").primaryKey(), runId: text("run_id").notNull().references(() => runs.id),
  sequence: integer("sequence").notNull(), payload: text("payload").notNull(),
}, table => [uniqueIndex("rescue_decision_sequence").on(table.runId, table.sequence)]);

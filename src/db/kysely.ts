import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { DB } from "./schema";

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  return databaseUrl;
}

declare global {
  // eslint-disable-next-line no-var
  var __hmdbKyselyDb: Kysely<DB> | undefined;
}

function createDb(): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: getDatabaseUrl(),
      }),
    }),
  });
}

export const db = globalThis.__hmdbKyselyDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalThis.__hmdbKyselyDb = db;
}
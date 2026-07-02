import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local or .env."
    );
  }

  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf8");

  const client = new Client({
    connectionString: databaseUrl,
  });

  console.log("Connecting to PostgreSQL...");
  await client.connect();

  try {
    console.log(`Applying schema from ${schemaPath}...`);
    await client.query(schemaSql);
    console.log("Schema applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to apply schema.");
  console.error(error);
  process.exit(1);
});
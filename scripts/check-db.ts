import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  const result = await client.query<{
    table_name: string;
  }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);

  console.log("Public tables:");

  for (const row of result.rows) {
    console.log(`- ${row.table_name}`);
  }

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
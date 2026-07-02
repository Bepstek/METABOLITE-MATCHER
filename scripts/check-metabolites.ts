import "./load-env";
import { db } from "../src/db/kysely";

async function countTable(tableName: "compounds" | "source_terms" | "compound_sources") {
  const result = await db
    .selectFrom(tableName)
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .executeTakeFirstOrThrow();

  return result.count;
}

async function main(): Promise<void> {
  const compoundCount = await countTable("compounds");
  const sourceTermCount = await countTable("source_terms");
  const compoundSourceCount = await countTable("compound_sources");

  console.log("Compound count:", compoundCount);
  console.log("Source term count:", sourceTermCount);
  console.log("Compound source count:", compoundSourceCount);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.destroy();
  });
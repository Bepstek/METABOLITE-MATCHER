import "./load-env";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../src/db/kysely";

interface AdductSeedRow {
  label: string;
  ion_mode: "positive" | "negative";
  charge: number;
  mass_multiplier: number;
  mass_shift: number;
  enabled: boolean;
}

async function main(): Promise<void> {
  const seedPath = path.resolve("db/seeds/adducts.json");
  const raw = await fs.readFile(seedPath, "utf8");
  const adducts = JSON.parse(raw) as AdductSeedRow[];

  if (adducts.length === 0) {
    console.log("No adducts found in seed file.");
    return;
  }

  await db
    .insertInto("adducts")
    .values(adducts)
    .onConflict((oc) =>
      oc.column("label").doUpdateSet((eb) => ({
        ion_mode: eb.ref("excluded.ion_mode"),
        charge: eb.ref("excluded.charge"),
        mass_multiplier: eb.ref("excluded.mass_multiplier"),
        mass_shift: eb.ref("excluded.mass_shift"),
        enabled: eb.ref("excluded.enabled"),
      }))
    )
    .execute();

  console.log(`Seeded/updated ${adducts.length} adduct definitions.`);
}

main()
  .catch((error) => {
    console.error("Failed to seed adducts.");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.destroy();
  });
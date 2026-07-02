import "./load-env";
import fs from "node:fs/promises";
import path from "node:path";

interface AdductSeedRow {
  label: string;
  ion_mode: "positive" | "negative";
  charge: number;
  mass_multiplier: number;
  mass_shift: number;
  enabled: boolean;
}

function computeMz(
  neutralMass: number,
  adduct: AdductSeedRow
): number {
  return (
    (neutralMass * adduct.mass_multiplier + adduct.mass_shift) /
    Math.abs(adduct.charge)
  );
}

async function main(): Promise<void> {
  const seedPath = path.resolve("db/seeds/adducts.json");
  const raw = await fs.readFile(seedPath, "utf8");
  const adducts = JSON.parse(raw) as AdductSeedRow[];

  const neutralMass = 131.069476547; // Creatine HMDB0000064

  console.log(`Neutral mass: ${neutralMass}`);
  console.log("");

  for (const adduct of adducts) {
    const mz = computeMz(neutralMass, adduct);

    console.log(
      [
        adduct.label.padEnd(20),
        adduct.ion_mode.padEnd(8),
        `charge=${String(adduct.charge).padEnd(3)}`,
        `mult=${String(adduct.mass_multiplier).padEnd(2)}`,
        `shift=${adduct.mass_shift.toFixed(6).padStart(12)}`,
        `mz=${mz.toFixed(6)}`,
      ].join(" | ")
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
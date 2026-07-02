import "./load-env";
import { db } from "../src/db/kysely";

interface ExpectedAdductMz {
  label: string;
  expectedMz: number;
}

const ACCESSION = "HMDB0000064";
const TOLERANCE_DA = 0.00001;

const EXPECTED: ExpectedAdductMz[] = [
  // Positive ion mode
  { label: "[M+3H]3+", expectedMz: 44.697102 },
  { label: "[M+2H+Na]3+", expectedMz: 52.024416 },
  { label: "[M+H+2Na]3+", expectedMz: 59.456016 },
  { label: "[M+3Na]3+", expectedMz: 66.679044 },
  { label: "[M+2H]2+", expectedMz: 66.542014 },
  { label: "[M+H+NH4]2+", expectedMz: 75.055288 },
  { label: "[M+H+Na]2+", expectedMz: 77.532985 },
  { label: "[M+H+K]2+", expectedMz: 85.519955 },
  { label: "[M+ACN+2H]2+", expectedMz: 87.055288 },
  { label: "[M+2Na]2+", expectedMz: 88.523956 },
  { label: "[M+2ACN+2H]2+", expectedMz: 107.568561 },
  { label: "[M+3ACN+2H]2+", expectedMz: 128.081835 },
  { label: "[M+H]+", expectedMz: 132.076753 },
  { label: "[M+NH4]+", expectedMz: 149.1033 },
  { label: "[M+Na]+", expectedMz: 154.058695 },
  { label: "[M+CH3OH+H]+", expectedMz: 164.102966 },
  { label: "[M+K]+", expectedMz: 170.032635 },
  { label: "[M+ACN+H]+", expectedMz: 173.1033 },
  { label: "[M+2Na-H]+", expectedMz: 176.040637 },
  { label: "[M+IsoProp+H]+", expectedMz: 192.134817 },
  { label: "[M+ACN+Na]+", expectedMz: 195.085242 },
  { label: "[M+2K-H]+", expectedMz: 207.988517 },
  { label: "[M+DMSO+H]+", expectedMz: 210.090697 },
  { label: "[M+2ACN+H]+", expectedMz: 214.129847 },
  { label: "[M+IsoProp+Na+H]+", expectedMz: 215.124587 },
  { label: "[2M+H]+", expectedMz: 263.146229 },
  { label: "[2M+NH4]+", expectedMz: 280.172776 },
  { label: "[2M+Na]+", expectedMz: 285.128171 },
  { label: "[2M+K]+", expectedMz: 301.102111 },
  { label: "[2M+ACN+H]+", expectedMz: 304.172776 },
  { label: "[2M+ACN+Na]+", expectedMz: 326.154718 },

  // Negative ion mode
  { label: "[M-3H]3-", expectedMz: 42.68255 },
  { label: "[M-2H]2-", expectedMz: 64.527462 },
  { label: "[M-H2O-H]-", expectedMz: 112.051087 },
  { label: "[M-H]-", expectedMz: 130.062201 },
  { label: "[M+Na-2H]-", expectedMz: 152.044143 },
  { label: "[M+Cl]-", expectedMz: 166.038879 },
  { label: "[M+K-2H]-", expectedMz: 168.018083 },
  { label: "[M+FA-H]-", expectedMz: 176.067678 },
  { label: "[M+Hac-H]-", expectedMz: 190.083328 },
  { label: "[M+Br]-", expectedMz: 209.988362 },
  { label: "[M+TFA-H]-", expectedMz: 244.055063 },
  { label: "[2M-H]-", expectedMz: 261.131677 },
  { label: "[2M+FA-H]-", expectedMz: 307.137154 },
  { label: "[2M+Hac-H]-", expectedMz: 321.152804 },
  { label: "[3M-H]-", expectedMz: 392.201154 },
];

async function main(): Promise<void> {
  const rows = await db
    .selectFrom("compound_adducts")
    .innerJoin("compounds", "compounds.id", "compound_adducts.compound_id")
    .innerJoin("adducts", "adducts.id", "compound_adducts.adduct_id")
    .select([
      "compounds.accession",
      "compounds.name",
      "compounds.monoisotopic_molecular_weight",
      "adducts.label",
      "compound_adducts.theoretical_mz",
    ])
    .where("compounds.accession", "=", ACCESSION)
    .execute();

  if (rows.length === 0) {
    throw new Error(
      `No computed adducts found for ${ACCESSION}. Run db:seed:adducts and db:compute:adducts first.`
    );
  }

  const actualByLabel = new Map(
    rows.map((row) => [row.label, row])
  );

  const compound = rows[0];

  console.log(`Verifying computed adducts for ${compound.accession} - ${compound.name}`);
  console.log(`Neutral mass in DB: ${compound.monoisotopic_molecular_weight}`);
  console.log(`Tolerance: ±${TOLERANCE_DA} Da`);
  console.log("");

  let passed = 0;
  let failed = 0;
  let missing = 0;

  for (const expected of EXPECTED) {
    const actual = actualByLabel.get(expected.label);

    if (!actual) {
      missing += 1;
      console.log(`MISSING | ${expected.label}`);
      continue;
    }

    const actualMz = actual.theoretical_mz;
    const diff = actualMz - expected.expectedMz;
    const ok = Math.abs(diff) <= TOLERANCE_DA;

    if (ok) {
      passed += 1;
    } else {
      failed += 1;
    }

    console.log(
      [
        ok ? "PASS " : "FAIL ",
        expected.label.padEnd(24),
        `expected=${expected.expectedMz.toFixed(6)}`,
        `actual=${actualMz.toFixed(6)}`,
        `diff=${diff.toFixed(6)}`,
      ].join(" | ")
    );
  }

  console.log("");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Missing: ${missing}`);

  if (failed > 0 || missing > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Creatine adduct verification failed.");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.destroy();
  });
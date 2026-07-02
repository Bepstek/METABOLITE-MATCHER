import "./load-env";
import { db } from "../src/db/kysely";

interface CompoundRow {
  id: number;
  accession: string;
  name: string;
  monoisotopic_molecular_weight: number | null;
}

interface AdductRow {
  id: number;
  label: string;
  charge: number;
  mass_multiplier: number;
  mass_shift: number;
}

interface CompoundAdductInsertRow {
  compound_id: number;
  adduct_id: number;
  theoretical_mz: number;
}

function getCompoundBatchSize(): number {
  const rawValue = process.env.COMPUTE_ADDUCT_COMPOUND_BATCH_SIZE;
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : 1000;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
}

function getMaxCompounds(): number | null {
  const rawValue = process.env.COMPUTE_ADDUCT_MAX_COMPOUNDS;

  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseInt(rawValue, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getTargetAccession(): string | null {
  const rawValue = process.env.COMPUTE_ADDUCT_ACCESSION;

  if (!rawValue) {
    return null;
  }

  return rawValue.trim().toUpperCase();
}

function chunkRows<T>(rows: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }

  return chunks;
}

function computeTheoreticalMz(
  compound: CompoundRow,
  adduct: AdductRow
): number | null {
  const mass = compound.monoisotopic_molecular_weight;

  if (mass === null) {
    return null;
  }

  return (
    (mass * adduct.mass_multiplier + adduct.mass_shift) /
    Math.abs(adduct.charge)
  );
}

async function getEnabledAdducts(): Promise<AdductRow[]> {
  return db
    .selectFrom("adducts")
    .select(["id", "label", "charge", "mass_multiplier", "mass_shift"])
    .where("enabled", "=", true)
    .orderBy("id", "asc")
    .execute();
}

async function getCompoundBatch(
  lastCompoundId: number,
  limit: number,
  targetAccession: string | null
): Promise<CompoundRow[]> {
  let query = db
    .selectFrom("compounds")
    .select(["id", "accession", "name", "monoisotopic_molecular_weight"])
    .where("id", ">", lastCompoundId)
    .where("monoisotopic_molecular_weight", "is not", null)
    .orderBy("id", "asc")
    .limit(limit);

  if (targetAccession) {
    query = query.where("accession", "=", targetAccession);
  }

  return query.execute();
}

async function insertCompoundAdductRows(
  rows: CompoundAdductInsertRow[]
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const insertChunks = chunkRows(rows, 5000);

  for (const chunk of insertChunks) {
    await db
      .insertInto("compound_adducts")
      .values(chunk)
      .onConflict((oc) => oc.columns(["compound_id", "adduct_id"]).doNothing())
      .execute();
  }
}

function logTargetCompoundAdducts(
  compound: CompoundRow,
  adducts: AdductRow[]
): CompoundAdductInsertRow[] {
  const rows: CompoundAdductInsertRow[] = [];

  console.log("");
  console.log(
    `Computing adducts for ${compound.accession} - ${compound.name}`
  );
  console.log(`Neutral mass: ${compound.monoisotopic_molecular_weight}`);
  console.log("");

  for (const adduct of adducts) {
    const theoreticalMz = computeTheoreticalMz(compound, adduct);

    if (theoreticalMz === null || !Number.isFinite(theoreticalMz)) {
      continue;
    }

    rows.push({
      compound_id: compound.id,
      adduct_id: adduct.id,
      theoretical_mz: theoreticalMz,
    });

    console.log(`${adduct.label.padEnd(24)} mz=${theoreticalMz.toFixed(6)}`);
  }

  console.log("");

  return rows;
}

function computeBatchRows(
  compounds: CompoundRow[],
  adducts: AdductRow[],
  shouldLogTarget: boolean
): CompoundAdductInsertRow[] {
  const rows: CompoundAdductInsertRow[] = [];

  for (const compound of compounds) {
    if (shouldLogTarget) {
      rows.push(...logTargetCompoundAdducts(compound, adducts));
      continue;
    }

    for (const adduct of adducts) {
      const theoreticalMz = computeTheoreticalMz(compound, adduct);

      if (theoreticalMz === null || !Number.isFinite(theoreticalMz)) {
        continue;
      }

      rows.push({
        compound_id: compound.id,
        adduct_id: adduct.id,
        theoretical_mz: theoreticalMz,
      });
    }
  }

  return rows;
}

async function main(): Promise<void> {
  const compoundBatchSize = getCompoundBatchSize();
  const maxCompounds = getMaxCompounds();
  const targetAccession = getTargetAccession();
  const shouldLogTarget = Boolean(targetAccession);
  const adducts = await getEnabledAdducts();

  if (adducts.length === 0) {
    throw new Error("No enabled adducts found. Run npm run db:seed:adducts first.");
  }

  console.log(`Enabled adducts: ${adducts.length}`);
  console.log(`Compound batch size: ${compoundBatchSize}`);

  if (maxCompounds) {
    console.log(`Test mode enabled. Max compounds: ${maxCompounds}`);
  }

  if (targetAccession) {
    console.log(`Target accession mode enabled: ${targetAccession}`);
  }

  let lastCompoundId = 0;
  let processedCompounds = 0;
  let generatedRows = 0;

  while (true) {
    if (maxCompounds && processedCompounds >= maxCompounds) {
      break;
    }

    const remainingLimit = maxCompounds
      ? Math.min(compoundBatchSize, maxCompounds - processedCompounds)
      : compoundBatchSize;

    const compounds = await getCompoundBatch(
      lastCompoundId,
      remainingLimit,
      targetAccession
    );

    if (compounds.length === 0) {
      break;
    }

    lastCompoundId = compounds[compounds.length - 1].id;

    const rows = computeBatchRows(compounds, adducts, shouldLogTarget);

    await insertCompoundAdductRows(rows);

    processedCompounds += compounds.length;
    generatedRows += rows.length;

    console.log(
      `Processed compounds: ${processedCompounds}; generated compound_adduct rows: ${generatedRows}`
    );

    if (targetAccession) {
      break;
    }
  }

  console.log("Compound adduct computation completed.");
}

main()
  .catch((error) => {
    console.error("Failed to compute compound adducts.");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.destroy();
  });
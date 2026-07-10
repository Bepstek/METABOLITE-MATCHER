import "./load-env";
import { db } from "../src/db/kysely";
import {
  countCompoundsByName,
  countCompoundSpectraByAccession,
  findCompoundByAccession,
  listCompoundSourceTermsByAccession,
  listCompoundSpectraByAccession,
  searchCompoundsByName,
} from "../src/repositories/compounds.repository";
import { listEnabledAdductsByIonMode, listSourceTerms } from "../src/repositories/metadata.repository";
import {
  searchAdductMzService,
  searchCompoundsByNameService,
  searchFragmentMassService,
  searchNeutralMassService,
} from "../src/services/search.service";

const CREATINE_ACCESSION = "HMDB0000064";
const CREATINE_NAME = "Creatine";
const CREATINE_MONOISOTOPIC_MASS = 131.069476547;
const CREATINE_M_PLUS_H_MZ = 132.076752547;

function logSection(title: string) {
  console.log(`\n=== ${title} ===`);
}

function logFirstRows<T>(label: string, rows: T[], count = 3) {
  console.log(`${label}: showing ${Math.min(rows.length, count)} of ${rows.length}`);
  console.dir(rows.slice(0, count), { depth: null });
}

async function testCompoundRepositories() {
  logSection("Compound repositories");

  const compound = await findCompoundByAccession(db, CREATINE_ACCESSION);
  console.log(`[compound] ${CREATINE_ACCESSION}:`, compound ? compound.name : "NOT FOUND");

  const nameRows = await searchCompoundsByName(db, {
    query: CREATINE_NAME,
    limit: 10,
    offset: 0,
    sortBy: "name",
    sortDirection: "asc",
  });
  const nameTotal = await countCompoundsByName(db, { query: CREATINE_NAME });
  console.log(`[name] ${CREATINE_NAME}: ${nameRows.length} rows / ${nameTotal} total`);
  logFirstRows("[name] rows", nameRows);

  const sources = await listCompoundSourceTermsByAccession(db, CREATINE_ACCESSION);
  console.log(`[compound sources] ${CREATINE_ACCESSION}: ${sources.length}`);
  logFirstRows("[compound sources] rows", sources, 5);

  const spectraRows = await listCompoundSpectraByAccession(db, {
    accession: CREATINE_ACCESSION,
    limit: 10,
    offset: 0,
    spectrumKind: "both",
    polarity: "both",
    sortDirection: "asc",
  });
  const spectraTotal = await countCompoundSpectraByAccession(db, {
    accession: CREATINE_ACCESSION,
    polarity: "both",
    spectrumKind: "both",
  });
  console.log(`[compound spectra] ${CREATINE_ACCESSION}: ${spectraRows.length} rows / ${spectraTotal} total`);
  logFirstRows("[compound spectra] rows", spectraRows);
}

async function testMetadataRepositories() {
  logSection("Metadata repositories");

  const positiveAdducts = await listEnabledAdductsByIonMode(db, "positive");
  const negativeAdducts = await listEnabledAdductsByIonMode(db, "negative");
  const sourceTerms = await listSourceTerms(db, { maxLevel: 2 });

  console.log(`[metadata] positive adducts: ${positiveAdducts.length}`);
  logFirstRows("[metadata] positive adduct rows", positiveAdducts, 5);

  console.log(`[metadata] negative adducts: ${negativeAdducts.length}`);
  logFirstRows("[metadata] negative adduct rows", negativeAdducts, 5);

  console.log(`[metadata] source terms level<=2: ${sourceTerms.length}`);
  logFirstRows("[metadata] source term rows", sourceTerms, 10);
}

async function testSearchServices() {
  logSection("Search services");

  const compoundName = await searchCompoundsByNameService(db, {
    query: CREATINE_NAME,
    page: 1,
    limit: 10,
  });
  console.log("[service:name] pagination:", compoundName.pagination);
  logFirstRows("[service:name] rows", compoundName.rows);

  const neutral = await searchNeutralMassService(db, {
    queryMass: CREATINE_MONOISOTOPIC_MASS,
    page: 1,
    limit: 10,
  });
  console.log("[service:neutral exact] pagination:", neutral.pagination);
  logFirstRows("[service:neutral exact] rows", neutral.rows);

  const adductUnknown = await searchAdductMzService(db, {
    queryMz: CREATINE_M_PLUS_H_MZ,
    ionMode: "positive",
    tolerance: 10,
    toleranceUnit: "ppm",
    adductIds: [],
    page: 1,
    limit: 10,
  });
  console.log("[service:adduct unknown positive 10ppm] pagination:", adductUnknown.pagination);
  logFirstRows("[service:adduct unknown positive 10ppm] rows", adductUnknown.rows);

  const fragment = await searchFragmentMassService(db, {
    queryMz: 57.034,
    tolerance: 0.5,
    toleranceUnit: "da",
    spectrumKind: "both",
    polarity: "both",
    page: 1,
    limit: 10,
  });
  console.log("[service:fragment primitive 0.5Da] pagination:", fragment.pagination);
  logFirstRows("[service:fragment primitive 0.5Da] rows", fragment.rows);

  const sourceTerms = await listSourceTerms(db, { maxLevel: 2 });
  const endogenous = sourceTerms.find((sourceTerm) => sourceTerm.name === "Endogenous");

  if (endogenous) {
    const endogenousFragment = await searchFragmentMassService(db, {
      queryMz: 57.034,
      tolerance: 0.5,
      toleranceUnit: "da",
      spectrumKind: "both",
      polarity: "both",
      sourceTermId: endogenous.id,
      page: 1,
      limit: 10,
    });
    console.log("[service:fragment Endogenous primitive 0.5Da] pagination:", endogenousFragment.pagination);
    logFirstRows("[service:fragment Endogenous primitive 0.5Da] rows", endogenousFragment.rows);
  } else {
    console.log("[service:fragment Endogenous primitive 0.5Da] skipped: Endogenous source term not found");
  }

  try {
    await searchNeutralMassService(db, {
      queryMass: CREATINE_MONOISOTOPIC_MASS,
      tolerance: 10,
      page: 1,
      limit: 10,
    });
    console.error("[validation] expected tolerance-without-unit test to fail, but it passed");
  } catch (error) {
    console.log("[validation] tolerance without toleranceUnit failed as expected");
  }
}

async function main() {
  try {
    await testCompoundRepositories();
    await testMetadataRepositories();
    await testSearchServices();
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

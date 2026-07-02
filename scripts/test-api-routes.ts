import { isRecord } from "@/lib/api-client";

type ApiTestCase = {
  name: string;
  path: string;
  expectedStatus?: number;
  validate?: (payload: unknown) => void;
};

const BASE_URL = process.env.API_TEST_BASE_URL ?? "http://localhost:3000";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertPaginatedResponse(payload: unknown) {
  assert(isRecord(payload), "Expected response payload to be an object.");
  assert(Array.isArray(payload.rows), "Expected payload.rows to be an array.");
  assert(isRecord(payload.pagination), "Expected payload.pagination to be an object.");

  const pagination = payload.pagination;

  assert(typeof pagination.page === "number", "Expected pagination.page to be a number.");
  assert(typeof pagination.pageSize === "number", "Expected pagination.pageSize to be a number.");
  assert(typeof pagination.totalRows === "number", "Expected pagination.totalRows to be a number.");
  assert(typeof pagination.totalPages === "number", "Expected pagination.totalPages to be a number.");
  assert(typeof pagination.hasNextPage === "boolean", "Expected pagination.hasNextPage to be a boolean.");
  assert(typeof pagination.hasPreviousPage === "boolean", "Expected pagination.hasPreviousPage to be a boolean.");
}

function assertArrayResponse(payload: unknown) {
  assert(Array.isArray(payload), "Expected response payload to be an array.");
}

function assertCompoundDetailResponse(payload: unknown) {
  assert(isRecord(payload), "Expected compound detail payload to be an object.");
  assert(isRecord(payload.compound), "Expected payload.compound to be an object.");
  assert(Array.isArray(payload.sourceTerms), "Expected payload.sourceTerms to be an array.");

  const compound = payload.compound;

  assert(compound.accession === "HMDB0000064", "Expected compound accession to be HMDB0000064.");
  assert(compound.name === "Creatine", "Expected compound name to be Creatine.");
}

function assertErrorResponse(payload: unknown, code: string) {
  assert(isRecord(payload), "Expected error payload to be an object.");
  assert(payload.ok === false, "Expected error payload.ok to be false.");
  assert(isRecord(payload.error), "Expected error payload.error to be an object.");
  assert(payload.error.code === code, `Expected error code to be ${code}.`);
}

const tests: ApiTestCase[] = [
  {
    name: "compound detail by accession",
    path: "/api/compounds/HMDB0000064",
    validate: assertCompoundDetailResponse,
  },
  {
    name: "compound name search",
    path: "/api/compounds/search?query=Creatine&page=1&limit=10",
    validate: assertPaginatedResponse,
  },
  {
    name: "compound spectra list",
    path: "/api/compounds/HMDB0000064/spectra?page=1&limit=10",
    validate: assertPaginatedResponse,
  },
  {
    name: "metadata positive adducts",
    path: "/api/metadata/adducts?ionMode=positive",
    validate: assertArrayResponse,
  },
  {
    name: "metadata source terms",
    path: "/api/metadata/source-terms",
    validate: assertArrayResponse,
  },
  {
    name: "neutral mass exact search",
    path: "/api/search/neutral-mass?queryMass=131.069476547&page=1&limit=10",
    validate: assertPaginatedResponse,
  },
  {
    name: "neutral mass tolerance search",
    path: "/api/search/neutral-mass?queryMass=131.069476547&tolerance=10&toleranceUnit=ppm&page=1&limit=10",
    validate: assertPaginatedResponse,
  },
  {
    name: "LC-MS/adduct Unknown search",
    path: "/api/search/adduct-mz?queryMz=132.076752547&ionMode=positive&tolerance=10&toleranceUnit=ppm&page=1&limit=10",
    validate: assertPaginatedResponse,
  },
  {
    name: "LC-MS/adduct selected adduct IDs repeated params",
    path: "/api/search/adduct-mz?queryMz=132.076752547&ionMode=positive&adductIds=13&adductIds=14&tolerance=10&toleranceUnit=ppm&page=1&limit=10",
    validate: assertPaginatedResponse,
  },
  {
    name: "LC-MS/adduct selected adduct IDs comma-separated",
    path: "/api/search/adduct-mz?queryMz=132.076752547&ionMode=positive&adductIds=13,14&tolerance=10&toleranceUnit=ppm&page=1&limit=10",
    validate: assertPaginatedResponse,
  },
  {
    name: "primitive fragment peak lookup",
    path: "/api/search/fragments?queryMz=57.034&tolerance=0.5&toleranceUnit=da&spectrumKind=both&polarity=both&page=1&limit=10",
    validate: assertPaginatedResponse,
  },
  {
    name: "primitive fragment lookup with Endogenous sourceTermId",
    path: "/api/search/fragments?queryMz=57.034&tolerance=0.5&toleranceUnit=da&sourceTermId=1&page=1&limit=10",
    validate: assertPaginatedResponse,
  },
  {
    name: "validation error: tolerance without toleranceUnit",
    path: "/api/search/neutral-mass?queryMass=131.069476547&tolerance=10&page=1&limit=10",
    expectedStatus: 400,
    validate: (payload) => assertErrorResponse(payload, "VALIDATION_ERROR"),
  },
  {
    name: "not found: missing compound",
    path: "/api/compounds/HMDB9999999",
    expectedStatus: 404,
    validate: (payload) => assertErrorResponse(payload, "NOT_FOUND"),
  },
];

async function runTest(test: ApiTestCase) {
  const url = new URL(test.path, BASE_URL);
  const expectedStatus = test.expectedStatus ?? 200;

  const response = await fetch(url);
  const text = await response.text();

  let payload: unknown;
  try {
    payload = text.length > 0 ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`Response was not valid JSON. Status=${response.status}. Body=${text}`);
  }

  assert(
    response.status === expectedStatus,
    `Expected status ${expectedStatus}, got ${response.status}. Body=${text}`,
  );

  test.validate?.(payload);

  return payload;
}

async function main() {
  console.log(`Testing API routes against: ${BASE_URL}`);
  console.log("Make sure the Next.js dev server is running first: npm run dev\n");

  let passed = 0;

  for (const test of tests) {
    try {
      await runTest(test);
      passed += 1;
      console.log(`PASS ${test.name}`);
    } catch (error) {
      console.error(`FAIL ${test.name}`);
      console.error(error);
      process.exitCode = 1;
      break;
    }
  }

  console.log(`\n${passed}/${tests.length} API tests passed.`);

  if (passed !== tests.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

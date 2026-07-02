import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";
const endpoint = `${API_BASE_URL.replace(/\/$/, "")}/api/research/ms-ms/candidate-ranking`;

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function postJson(body: unknown) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload as Record<string, any>;
}

async function main() {
  const fixturePath = resolve("scripts/fixtures/ml-candidate-ranking-example.json");
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));

  console.log(`[ml-smoke] POST ${endpoint}`);

  const nested = await postJson({ ...fixture, responseFormat: "nested" });
  assertCondition(nested.query, "Nested response missing query");
  assertCondition(nested.settings, "Nested response missing settings");
  assertCondition(nested.summary, "Nested response missing summary");
  assertCondition(Array.isArray(nested.warnings), "Nested response missing warnings array");
  assertCondition(Array.isArray(nested.candidates), "Nested response missing candidates array");

  const warningCodes = new Set(nested.warnings.map((warning: any) => warning.code));
  assertCondition(warningCodes.has("ADDUCT_LABEL_NOT_FOUND"), "Expected ADDUCT_LABEL_NOT_FOUND warning");
  assertCondition(warningCodes.has("TARGET_ACCESSION_INVALID_FORMAT"), "Expected TARGET_ACCESSION_INVALID_FORMAT warning");

  console.log(`[ml-smoke] nested candidates=${nested.candidates.length}`);

  const flat = await postJson({
    ...fixture,
    responseFormat: "flat",
    includeFeatureMetadata: true,
    includeWarningsInFlatRows: true,
    includeClientMetadataInFlatRows: true,
  });

  assertCondition(flat.query, "Flat response missing query");
  assertCondition(flat.settings, "Flat response missing settings");
  assertCondition(flat.summary, "Flat response missing summary");
  assertCondition(Array.isArray(flat.warnings), "Flat response missing warnings array");
  assertCondition(Array.isArray(flat.trainingRows), "Flat response missing trainingRows array");
  assertCondition(flat.querySummaryRow, "Flat response missing querySummaryRow");
  assertCondition(flat.featureMetadata, "Flat response missing featureMetadata");
  assertCondition(Array.isArray(flat.featureMetadata.modelFeatureColumns), "Feature metadata missing modelFeatureColumns");

  console.log(`[ml-smoke] flat trainingRows=${flat.trainingRows.length}`);
  console.log("[ml-smoke] OK");
}

main().catch((error) => {
  console.error("[ml-smoke] FAILED");
  console.error(error);
  process.exit(1);
});

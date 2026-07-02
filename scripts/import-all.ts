import "./load-env";
import { spawn } from "node:child_process";

interface Step {
  name: string;
  command: string;
}

const TEST_ENV_KEYS = [
  "IMPORT_MAX_ROWS",
  "SPECTRA_IMPORT_MAX_ROWS",
  "COMPUTE_ADDUCT_ACCESSION",
  "COMPUTE_ADDUCT_MAX_COMPOUNDS",
];

const STEPS: Step[] = [
  {
    name: "Import metabolites",
    command: "npm run db:import:metabolites",
  },
  {
    name: "Seed adducts",
    command: "npm run db:seed:adducts",
  },
  {
    name: "Compute compound adducts",
    command: "npm run db:compute:adducts",
  },
  {
    name: "Import predicted MS/MS spectra",
    command: "npm run db:import:spectra:predicted",
  },
  {
    name: "Import experimental MS/MS spectra",
    command: "npm run db:import:spectra:experimental",
  },
];

function assertNoTestEnv(): void {
  if (process.env.ALLOW_TEST_IMPORT_ALL === "true") {
    console.warn("ALLOW_TEST_IMPORT_ALL=true detected. Test env checks skipped.");
    return;
  }

  const activeTestKeys = TEST_ENV_KEYS.filter((key) => {
    const value = process.env[key];
    return value !== undefined && value.trim() !== "";
  });

  if (activeTestKeys.length === 0) {
    return;
  }

  throw new Error(
    [
      "Refusing to run full import because test/import limit env variables are set:",
      ...activeTestKeys.map((key) => `- ${key}=${process.env[key]}`),
      "",
      "Remove/comment these variables from .env.local, or set:",
      "ALLOW_TEST_IMPORT_ALL=true",
    ].join("\n")
  );
}

function runStep(step: Step): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("");
    console.log("============================================================");
    console.log(`Starting: ${step.name}`);
    console.log(`Command: ${step.command}`);
    console.log("============================================================");

    const child = spawn(step.command, {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        console.log("");
        console.log(`Completed: ${step.name}`);
        resolve();
        return;
      }

      reject(new Error(`${step.name} failed with exit code ${code}.`));
    });
  });
}

async function main(): Promise<void> {
  assertNoTestEnv();

  console.log("HMDB import-all pipeline starting...");
  console.log(`Steps: ${STEPS.length}`);

  for (const step of STEPS) {
    await runStep(step);
  }

  console.log("");
  console.log("============================================================");
  console.log("Import-all pipeline completed successfully.");
  console.log("============================================================");
}

main().catch((error) => {
  console.error("");
  console.error("Import-all pipeline failed.");
  console.error(error);
  process.exit(1);
});
import "./load-env";
import path from "node:path";
import { readJsonlGz } from "../src/services/import-utils";

type Mode = "predicted" | "experimental";

function getMode(): Mode {
  const mode = process.argv[2];

  if (mode !== "predicted" && mode !== "experimental") {
    throw new Error("Usage: tsx scripts/inspect-spectra-jsonl.ts predicted|experimental");
  }

  return mode;
}

function getFilePath(mode: Mode): string {
  const envKey =
    mode === "predicted"
      ? "PREDICTED_SPECTRA_JSONL_GZ"
      : "EXPERIMENTAL_SPECTRA_JSONL_GZ";

  return path.resolve(process.env[envKey] ?? "");
}

async function main(): Promise<void> {
  const mode = getMode();
  const filePath = getFilePath(mode);

  let rows = 0;
  let rowsWithPeaksArray = 0;
  let rowsWithNonEmptyPeaks = 0;
  let totalPeaks = 0;

  console.log(`Inspecting ${mode} spectra file: ${filePath}`);
  console.log("");

  for await (const row of readJsonlGz<Record<string, unknown>>(filePath)) {
    rows += 1;

    if (rows <= 5) {
      console.log(`Row ${rows} top-level keys:`);
      console.log(Object.keys(row));
      console.log("");

      console.log(`Row ${rows} sample:`);
      console.dir(row, { depth: 3 });
      console.log("");
    }

    const peaks = row.peaks;

    if (Array.isArray(peaks)) {
      rowsWithPeaksArray += 1;

      if (peaks.length > 0) {
        rowsWithNonEmptyPeaks += 1;
        totalPeaks += peaks.length;

        if (rowsWithNonEmptyPeaks <= 3) {
          console.log(`Sample non-empty peaks from row ${rows}:`);
          console.dir(peaks.slice(0, 3), { depth: 3 });
          console.log("");
        }
      }
    }

    if (rows >= 1000) {
      break;
    }
  }

  console.log("Summary for first 1000 rows:");
  console.log(`Rows inspected: ${rows}`);
  console.log(`Rows with peaks array: ${rowsWithPeaksArray}`);
  console.log(`Rows with non-empty peaks: ${rowsWithNonEmptyPeaks}`);
  console.log(`Total peaks found: ${totalPeaks}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
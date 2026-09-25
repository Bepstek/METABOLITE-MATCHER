import "./load-env";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../src/db/kysely";
import { generateMsMsCandidateRankingService } from "../src/services/ml.service";

interface QueryItem {
  queryKey: string;
  precursorMz: number;
  peakList: string;
  targetAccessions: string[];
  clientMetadata: any;
}

async function exportTrainingData() {
  console.log("Loading prepared queries...");
  const queriesPath = resolve("datasets/parsed/dstb_ml_queries.json");
  const queries: QueryItem[] = JSON.parse(await readFile(queriesPath, "utf8"));
  console.log(`Loaded ${queries.length} queries for training data export.`);

  const allTrainingRows: any[] = [];
  const allQuerySummaryRows: any[] = [];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    
    try {
      const response = await generateMsMsCandidateRankingService(db, {
        queryId: query.queryKey,
        queryKey: query.queryKey,
        precursorMz: query.precursorMz,
        peakList: query.peakList,
        targetAccessions: query.targetAccessions,
        precursorTolerance: 10,
        precursorToleranceUnit: "ppm",
        spectrumKind: "experimental",
        polarity: "positive",
        minMatchedPeaks: 3,
        returnCandidateLimit: 500,
        responseFormat: "flat",
        includeClientMetadataInFlatRows: true,
        includeWarningsInFlatRows: true,
        includeFeatureMetadata: true,
        clientMetadata: query.clientMetadata
      });

      if (response.trainingRows) {
        allTrainingRows.push(...response.trainingRows);
      }
      if (response.querySummaryRow) {
        allQuerySummaryRows.push(response.querySummaryRow);
      }

      if ((i + 1) % 20 === 0) {
        console.log(`Exported ${i + 1}/${queries.length} queries...`);
      }
    } catch (err: any) {
      console.error(`Error exporting query ${query.queryKey}:`, err.message);
    }
  }

  const outputPath = resolve("datasets/parsed/ml_training_dataset.json");
  const outputData = {
    trainingRows: allTrainingRows,
    querySummaryRows: allQuerySummaryRows
  };

  await writeFile(outputPath, JSON.stringify(outputData, null, 2), "utf8");
  console.log(`\nExport completed!`);
  console.log(`Total training candidate rows: ${allTrainingRows.length}`);
  console.log(`Total query summary rows: ${allQuerySummaryRows.length}`);
  console.log(`Saved training dataset to ${outputPath}`);
}

exportTrainingData()
  .catch((err) => {
    console.error("Export run failed:", err);
  })
  .finally(async () => {
    await db.destroy();
  });

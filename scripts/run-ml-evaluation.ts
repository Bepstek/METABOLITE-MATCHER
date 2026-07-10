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

async function runEvaluation() {
  console.log("Loading prepared queries...");
  const queriesPath = resolve("datasets/parsed/dstb_ml_queries.json");
  const queries: QueryItem[] = JSON.parse(await readFile(queriesPath, "utf8"));
  console.log(`Loaded ${queries.length} queries for evaluation.`);

  let totalQueries = 0;
  let targetHits = 0;

  // Cosine ranking metrics
  let cosineMrrSum = 0;
  let cosineHitAt1 = 0;
  let cosineHitAt5 = 0;
  let cosineHitAt10 = 0;
  let cosineHitAt50 = 0;
  let cosineHitAt100 = 0;

  // Precursor mass ranking metrics
  let massMrrSum = 0;
  let massHitAt1 = 0;
  let massHitAt5 = 0;
  let massHitAt10 = 0;
  let massHitAt50 = 0;
  let massHitAt100 = 0;

  const results: any[] = [];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    
    // We can evaluate with minMatchedPeaks = 3 as recommended in the training plan
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
        responseFormat: "nested",
        clientMetadata: query.clientMetadata
      });

      totalQueries++;
      
      const bestCosineRank = response.summary.bestTargetCompoundCosineRank;
      const bestMassRank = response.summary.bestTargetCompoundPrecursorMassRank;

      if (response.summary.targetCompoundHit) {
        targetHits++;
      }

      // Cosine Rank Stats
      if (bestCosineRank !== null) {
        cosineMrrSum += 1.0 / bestCosineRank;
        if (bestCosineRank <= 1) cosineHitAt1++;
        if (bestCosineRank <= 5) cosineHitAt5++;
        if (bestCosineRank <= 10) cosineHitAt10++;
        if (bestCosineRank <= 50) cosineHitAt50++;
        if (bestCosineRank <= 100) cosineHitAt100++;
      }

      // Mass Rank Stats
      if (bestMassRank !== null) {
        massMrrSum += 1.0 / bestMassRank;
        if (bestMassRank <= 1) massHitAt1++;
        if (bestMassRank <= 5) massHitAt5++;
        if (bestMassRank <= 10) massHitAt10++;
        if (bestMassRank <= 50) massHitAt50++;
        if (bestMassRank <= 100) massHitAt100++;
      }

      results.push({
        queryKey: query.queryKey,
        precursorMz: query.precursorMz,
        targetAccessions: query.targetAccessions,
        returnedCandidates: response.summary.returnedCandidateCount,
        targetHit: response.summary.targetCompoundHit,
        bestCosineRank,
        bestMassRank
      });

      if (totalQueries % 20 === 0) {
        console.log(`Evaluated ${totalQueries}/${queries.length} queries...`);
      }
    } catch (err: any) {
      console.error(`Error processing query ${query.queryKey}:`, err.message);
    }
  }

  // Calculate percentages
  const mrrCosine = totalQueries > 0 ? cosineMrrSum / totalQueries : 0;
  const mrrMass = totalQueries > 0 ? massMrrSum / totalQueries : 0;

  const pct = (val: number) => totalQueries > 0 ? ((val / totalQueries) * 100).toFixed(2) : "0.00";

  console.log("\n=== EVALUATION COMPLETED ===");
  console.log(`Total queries processed: ${totalQueries}`);
  console.log(`Queries with target compounds generated (Hit@500 recall): ${targetHits} (${pct(targetHits)}%)`);
  console.log("\n--- Cosine Similarity Ranking (Baseline) ---");
  console.log(`MRR: ${mrrCosine.toFixed(4)}`);
  console.log(`Hit@1: ${cosineHitAt1} (${pct(cosineHitAt1)}%)`);
  console.log(`Hit@5: ${cosineHitAt5} (${pct(cosineHitAt5)}%)`);
  console.log(`Hit@10: ${cosineHitAt10} (${pct(cosineHitAt10)}%)`);
  console.log(`Hit@50: ${cosineHitAt50} (${pct(cosineHitAt50)}%)`);
  console.log(`Hit@100: ${cosineHitAt100} (${pct(cosineHitAt100)}%)`);

  console.log("\n--- Precursor Mass Error Ranking ---");
  console.log(`MRR: ${mrrMass.toFixed(4)}`);
  console.log(`Hit@1: ${massHitAt1} (${pct(massHitAt1)}%)`);
  console.log(`Hit@5: ${massHitAt5} (${pct(massHitAt5)}%)`);
  console.log(`Hit@10: ${massHitAt10} (${pct(massHitAt10)}%)`);
  console.log(`Hit@50: ${massHitAt50} (${pct(massHitAt50)}%)`);
  console.log(`Hit@100: ${massHitAt100} (${pct(massHitAt100)}%)`);

  // Build the markdown report
  const timestamp = new Date().toISOString();
  const mdReport = `# LC-MS/MS Candidate Ranking Model Evaluation Report

**Date generated:** ${timestamp}
**Dataset source:** \`DSTB_Compound ID (1).xlsx\` (Sheet: \`Compound ID-3\`)
**MS/MS spectra file:** \`07012026_DSTB_FragmentationList text file.txt\`

## Summary

This evaluation measures the performance of candidate generation and compares two baseline ranking metrics:
1. **Cosine Similarity (Baseline):** Sorted by spectral peak matching similarity first, then matched peak counts.
2. **Precursor Mass Error:** Sorted by precursor absolute $m/z$ error (ppm) first, then cosine similarity.

### Core Metrics

| Metric | Cosine Similarity Ranking | Precursor Mass Error Ranking |
| :--- | :--- | :--- |
| **MRR (Mean Reciprocal Rank)** | **${mrrCosine.toFixed(4)}** | **${mrrMass.toFixed(4)}** |
| **Hit@1 Accuracy** | ${cosineHitAt1} (${pct(cosineHitAt1)}%) | ${massHitAt1} (${pct(massHitAt1)}%) |
| **Hit@5 Accuracy** | ${cosineHitAt5} (${pct(cosineHitAt5)}%) | ${massHitAt5} (${pct(massHitAt5)}%) |
| **Hit@10 Accuracy** | ${cosineHitAt10} (${pct(cosineHitAt10)}%) | ${massHitAt10} (${pct(massHitAt10)}%) |
| **Hit@50 Accuracy** | ${cosineHitAt50} (${pct(cosineHitAt50)}%) | ${massHitAt50} (${pct(massHitAt50)}%) |
| **Hit@100 Accuracy** | ${cosineHitAt100} (${pct(cosineHitAt100)}%) | ${massHitAt100} (${pct(massHitAt100)}%) |
| **Overall Target Recall (Hit@500)** | ${targetHits} (${pct(targetHits)}%) | ${targetHits} (${pct(targetHits)}%) |

*Evaluated total queries: **${totalQueries}***

## Key Observations

1. **Candidate Retrieval Capacity:** Out of ${totalQueries} queries, the engine successfully retrieved the target confirmed compound in **${pct(targetHits)}%** of cases inside the top 500 candidate limit.
2. **Precursor Mass vs. Cosine Score:** Precursor mass error ranking shows **${mrrMass > mrrCosine ? 'better' : 'comparable'}** Mean Reciprocal Rank (${mrrMass.toFixed(4)} vs ${mrrCosine.toFixed(4)}). This highlights the value of precursor mass accuracy as a major feature in the final combined ranking model.

## Detailed Query Log

| Query Key (se) | Precursor $m/z$ | Target Accessions | Candidates | Hit@500 | Cosine Rank | Mass Rank |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${results.map(r => `| \`${r.queryKey}\` | ${r.precursorMz.toFixed(6)} | ${r.targetAccessions.join(", ")} | ${r.returnedCandidates} | ${r.targetHit ? "Yes" : "No"} | ${r.bestCosineRank ?? "N/A"} | ${r.bestMassRank ?? "N/A"} |`).join("\n")}
`;

  const reportPath = resolve("docs/ml/candidate-ranking-evaluation.md");
  await writeFile(reportPath, mdReport, "utf8");
  console.log(`Saved evaluation report to ${reportPath}`);
}

runEvaluation()
  .catch((err) => {
    console.error("Evaluation run failed:", err);
  })
  .finally(async () => {
    await db.destroy();
  });

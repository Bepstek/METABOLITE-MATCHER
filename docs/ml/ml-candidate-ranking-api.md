# LC-MS/MS Candidate Ranking API Design

## Purpose

This document defines the first research/ML-oriented candidate-ranking API for the HMDB-like search engine.

The endpoint is a **feature-generation API**, not the ranking model itself.

It takes one cleaned LC-MS/MS query from the client dataset and returns spectrum-level candidate rows with model-ready features, precursor/adduct evidence, cosine evidence, coverage features, and optional labels.

---

## Endpoint

```txt
POST /api/research/ms-ms/candidate-ranking
```

This endpoint is intentionally separate from the user-facing endpoint:

```txt
POST /api/search/ms-ms
```

Reason:

- `/api/search/ms-ms` supports the web UI and returns compact human-facing search results.
- `/api/research/ms-ms/candidate-ranking` supports training/evaluation workflows and returns feature-rich candidate rows.

---

## v1 Scope

### Included

- One query per request.
- Required `precursorMz`.
- Required `peakList`.
- Optional `targetAccession` and/or `targetAccessions`.
- Spectrum-level candidates.
- Configurable candidate limit.
- Precursor/adduct m/z prefilter using `compound_adducts.theoretical_mz`.
- Greedy cosine scoring features.
- Mass error features.
- Matched peak features.
- Query/library/balanced coverage features.
- Candidate labels for supervised or weakly supervised ranking.
- Candidate rank fields.

### Deferred

- Batch endpoint for all client rows.
- Compound-level grouped candidate output.
- MSP parser endpoint.
- Automatic `Precursor_type` to adduct mapping.
- Model training inside the app.
- Stored training runs / experiment tracking.

---

## Request Shape

```ts
type CandidateRankingRequest = {
  queryId?: string;
  queryKey?: string;

  precursorMz: number;
  peakList: string;

  precursorTolerance?: number;
  precursorToleranceUnit?: "da" | "ppm";
  precursorAdductIds?: number[];

  spectrumKind?: "experimental" | "predicted" | "both";
  polarity?: "positive" | "negative" | "both";
  sourceTermId?: number;
  minMatchedPeaks?: number;

  candidateLimit?: 100 | 500 | 1000 | 2000;

  targetAccession?: string;
  targetAccessions?: string[];
};
```

---

## Required Fields

### `precursorMz`

The ML API requires `precursorMz` because the client dataset contains a query feature m/z / adduct m/z value, and mass error is one of the proposed model features.

This value is compared against:

```txt
compound_adducts.theoretical_mz
```

Important distinction:

```txt
This is theoretical precursor/adduct m/z matching.
It is not stored spectrum precursor_mz matching.
```

The current schema does not contain a first-class `spectra.precursor_mz` column.

### `peakList`

The peak list is the query MS/MS fragment spectrum.

Format:

```txt
m/z intensity
```

Accepted separators:

```txt
space
tab
comma
multiple whitespace
```

Only the first two numeric columns are used.

---

## Defaults

```txt
precursorTolerance = 5
precursorToleranceUnit = ppm
precursorAdductIds = []
spectrumKind = experimental
polarity = positive
minMatchedPeaks = 3
candidateLimit = 500
```

`candidateLimit` allowed values:

```txt
100
500
1000
2000
```

---

## Label Input

The API supports both a single target accession and multiple target accessions:

```ts
targetAccession?: string;
targetAccessions?: string[];
```

The service normalizes both into:

```ts
normalizedTargetAccessions: string[];
```

This is required because the client dataset can contain multiple valid HMDB IDs for the same query feature.

Example:

```ts
{
  queryKey: "9.97_313.2740m/z",
  precursorMz: 313.2740034,
  targetAccessions: ["HMDB0061864", "HMDB0000673"]
}
```

---

## Candidate Unit

For v1:

```txt
one row = one spectrum candidate
```

Each row maps to one exact library spectrum and one linked compound.

This keeps the model simple and makes every cosine score auditable.

Future work may add:

```txt
compound-level grouped candidates
```

---

## Candidate Generation Flow

For each request:

```txt
1. Parse and normalize query peak list.
2. Use precursorMz against compound_adducts.theoretical_mz.
3. Get precursor/adduct candidate compounds.
4. Restrict spectrum candidate retrieval to those compound IDs.
5. Apply fragment-window candidate retrieval.
6. Fetch full candidate spectrum peaks.
7. Compute greedy cosine similarity.
8. Compute precursor mass error features.
9. Compute coverage features.
10. Add labels if target accession data is provided.
11. Return candidate rows and summary metadata.
```

If no precursor/adduct candidates are found:

```txt
return candidates = []
return summary explaining that precursor/adduct prefilter found no candidate compounds
```

The API must not silently fall back to fragment-only search.

---

## Response Shape

```ts
type CandidateRankingResponse = {
  query: {
    queryId: string | null;
    queryKey: string | null;
    precursorMz: number;
    targetAccessions: string[];
  };

  settings: {
    precursorTolerance: number;
    precursorToleranceUnit: "da" | "ppm";
    spectrumKind: "experimental" | "predicted" | "both";
    polarity: "positive" | "negative" | "both";
    sourceTermId: number | null;
    minMatchedPeaks: number;
    candidateLimit: 100 | 500 | 1000 | 2000;
  };

  summary: {
    precursorCandidateCompoundCount: number;
    precursorCandidateAdductCount: number;
    returnedCandidateCount: number;
    confirmedPositiveCount: number;
    targetHit: boolean;
    bestTargetCosineRank: number | null;
    bestTargetPrecursorMassRank: number | null;
  };

  candidates: CandidateRankingRow[];
};
```

---

## Candidate Row Shape

```ts
type CandidateRankingRow = {
  queryId: string | null;
  queryKey: string | null;

  candidate: {
    compoundId: number;
    accession: string;
    name: string;
    chemicalFormula: string | null;
    spectrumId: number;
    hmdbSpectrumId: number;
    spectrumType: "Experimental" | "Predicted";
    predicted: boolean;
    polarity: string | null;
    ionizationMode: string | null;
    instrumentType: string | null;
    collisionEnergyVoltage: number | null;
  };

  label: {
    value: 1 | 0;
    type: "confirmed_positive" | "weak_negative" | "unlabeled";
    targetAccessions: string[];
  };

  ranks: {
    cosineRank: number;
    precursorMassRank: number | null;
    combinedInitialRank: number;
  };

  precursorFeatures: {
    precursorMz: number;
    bestAdductId: number | null;
    bestAdductLabel: string | null;
    bestTheoreticalMz: number | null;
    massErrorDa: number | null;
    massErrorPpm: number | null;
    absoluteMassErrorDa: number | null;
    absoluteMassErrorPpm: number | null;
  };

  spectralFeatures: {
    cosineSimilarity: number;
    cosinePercent: number;
    cosineNumerator: number;
    queryNorm: number;
    libraryNorm: number;
    matchedPeaks: number;
    totalQueryPeaks: number;
    totalLibraryPeaks: number;
    queryCoverage: number;
    libraryCoverage: number;
    balancedCoverage: number;
  };

  modelFeatures: {
    cosineSimilarity: number;
    absoluteMassErrorPpm: number | null;
    matchedPeaks: number;
    queryCoverage: number;
    libraryCoverage: number;
    balancedCoverage: number;
    cosineRank: number;
    precursorMassRank: number | null;
  };
};
```

---

## Ranking Fields

The returned candidates should be sorted by the current cosine-based ranking, but include both rank types.

### `cosineRank`

Rank after sorting by:

```txt
cosinePercent desc
matchedPeaks desc
compound name asc
hmdbSpectrumId asc
```

### `precursorMassRank`

Rank after sorting by:

```txt
absoluteMassErrorPpm asc
cosinePercent desc
matchedPeaks desc
```

### `combinedInitialRank`

For v1, this can equal `cosineRank`.

Future versions may define a handcrafted combined rank.

---

## Feature Definitions

### Cosine Similarity

```txt
cosineSimilarity = cosineScore
cosinePercent = cosineScore × 100
```

Higher is better.

### Mass Error

```txt
massErrorDa = bestTheoreticalMz - precursorMz
massErrorPpm = ((bestTheoreticalMz - precursorMz) / bestTheoreticalMz) × 1,000,000
absoluteMassErrorPpm = abs(massErrorPpm)
```

Lower `absoluteMassErrorPpm` is better.

### Matched Peaks

```txt
matchedPeaks = number of selected one-to-one query/library peak matches
```

Higher is better.

### Coverage Features

```txt
queryCoverage = matchedPeaks / totalQueryPeaks
libraryCoverage = matchedPeaks / totalLibraryPeaks
balancedCoverage = matchedPeaks / sqrt(totalQueryPeaks × totalLibraryPeaks)
```

All coverage values should be `0` when the denominator is invalid or zero.

---

## Label Semantics

If no target accessions are provided:

```txt
label.value = 0
label.type = unlabeled
```

If target accessions are provided:

```txt
candidate accession in targetAccessions
→ label.value = 1
→ label.type = confirmed_positive

candidate accession not in targetAccessions
→ label.value = 0
→ label.type = weak_negative
```

Important:

```txt
Weak negatives are not guaranteed false compounds.
```

This is because the client dataset may not contain every valid compound for a query feature.

---

## Example Request

```json
{
  "queryId": "9.97_313.2740m/z",
  "queryKey": "9.97_313.2740m/z",
  "precursorMz": 313.2740034,
  "peakList": "73.0493 1299.2860\n86.0983 3487.7747\n103.0765 1874.5762",
  "precursorTolerance": 5,
  "precursorToleranceUnit": "ppm",
  "spectrumKind": "experimental",
  "polarity": "positive",
  "minMatchedPeaks": 3,
  "candidateLimit": 500,
  "targetAccessions": ["HMDB0061864", "HMDB0000673"]
}
```

---

## Example Output Snippet

```json
{
  "query": {
    "queryId": "9.97_313.2740m/z",
    "queryKey": "9.97_313.2740m/z",
    "precursorMz": 313.2740034,
    "targetAccessions": ["HMDB0061864", "HMDB0000673"]
  },
  "summary": {
    "precursorCandidateCompoundCount": 25,
    "precursorCandidateAdductCount": 31,
    "returnedCandidateCount": 500,
    "confirmedPositiveCount": 2,
    "targetHit": true,
    "bestTargetCosineRank": 3,
    "bestTargetPrecursorMassRank": 1
  },
  "candidates": []
}
```

---

## Testing The Endpoint With curl

The ML candidate-ranking endpoint can be tested with a JSON fixture file and `curl.exe`. This is the recommended approach on Windows PowerShell because it avoids escaping multiline peak lists directly in the terminal.

Start the development server first:

```powershell
npm run dev
```

Then run the request from another PowerShell terminal:

```powershell
curl.exe -X POST "http://localhost:3000/api/research/ms-ms/candidate-ranking" `
  -H "Content-Type: application/json" `
  --data-binary "@scripts/fixtures/ml-candidate-ranking-example.json" `
  -o ml-candidate-ranking-response.json
```

This command:

- sends the fixture JSON from `scripts/fixtures/ml-candidate-ranking-example.json`,
- posts it to `POST /api/research/ms-ms/candidate-ranking`,
- saves the full JSON response to `ml-candidate-ranking-response.json`.

Open the output file to inspect the complete response:

```txt
ml-candidate-ranking-response.json
```

This is better than using `console.dir()` for large nested responses because the saved file preserves the full output.

### Nested response test

For visualization/debugging, the fixture should contain:

```json
"responseFormat": "nested"
```

Expected top-level response sections include:

```txt
query
settings
summary
warnings
candidates
```

### Flat response test

For Python/model-training export, copy the fixture and set:

```json
"responseFormat": "flat"
```

Example fixture path:

```txt
scripts/fixtures/ml-candidate-ranking-example-flat.json
```

Then run:

```powershell
curl.exe -X POST "http://localhost:3000/api/research/ms-ms/candidate-ranking" `
  -H "Content-Type: application/json" `
  --data-binary "@scripts/fixtures/ml-candidate-ranking-example-flat.json" `
  -o ml-candidate-ranking-flat-response.json
```

The flat response is intended for training-data export and should include:

```txt
query
settings
summary
warnings
trainingRows
```

### Optional JSON formatting

If the output is minified, format it with Node:

```powershell
node -e "const fs=require('fs'); const f='ml-candidate-ranking-response.json'; const j=JSON.parse(fs.readFileSync(f,'utf8')); fs.writeFileSync(f, JSON.stringify(j,null,2)); console.log('formatted', f)"
```

For the flat output:

```powershell
node -e "const fs=require('fs'); const f='ml-candidate-ranking-flat-response.json'; const j=JSON.parse(fs.readFileSync(f,'utf8')); fs.writeFileSync(f, JSON.stringify(j,null,2)); console.log('formatted', f)"
```

### Notes

Use `curl.exe` explicitly in PowerShell. In some Windows environments, `curl` can resolve to a PowerShell alias instead of the curl executable.

The fixture can intentionally use a broad precursor tolerance for smoke testing. For realistic ML candidate generation, use a realistic precursor tolerance such as:

```json
"precursorTolerance": 5,
"precursorToleranceUnit": "ppm"
```

---

## Implementation Notes

This endpoint should reuse the existing LC-MS/MS candidate generation and cosine scoring logic as much as possible.

Recommended implementation approach:

1. Extract shared peak parsing and cosine scoring helpers from `spectra.service.ts` if needed.
2. Add a research service function for candidate-ranking output.
3. Reuse precursor/adduct prefilter repository logic.
4. Add per-candidate best theoretical adduct matching details.
5. Return feature-rich rows instead of compact web UI rows.

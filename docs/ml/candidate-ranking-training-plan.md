# Candidate Ranking Model Training Plan

## Purpose

This document describes how the client dataset can be used to train and evaluate a simple candidate-ranking model for LC-MS/MS search.

The goal is to use the search engine to generate candidate spectra for each client query, compute ranking features, label candidate rows using client-provided HMDB IDs, and train a model that can improve candidate ordering.

---

## Client Dataset Characteristics

The client dataset contains rows similar to:

```txt
se	Compound ID	Adducts	Formula	Score	Fragmentation Score	Mass Error (ppm)	Isotope Similarity	Description	Neutral mass / query m/z	Charge	Retention time
11.16_299.2946m/z	HMDB0035474	M+H	C19H38O2	39.8	0	0.5068	99.58	Isopropyl hexadecanoate	299.2946081	1	11.1609
9.97_313.2740m/z	HMDB0061864	M+CH3OH+H	C18H32O2	39.1	0	1.0060	96.62	Dihomolinoleic acid	313.2740034	1	9.9744
9.97_313.2740m/z	HMDB0000673	M+CH3OH+H	C18H32O2	39.1	0	1.0060	96.62	Linoleic acid	313.2740034	1	9.9744
```

The dataset includes around 500 rows.

The dataset can contain multiple valid HMDB IDs for the same query feature.

---

## Is The Dataset Usable?

Yes, the dataset is usable as a **small weakly supervised candidate-ranking dataset**.

However, the labels should be interpreted carefully:

```txt
listed HMDB IDs = confirmed positives
unlisted generated candidates = weak negatives / unknowns
```

The unlisted candidates should not be treated as guaranteed false compounds because the client dataset may not enumerate every valid output for a query feature.

---

## Dataset Normalization

### Grouping Rule

Client rows should be grouped by:

```txt
se + numeric precursor/adduct m/z
```

Example:

```txt
queryKey = 9.97_313.2740m/z
precursorMz = 313.2740034
```

Rows with the same query key and numeric precursor/adduct m/z become one ML query record.

### Why This Grouping Is Needed

The client dataset has cases like:

```txt
9.97_313.2740m/z → HMDB0061864
9.97_313.2740m/z → HMDB0000673
```

These should become one query record:

```ts
{
  queryKey: "9.97_313.2740m/z",
  precursorMz: 313.2740034,
  targetAccessions: ["HMDB0061864", "HMDB0000673"]
}
```

This prevents one valid target from being incorrectly labeled as a negative for the same query.

---

## Required Query Record Shape

The cleaned query record should look like:

```ts
type ClientMlQueryRecord = {
  queryKey: string;
  precursorMz: number;
  peakList: string;
  targetAccessions: string[];

  charge?: number;
  retentionTimeMinutes?: number;
  adductLabels?: string[];
  clientScore?: number;
  clientFragmentationScore?: number;
  clientMassErrorPpm?: number;
  isotopeSimilarity?: number;
  formula?: string;
  description?: string;
};
```

For v1 model training, the required fields are:

```txt
queryKey
precursorMz
peakList
targetAccessions
```

The other fields can be preserved as metadata.

---

## Candidate Generation

For each cleaned query record:

```txt
1. Send one request to POST /api/research/ms-ms/candidate-ranking.
2. Provide precursorMz, peakList, targetAccessions, and search settings.
3. Receive spectrum-level candidate feature rows.
4. Store feature rows in a training table or CSV/Parquet file.
```

Recommended default settings:

```txt
precursorTolerance = 5 ppm
spectrumKind = experimental
polarity = positive
minMatchedPeaks = 3
candidateLimit = 500
```

Candidate limit should be configurable:

```txt
100
500
1000
2000
```

---

## Generating Candidate Rows From A Fixture

During development, one cleaned query record can be stored as a fixture file:

```txt
scripts/fixtures/ml-candidate-ranking-example.json
```

The candidate-ranking API can then be called with `curl.exe` and saved to a response file:

```powershell
curl.exe -X POST "http://localhost:3000/api/research/ms-ms/candidate-ranking" `
  -H "Content-Type: application/json" `
  --data-binary "@scripts/fixtures/ml-candidate-ranking-example.json" `
  -o ml-candidate-ranking-response.json
```

For model training, use a fixture with:

```json
"responseFormat": "flat"
```

and save the output as:

```txt
ml-candidate-ranking-flat-response.json
```

The flat output can be loaded by Python and converted into a CSV, Parquet file, or training dataframe.

Recommended first check after generating each response:

```txt
summary.targetHit
summary.confirmedPositiveCount
summary.bestTargetCosineRank
summary.bestTargetPrecursorMassRank
warnings
trainingRows.length
```

## Candidate Labels

For each returned candidate:

```txt
candidate.accession in targetAccessions
→ label = 1
→ labelType = confirmed_positive

candidate.accession not in targetAccessions
→ label = 0
→ labelType = weak_negative
```

If no target accessions are provided, candidates are unlabeled:

```txt
label = 0
labelType = unlabeled
```

---

## Baseline Model Features

The first model should use simple numerical features:

```txt
cosineSimilarity
absoluteMassErrorPpm
matchedPeaks
queryCoverage
libraryCoverage
balancedCoverage
cosineRank
precursorMassRank
```

Feature definitions:

```txt
cosineSimilarity = greedy cosine score
absoluteMassErrorPpm = abs((bestTheoreticalMz - precursorMz) / bestTheoreticalMz × 1,000,000)
matchedPeaks = number of selected matched query/library fragment peaks
queryCoverage = matchedPeaks / totalQueryPeaks
libraryCoverage = matchedPeaks / totalLibraryPeaks
balancedCoverage = matchedPeaks / sqrt(totalQueryPeaks × totalLibraryPeaks)
```

---

## Recommended Baseline Models

Because the dataset has around 500 client rows, start with simple models:

```txt
logistic regression
random forest
gradient boosted trees
```

Avoid starting with deep learning because the dataset is small.

The first objective should be to learn whether combining precursor mass error, cosine score, matched peaks, and coverage improves ranking over cosine alone.

---

## Evaluation Before Training

Before training any model, compute candidate recall.

For each query:

```txt
Did at least one target accession appear among generated candidates?
```

Important metrics:

```txt
Recall@10
Recall@50
Recall@100
Recall@500
Recall@1000
```

If the target accession is not generated, the ranking model cannot recover it.

---

## Ranking Evaluation Metrics

After training, evaluate ranking quality with:

```txt
MRR = mean reciprocal rank
Recall@K
Hit@K
Top-1 accuracy
Top-5 accuracy
Top-10 accuracy
```

For multiple target accessions per query, a query is considered a hit if any confirmed target accession appears within the top K.

Example:

```txt
query targets = [HMDB0061864, HMDB0000673]
model top 5 contains HMDB0000673
→ Hit@5 = true
```

---

## Training Split Strategy

Use query-level splitting, not candidate-row-level splitting.

Correct:

```txt
train queries
validation queries
test queries
```

Incorrect:

```txt
randomly split candidate rows
```

Reason:

Candidate rows from the same query share the same precursor m/z, peak list, and target labels. Splitting candidate rows randomly would leak query-specific information across train and test sets.

Recommended first split:

```txt
70% train
15% validation
15% test
```

For 500 rows, also consider cross-validation.

---

## Weak Negative Caveat

The dataset should be documented as weakly supervised.

Reason:

```txt
Non-target candidates may include valid compounds that were not listed in the client dataset.
```

This means:

- Confirmed positives are reliable.
- Weak negatives are useful but imperfect.
- Model performance should be validated carefully.

If domain experts later provide additional valid HMDB IDs, update `targetAccessions` to include them.

---

## Recommended First Experiment

### Step 1: Generate candidate features

For every grouped query:

```txt
POST /api/research/ms-ms/candidate-ranking
```

Store all returned candidate rows.

### Step 2: Candidate recall analysis

Compute:

```txt
Recall@100
Recall@500
Recall@1000
```

If recall is low, adjust candidate generation before training.

### Step 3: Baseline ranking comparison

Compare simple rankers:

```txt
cosine only
absoluteMassErrorPpm only
matchedPeaks only
manual weighted score
```

### Step 4: Train simple ML model

Train a simple ranking/classification model using:

```txt
cosineSimilarity
absoluteMassErrorPpm
matchedPeaks
queryCoverage
libraryCoverage
balancedCoverage
cosineRank
precursorMassRank
```

### Step 5: Evaluate

Evaluate:

```txt
MRR
Hit@1
Hit@5
Hit@10
Recall@K
```

---

## Future Improvements

Potential future feature additions:

```txt
retention time
client isotope similarity
client mass error
adduct label match
formula compatibility
source category features
spectrum kind
polarity
collision energy
library peak count
query intensity entropy
top-k matched peak contribution ratios
```

Potential future API additions:

```txt
batch candidate export endpoint
MSP parser endpoint
compound-level grouped candidates
stored experiment runs
training set export as CSV/Parquet
```

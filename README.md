# HMDB Search Engine

A custom HMDB-like mass spectrometry search engine built with:

- TypeScript
- Next.js App Router
- PostgreSQL
- Kysely
- shadcn/ui
- Tailwind CSS
- Zod

The project implements a thesis-oriented HMDB-like search prototype with compound search, mass-based search, spectrum detail pages, and LC-MS/MS cosine similarity search.

Current core workflows:

- HMDB accession lookup
- Compound name search
- Compound detail pages with source hierarchy and related spectra
- Neutral mass search
- LC-MS/adduct m/z search
- Primitive fragment peak lookup
- MS/MS spectrum detail pages
- LC-MS/MS peak-list search using greedy cosine similarity
- Mirror spectrum comparison graph for LC-MS/MS search results

Future work such as CCS filtering, parent ion/adduct-aware MS/MS precursor filtering, compound-level result grouping, ML/research APIs, search history, and curated annotations is intentionally deferred until the core v1 workflows are stable.

---

## Requirements

Install:

- Node.js
- npm
- PostgreSQL
- Git

This project currently expects PostgreSQL to be available locally or through a managed database. Docker Compose for PostgreSQL is not required.

---

## Install Dependencies

```bash
npm install
```

---

## Environment Setup

Create `.env.local`:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hmdb_search
APP_NAME="HMDB Search"

HMDB_BASE_URL=https://hmdb.ca
NEXT_PUBLIC_HMDB_BASE_URL=https://hmdb.ca

IMPORT_BATCH_SIZE=1000
METABOLITES_JSONL_GZ=datasets/parsed/hmdb_metabolite_output.jsonl.gz

PREDICTED_SPECTRA_JSONL_GZ=datasets/parsed/hmdb_predicted_msms_spectra.jsonl.gz
EXPERIMENTAL_SPECTRA_JSONL_GZ=datasets/parsed/hmdb_experimental_msms_spectra.jsonl.gz

COMPUTE_ADDUCT_COMPOUND_BATCH_SIZE=1000

DEFAULT_SEARCH_LIMIT=10
MAX_SEARCH_LIMIT=100
```

Create `.env` too for `kysely-codegen`:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hmdb_search
```

Do not commit `.env` or `.env.local`.

---

## Database Setup

Create an empty PostgreSQL database manually:

```txt
hmdb_search
```

Apply the schema:

```bash
npm run db:schema:apply
```

Generate Kysely types:

```bash
npm run db:types:generate
```

Check database tables:

```bash
npm run db:check
```

---

## Dataset Files

Dataset files are not committed to Git.

Place parsed files in:

```txt
datasets/parsed/
```

Expected files:

```txt
hmdb_metabolite_output.jsonl.gz
hmdb_predicted_msms_spectra.jsonl.gz
hmdb_experimental_msms_spectra.jsonl.gz
```

Original HMDB XML parsing scripts are stored in:

```txt
parsers/python/
```

The TypeScript import scripts consume the parsed `.jsonl.gz` files.

---

## Import Data Individually

Recommended during development:

```bash
npm run db:import:metabolites
npm run db:seed:adducts
npm run db:compute:adducts
npm run db:import:spectra:predicted
npm run db:import:spectra:experimental
```

Check imports:

```bash
npm run db:check:metabolites
npm run db:check:spectra
```

---

## Full Import

After individual imports are tested, run:

```bash
npm run db:import:all
```

The full import runs:

```txt
1. import metabolites
2. seed adducts
3. compute compound_adducts
4. import predicted MS/MS spectra
5. import experimental MS/MS spectra
```

The full import script refuses to run if test-limit variables are set.

Remove or comment these before full import:

```env
# IMPORT_MAX_ROWS=1000
# SPECTRA_IMPORT_MAX_ROWS=1000
# COMPUTE_ADDUCT_ACCESSION=HMDB0000064
# COMPUTE_ADDUCT_MAX_COMPOUNDS=1
```

---

## Test Import Modes

Metabolite import test:

```env
IMPORT_MAX_ROWS=1000
```

Spectra import test:

```env
SPECTRA_IMPORT_MAX_ROWS=1000
```

Adduct computation test for Creatine:

```env
COMPUTE_ADDUCT_ACCESSION=HMDB0000064
```

---

## Verify Creatine Adducts

Run:

```bash
npm run db:verify:creatine-adducts
```

This verifies computed `compound_adducts` values for:

```txt
HMDB0000064
Creatine
```

---

## Backend Query and Service Smoke Test

After schema, generated Kysely types, and imports are ready, test the backend repository/service layer:

```bash
npm run db:test:search
```

This smoke test checks repository and service behavior such as:

- compound accession lookup
- compound name search and count
- compound source terms
- compound spectra list and count
- positive/negative adduct metadata
- level `<= 2` source terms metadata
- neutral mass search
- LC-MS/adduct m/z search with virtual Unknown behavior
- primitive fragment peak lookup
- source-filtered primitive fragment lookup using Endogenous
- validation failure for `tolerance` without `toleranceUnit`

Expected validation line:

```txt
[validation] tolerance without toleranceUnit failed as expected
```

Backend query/service contract documentation lives in:

```txt
docs/backend-query-service-contract.md
```

---

## Run Development Server

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

---

## Run Machine Learning Pipeline

The project includes a complete machine learning pipeline to prepare features, evaluate baselines, export training datasets, and train candidate-ranking models.

### Step 1: Prepare ML Queries
Align verified compound matches from client spreadsheets with the experimental fragmentation lists:
```bash
python scripts/prepare-ml-queries.py
```
This generates `datasets/parsed/dstb_ml_queries.json`.

### Step 2: Run Baseline Evaluation
Evaluate Cosine Similarity vs. Precursor Mass Error directly against the database:
```bash
npx tsx scripts/run-ml-evaluation.ts
```
This outputs a baseline evaluation report to `docs/ml/candidate-ranking-evaluation.md`.

### Step 3: Export Training Data Features
Generate the full candidate rows containing ranking features (cosine score, ppm error, balanced coverage, peak counts, etc.) labeled for ML:
```bash
npx tsx scripts/export-training-data.ts
```
This generates `datasets/parsed/ml_training_dataset.json`.

### Step 4: Train Machine Learning Classifiers
Standardize features, train classifiers (Random Forest, Gradient Boosting, SVM) using out-of-fold GroupKFold cross-validation, and rank prediction outputs:
```bash
python scripts/train-ml-models.py
```
This generates the comparison report in `docs/ml/ml-model-comparison.md`.

### Step 5: Plot Comparison Visualizations
Generate a bar chart comparing Mean Reciprocal Rank (MRR) and Hit@K accuracies across models:
```bash
python scripts/plot_ml_comparison.py
```
This saves the chart to `docs/ml_model_comparison.png`.

---

## Frontend Pages

Main navigation starts at:

```txt
/
```

Implemented frontend pages:

```txt
/search/compounds
/search/adduct-mz
/search/neutral-mass
/search/ms-ms
/compounds/[accession]
/spectra/ms-ms/[hmdbSpectrumId]
```

### Search pages

- `/search/compounds` searches compounds by name.
- `/search/adduct-mz` searches observed m/z values using adduct-aware LC-MS matching.
- `/search/neutral-mass` searches neutral monoisotopic masses.
- `/search/ms-ms` searches pasted MS/MS peak lists using greedy cosine similarity.

### Detail pages

- `/compounds/[accession]` shows compound metadata, names, source hierarchy, and related spectra.
- `/spectra/ms-ms/[hmdbSpectrumId]` shows spectrum metadata, compound context, peak graph, and sortable peak table.

Frontend usage documentation lives in:

```txt
docs/frontend-user-guide.md
```

---

## API Testing

API routes are implemented for compound, metadata, search, and spectrum detail workflows. Start the development server first:

```bash
npm run dev
```

Then test the API from another terminal.

### Compound routes

Lookup compound by accession:

```bash
curl "http://localhost:3000/api/compounds/HMDB0000064"
```

Search compounds by name:

```bash
curl "http://localhost:3000/api/compounds/search?query=Creatine&page=1&limit=10"
```

List spectra for a compound:

```bash
curl "http://localhost:3000/api/compounds/HMDB0000064/spectra?page=1&limit=10"
```

### Metadata routes

List enabled, searchable positive-mode adducts:

```bash
curl "http://localhost:3000/api/metadata/adducts?ionMode=positive"
```

List source terms for filter dropdowns:

```bash
curl "http://localhost:3000/api/metadata/source-terms"
```

### Spectrum routes

Lookup an MS/MS spectrum detail page payload:

```bash
curl "http://localhost:3000/api/spectra/ms-ms/1"
```

This returns spectrum metadata, linked compound context, and full peak list data for graph/table display.

### Search routes

Neutral mass exact/practical-exact search:

```bash
curl "http://localhost:3000/api/search/neutral-mass?queryMass=131.069476547&page=1&limit=10"
```

Neutral mass tolerance search:

```bash
curl "http://localhost:3000/api/search/neutral-mass?queryMass=131.069476547&tolerance=10&toleranceUnit=ppm&page=1&limit=10"
```

LC-MS/adduct m/z search using virtual Unknown behavior:

```bash
curl "http://localhost:3000/api/search/adduct-mz?queryMz=132.076752547&ionMode=positive&tolerance=10&toleranceUnit=ppm&page=1&limit=10"
```

LC-MS/adduct m/z search with selected adduct IDs:

```bash
curl "http://localhost:3000/api/search/adduct-mz?queryMz=132.076752547&ionMode=positive&adductIds=13&tolerance=10&toleranceUnit=ppm&page=1&limit=10"
```

Primitive fragment peak lookup:

```bash
curl "http://localhost:3000/api/search/fragments?queryMz=57.034&tolerance=0.5&toleranceUnit=da&spectrumKind=both&polarity=both&page=1&limit=10"
```

Primitive fragment peak lookup with Endogenous source filtering requires a `sourceTermId`. Find the ID from:

```bash
curl "http://localhost:3000/api/metadata/source-terms"
```

Then call:

```bash
curl "http://localhost:3000/api/search/fragments?queryMz=57.034&tolerance=0.5&toleranceUnit=da&sourceTermId=1&page=1&limit=10"
```

### LC-MS/MS cosine search route

LC-MS/MS search uses `POST` because peak lists can be long and multiline:

```bash
curl -X POST "http://localhost:3000/api/search/ms-ms" \
  -H "Content-Type: application/json" \
  -d '{
    "peakList": "109.2 3.407\n124.2 47.4946\n124.5 3.0944\n170.16 100\n170.52 13.2397",
    "tolerance": 0.1,
    "toleranceUnit": "da",
    "spectrumKind": "experimental",
    "polarity": "positive",
    "sourceTermId": null,
    "minMatchedPeaks": 3,
    "page": 1,
    "limit": 10
  }'
```

LC-MS/MS search request fields:

```txt
peakList: multiline m/z intensity list
tolerance: positive numeric fragment tolerance
toleranceUnit: da | ppm
spectrumKind: experimental | predicted | both
polarity: positive | negative | both
sourceTermId: optional positive source term ID
minMatchedPeaks: positive integer, default 3
page: positive integer
limit: 10 | 25 | 50 | 100
```

LC-MS/MS search returns:

```txt
normalized query peaks
ranked spectrum rows
cosineScore
cosinePercent
cosineNumerator
queryNorm
libraryNorm
matched peak counts
top matched peak pairs
pagination metadata
```

Cosine similarity design documentation lives in:

```txt
docs/cosine-similarity-design.md
```

#### Optional precursor/adduct m/z prefilter

`POST /api/search/ms-ms` supports optional theoretical precursor/adduct m/z prefilter fields:

```txt
precursorMz: optional numeric precursor/adduct m/z
precursorTolerance: numeric tolerance, default 5
precursorToleranceUnit: da | ppm, default ppm
precursorAdductIds: optional selected adduct IDs
```

If `precursorMz` is provided, the search first filters candidate compounds by comparing `precursorMz` against:

```txt
compound_adducts.theoretical_mz
```

Then the normal fragment-window candidate retrieval and cosine scoring are applied.

This is not stored spectrum precursor metadata filtering. The current `spectra` table does not have a first-class `precursor_mz` column.

Example request with precursor/adduct m/z prefilter:

```bash
curl -X POST "http://localhost:3000/api/search/ms-ms" \
  -H "Content-Type: application/json" \
  -d '{
    "peakList": "73.0493 1299.2860\n86.0983 3487.7747\n103.0765 1874.5762",
    "tolerance": 0.1,
    "toleranceUnit": "da",
    "spectrumKind": "experimental",
    "polarity": "positive",
    "precursorMz": 299.2946,
    "precursorTolerance": 5,
    "precursorToleranceUnit": "ppm",
    "precursorAdductIds": [],
    "minMatchedPeaks": 3,
    "page": 1,
    "limit": 10
  }'
```

When the precursor/adduct m/z prefilter is used, the response includes a `prefilter` summary object.

### Expected API response shape for paginated endpoints

Paginated endpoints return:

```json
{
  "rows": [],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalRows": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

### Validation test

This request should fail because `tolerance` is provided without `toleranceUnit`:

```bash
curl -i "http://localhost:3000/api/search/neutral-mass?queryMass=131.069476547&tolerance=10&page=1&limit=10"
```

Expected status:

```txt
400 Bad Request
```

---

## Documentation

Current documentation files:

```txt
docs/backend-query-service-contract.md
docs/cosine-similarity-design.md
docs/frontend-progress-reference.md
docs/frontend-user-guide.md
docs/hmdb_dataset_schema_overview_2.md
docs/hmdb_dataset_schema_overview.md
docs/hmdb_search_schema.sql
```

Important docs:

- `docs/backend-query-service-contract.md` documents backend repository/service contracts.
- `docs/cosine-similarity-design.md` documents LC-MS/MS cosine similarity choices for the thesis.
- `docs/frontend-user-guide.md` documents the current frontend workflows.
- `docs/frontend-progress-reference.md` can be used to track UI implementation progress.

---

## Build

```bash
npm run build
```

---

## Kysely Type Generation

Kysely DB types are generated from PostgreSQL into:

```txt
src/db/schema.ts
```

Regenerate after schema changes:

```bash
npm run db:types:generate
```

Do not manually edit `src/db/schema.ts`.

---

## Useful Scripts

```bash
npm run db:schema:apply
npm run db:types:generate
npm run db:check

npm run db:import:metabolites
npm run db:seed:adducts
npm run db:compute:adducts
npm run db:import:spectra:predicted
npm run db:import:spectra:experimental
npm run db:import:all

npm run db:check:metabolites
npm run db:check:spectra
npm run db:verify:creatine-adducts
npm run db:test:search

npm run dev
npm run build

# ML Pipeline Scripts
python scripts/prepare-ml-queries.py
npx tsx scripts/run-ml-evaluation.ts
npx tsx scripts/export-training-data.ts
python scripts/train-ml-models.py
python scripts/plot_ml_comparison.py
```

---

## Current Project Status

Completed:

- Next.js project initialized
- PostgreSQL schema applied through TypeScript script
- Kysely codegen working
- Metabolites import working
- Normalized `source_terms` implemented
- Adduct seed working
- Compound adduct computation working
- Creatine adduct verification passing
- Predicted spectra import working
- Experimental spectra import working
- Full import pipeline working
- Repository/query layer implemented
- Service-level search functions implemented
- Zod search validation implemented
- Offset pagination metadata implemented
- Backend query/service smoke test passing
- Backend query/service contract documented
- Compound search API and frontend implemented
- Compound detail API and frontend implemented
- Related spectra table implemented
- Metadata APIs implemented
- Neutral mass search API and frontend implemented
- LC-MS/adduct m/z search API and frontend implemented
- Primitive fragment lookup API implemented
- MS/MS spectrum detail API and frontend implemented
- Spectrum peak graph, tooltip, table sorting, row selector, and pagination implemented
- LC-MS/MS cosine search API and frontend implemented
- LC-MS/MS mirror comparison graph implemented
- LC-MS/MS polarity / ion mode, spectrum kind, source, tolerance, min-match, and rows controls implemented
- Cosine similarity design documented
- Frontend user guide documented

Remaining recommended polish:

- Make related spectra HMDB ID cells in compound detail open local `/spectra/ms-ms/[hmdbSpectrumId]` pages.
- Add optional LC-MS/MS `Group by compound` best-hit toggle after spectrum-level scoring validation.
- Add sortable LC-MS/MS result columns after score behavior is stable.
- Add research/ML API endpoints for all matched pairs, candidate retrieval stats, parameter sweeps, and runtime metrics.
- Add parent ion mass/adduct-aware LC-MS/MS filtering after precursor metadata design is finalized.
- Add CCS filtering later if needed.

---

## Project Structure Highlights

```txt
docs/
├─ backend-query-service-contract.md
├─ cosine-similarity-design.md
├─ frontend-progress-reference.md
├─ frontend-user-guide.md
├─ hmdb_dataset_schema_overview_2.md
├─ hmdb_dataset_schema_overview.md
└─ hmdb_search_schema.sql

src/app/
├─ api/
│  ├─ compounds/
│  ├─ metadata/
│  ├─ search/
│  │  ├─ adduct-mz/
│  │  ├─ fragments/
│  │  ├─ ms-ms/
│  │  └─ neutral-mass/
│  └─ spectra/ms-ms/[hmdbSpectrumId]/
├─ compounds/[accession]/
├─ search/
│  ├─ adduct-mz/
│  ├─ compounds/
│  ├─ ms-ms/
│  └─ neutral-mass/
└─ spectra/ms-ms/[hmdbSpectrumId]/

src/repositories/
├─ compounds.repository.ts
├─ metadata.repository.ts
├─ search.repository.ts
└─ spectra.repository.ts

src/services/
├─ pagination.ts
├─ search.service.ts
├─ spectra.service.ts
└─ tolerance.ts

src/validation/
├─ search.schemas.ts
└─ spectra.schemas.ts
```

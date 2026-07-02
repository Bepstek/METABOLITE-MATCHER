# HMDB-like Search Engine Dataset and Schema Overview

## Purpose

This database supports a customizable HMDB-like search engine focused first on backend data loading and simple search.

Initial search capabilities:

- Compound lookup by HMDB accession
- Compound name search
- Neutral compound mass search
- LC-MS/adduct m/z search using precomputed adduct masses
- MS/MS fragment mass search
- Filtering by ion mode, adduct type, predicted/experimental spectra, polarity, source term, name, HMDB ID, and chemical formula

Deferred for v1:

- CCS tables and CCS prediction method support
- Saved search history
- Saved result tables
- Cosine similarity
- ML-based closest-match ranking
- Manually curated mass/weight annotations
- User-specific blacklist profiles
- Authentication and permissions

The initial focus is backend data loading, adduct precomputation, simple search, and preserving enough structure for future fragmentation and similarity work.

---

## Application Stack

- TypeScript
- PostgreSQL
- Kysely
- Next.js App Router
- shadcn/ui
- Tailwind CSS
- Zod
- npm

The app is admin-only for now. Authentication is not implemented yet.

The PostgreSQL schema is the source of truth. Kysely table types are generated from PostgreSQL using `kysely-codegen`.

---

## Repository Structure

```txt
src/
  app/
  components/
  db/
    kysely.ts
    schema.ts
  repositories/
  services/
  validation/
  types/

scripts/
  apply-schema.ts
  check-db.ts
  import-metabolites.ts
  seed-adducts.ts
  compute-compound-adducts.ts
  import-spectra.ts
  import-all.ts

db/
  schema.sql
  seeds/
    adducts.json

datasets/
  README.md
  raw/
  parsed/

parsers/
  python/

docs/
```

Dataset files are not committed to Git because the parsed dataset is large. Actual `.jsonl.gz` files are downloaded separately and placed under `datasets/parsed/`.

---

## Extracted Datasets

The pipeline is based on three HMDB-derived datasets.

### 1. All Metabolites XML

Parsed into a compressed JSONL file, for example:

```txt
datasets/parsed/hmdb_metabolite_output.jsonl.gz
```

Each JSONL row represents one metabolite/compound.

Expected shape:

```json
{
  "accession": "HMDB0000064",
  "name": "Creatine",
  "chemical_formula": "C4H9N3O2",
  "average_molecular_weight": "131.1332",
  "monoisotopic_molecular_weight": "131.069476547",
  "iupac_name": "2-(N-methylcarbamimidamido)acetic acid",
  "traditional_iupac": "creatine",
  "sources_hierarchy": [
    {
      "term": "Endogenous",
      "level": 1,
      "parent_term": "Source"
    }
  ]
}
```

Primary uses:

- Compound identity lookup by HMDB accession
- Compound name search
- Formula display
- Neutral mass search using `monoisotopic_molecular_weight`
- Source-term filtering
- Base data for computing theoretical adduct m/z values

Important notes:

- `monoisotopic_molecular_weight` is the preferred mass field for accurate-mass search.
- `average_molecular_weight` is stored for reference.
- Some compounds may have `NULL` monoisotopic mass. Those compounds are imported into `compounds` but skipped during adduct computation.

### 2. MS/MS Spectra XML - Predicted

Parsed into a compressed JSONL file, for example:

```txt
datasets/parsed/hmdb_predicted_msms_spectra.jsonl.gz
```

Each JSONL row represents one predicted MS/MS spectrum and contains a nested peak list.

Expected shape:

```json
{
  "spectrum_id": 12345,
  "compound_accession": "HMDB0000064",
  "predicted": true,
  "ionization_mode": "Positive",
  "polarity": "positive",
  "instrument_type": null,
  "collision_energy_voltage": null,
  "splash_key": "...",
  "peak_counter": 100,
  "raw_metadata": {},
  "peaks": [
    {
      "peak_id": 1,
      "msms_id": 12345,
      "mass_charge": 57.034,
      "raw_intensity": 0.5,
      "normalized_intensity": 50.0
    }
  ]
}
```

Primary uses:

- Broad-coverage MS/MS fragment searching
- Predicted-vs-experimental filtering
- Future spectral similarity experiments
- Candidate expansion when experimental spectra are unavailable

Important notes:

- `spectra.predicted = true` identifies predicted spectra.
- Peaks are stored relationally in `spectrum_peaks`, not inside `spectra.raw_metadata`.
- Spectra whose `compound_accession` does not exist in `compounds` are skipped during import.

### 3. MS/MS Spectra XML - Experimental

Parsed into a compressed JSONL file, for example:

```txt
datasets/parsed/hmdb_experimental_msms_spectra.jsonl.gz
```

The shape is the same as predicted spectra, but `predicted` is false.

Primary uses:

- Higher-confidence MS/MS fragment matching
- Future experimental-first ranking
- Comparison between predicted and observed spectra
- Filtering fragment search results to experimental spectra only

---

## Adduct Seed Data

Adduct definitions are seeded separately from:

```txt
db/seeds/adducts.json
```

The seed follows a Fiehn-style ESI adduct table and includes positive and negative mode adducts such as:

- `[M+H]+`
- `[M+Na]+`
- `[M+K]+`
- `[M+NH4]+`
- `[M+ACN+H]+`
- `[2M+H]+`
- `[M-H]-`
- `[M+Cl]-`
- `[M+FA-H]-`
- `[M+Hac-H]-`
- `[2M-H]-`

Each adduct seed row defines:

```txt
label
ion_mode
charge
mass_multiplier
mass_shift
enabled
```

The computation formula is:

```txt
theoretical_mz =
((monoisotopic_molecular_weight * mass_multiplier) + mass_shift) / abs(charge)
```

For multiply charged adducts, `mass_shift` stores the numerator shift.

Example:

```txt
[M+3H]3+
Fiehn expression: M/3 + 1.007276
Stored as:
  charge = 3
  mass_multiplier = 1
  mass_shift = 3.021828
```

The computed values are stored in `compound_adducts.theoretical_mz`.

Adduct computation was verified using Creatine / `HMDB0000064`.

---

## Default LC-MS Search Behavior

Default LC-MS search:

```txt
ion_mode = positive
adduct = Unknown
```

`Unknown` is a virtual UI/search option. It does not need to exist as a row in `adducts`.

`Unknown` means:

```txt
Search across all enabled adducts for the selected ion mode,
excluding active global blacklist entries.
```

All enabled adducts are precomputed into `compound_adducts`. The blacklist affects search behavior, not precomputation.

---

## Schema Overview

### import_batches

Tracks large dataset imports.

Represents:

- All Metabolites import batch
- Predicted MS/MS spectra import batch
- Experimental MS/MS spectra import batch

Important fields:

```txt
dataset_name
source_filename
hmdb_release_date
status
notes
imported_at
created_at
updated_at
```

Allowed statuses:

```txt
running
completed
failed
partial
```

### compounds

Stores one row per HMDB metabolite/compound.

Important fields:

```txt
id
import_batch_id
accession
name
chemical_formula
average_molecular_weight
monoisotopic_molecular_weight
iupac_name
traditional_iupac
sources_hierarchy
created_at
```

Used for:

- HMDB accession lookup
- Compound name lookup
- Neutral mass search
- Joining spectra to compounds
- Computing adduct m/z values

`accession` is unique and should be used for public/internal routes instead of exposing internal numeric IDs.

### source_terms

Stores unique source term names, such as:

```txt
Source
Endogenous
Food
Plant
Synthetic
```

Important fields:

```txt
id
name
created_at
```

Used for:

- Reducing repeated source text
- Powering source dropdown filters
- Preserving normalized source-term references from compound source hierarchy

### compound_sources

Stores source hierarchy relationships for compounds.

Important fields:

```txt
id
compound_id
source_term_id
parent_source_term_id
level
created_at
```

Used for:

- Filtering compounds by exact source term
- Building source filters/facets
- Preserving source hierarchy relation through `source_term_id`, `parent_source_term_id`, and `level`

The original raw source hierarchy is still preserved in `compounds.sources_hierarchy`.

### adducts

Stores seeded adduct definitions.

Important fields:

```txt
id
label
ion_mode
charge
mass_multiplier
mass_shift
enabled
created_at
updated_at
```

Used for:

- Computing theoretical adduct m/z values
- Powering adduct dropdowns
- Filtering LC-MS searches by ion mode and selected adduct

### adduct_blacklist

Stores a single global admin-managed adduct blacklist.

Important fields:

```txt
id
adduct_id
reason
active
created_at
updated_at
```

Used for:

- Excluding unwanted adducts from default `Unknown` adduct searches
- Keeping all adduct m/z values precomputed while allowing search behavior to be adjusted

### compound_adducts

Stores precomputed theoretical m/z values for compound/adduct pairs.

Important fields:

```txt
id
compound_id
adduct_id
theoretical_mz
created_at
```

Used for:

- HMDB-like LC-MS/adduct search
- Fast range queries using ppm or Dalton tolerance
- Joining adduct candidates back to compounds

Uniqueness rule:

```txt
compound_id + adduct_id
```

Compounds with `NULL` `monoisotopic_molecular_weight` do not receive compound adduct rows.

### spectra

Stores one row per MS/MS spectrum.

Important fields:

```txt
id
import_batch_id
compound_id
hmdb_spectrum_id
predicted
ionization_mode
polarity
instrument_type
collision_energy_voltage
splash_key
peak_counter
raw_metadata
created_at
```

Used for:

- Connecting MS/MS spectra to compounds
- Predicted vs experimental filtering
- Polarity filtering
- Preserving extra spectrum metadata for future scoring/similarity work

`raw_metadata` stores extra XML-derived metadata but not peaks.

### spectrum_peaks

Stores normalized MS/MS peak rows.

Important fields:

```txt
id
spectrum_id
hmdb_peak_id
hmdb_msms_id
mass_charge
raw_intensity
normalized_intensity
created_at
```

Used for:

- MS/MS fragment m/z search
- Optional minimum normalized intensity filtering
- Future cosine/spectral similarity work

`normalized_intensity` uses a 0–100 convention:

```txt
base peak = 100.0
other peaks = 0.0 to 100.0
```

All peaks are stored during import. No minimum-intensity filtering is applied at import time.

---

## Search Modes Supported

### 1. HMDB-like LC-MS/adduct search

Searches `compound_adducts.theoretical_mz`.

Typical filters:

- Query m/z
- ppm or Da tolerance
- Ion mode
- Selected adduct or Unknown
- Source term
- Active adduct blacklist
- Limit
- Page

Default:

```txt
ion_mode = positive
adduct = Unknown
limit = 10
page = 1
```

Sorting:

```txt
ABS(compound_adducts.theoretical_mz - query_mz) ASC
adducts.label ASC
compounds.name ASC
```

### 2. Neutral mass search

Searches `compounds.monoisotopic_molecular_weight`.

Typical filters:

- Query mass
- ppm or Da tolerance
- Source term
- Limit
- Page

Sorting:

```txt
ABS(compounds.monoisotopic_molecular_weight - query_mass) ASC
compounds.name ASC
```

### 3. MS/MS fragment mass search

Searches `spectrum_peaks.mass_charge`.

Typical filters:

- Fragment m/z
- ppm or Da tolerance
- Predicted / experimental / both
- Polarity
- Optional minimum normalized intensity
- Limit
- Page

Defaults:

```txt
spectrum kind = both
polarity = both
minimum normalized intensity = empty
limit = 10
page = 1
```

Sorting:

```txt
ABS(spectrum_peaks.mass_charge - query_mz) ASC
spectrum_peaks.normalized_intensity DESC NULLS LAST
compounds.name ASC
```

### 4. Compound identity search

Searches:

```txt
compounds.accession
compounds.name
compounds.chemical_formula
```

Behavior:

```txt
HMDB accession lookup:
  trim + uppercase + exact match

Compound name search:
  case-insensitive partial match using ILIKE

Chemical formula:
  stored and displayable; formula search can be added if needed
```

---

## Result Limits and Pagination

Default search result limit:

```txt
10
```

Allowed limits:

```txt
10
25
50
100
```

Pagination style:

```txt
offset pagination
```

Query model:

```txt
page = 1, 2, 3...
offset = (page - 1) * limit
```

---

## Compound Detail Page Plan

Route:

```txt
/compounds/HMDB0000064
```

Use `compounds.accession`, not internal numeric ID.

The compound detail page should show:

- HMDB accession
- Compound name
- Chemical formula
- Monoisotopic molecular weight
- Average molecular weight
- IUPAC names
- Source terms
- Related spectra list
- External HMDB metabolite link
- External HMDB spectrum links

External HMDB links should open in a new tab.

URL patterns:

```txt
https://hmdb.ca/metabolites/{accession}
https://hmdb.ca/spectra/ms_ms/{hmdb_spectrum_id}
```

---

## Spectra List Ordering

Default spectra list ordering for a compound:

```txt
1. positive polarity first
2. experimental spectra first
3. collision_energy_voltage ASC NULLS LAST
```

Equivalent ordering logic:

```sql
ORDER BY
  CASE WHEN spectra.polarity = 'positive' THEN 0 ELSE 1 END,
  CASE WHEN spectra.predicted = false THEN 0 ELSE 1 END,
  spectra.collision_energy_voltage ASC NULLS LAST
```

---

## Import Pipeline

### Individual import scripts

```txt
npm run db:import:metabolites
npm run db:seed:adducts
npm run db:compute:adducts
npm run db:import:spectra:predicted
npm run db:import:spectra:experimental
```

### Full import

```txt
npm run db:import:all
```

The full import script runs:

```txt
1. import metabolites
2. seed adducts
3. compute compound_adducts
4. import predicted MS/MS spectra
5. import experimental MS/MS spectra
```

The full import script refuses to run if test-limit environment variables are set, unless explicitly allowed.

Test-limit environment variables:

```txt
IMPORT_MAX_ROWS
SPECTRA_IMPORT_MAX_ROWS
COMPUTE_ADDUCT_ACCESSION
COMPUTE_ADDUCT_MAX_COMPOUNDS
```

Override:

```txt
ALLOW_TEST_IMPORT_ALL=true
```

---

## Import Behavior

### Metabolites import

Populates:

```txt
import_batches
compounds
source_terms
compound_sources
```

Behavior:

- Streams `.jsonl.gz` line by line
- Inserts in batches
- Skips duplicate compound accessions
- Stores `sources_hierarchy` as JSONB
- Normalizes source names into `source_terms`
- Stores source hierarchy references in `compound_sources`

### Adduct seed

Populates `adducts`.

Behavior:

- Reads `db/seeds/adducts.json`
- Inserts or updates adduct definitions by `label`

### Compound adduct computation

Populates `compound_adducts`.

Behavior:

- Computes theoretical m/z for every compound with non-null monoisotopic mass
- Skips compounds with `NULL` `monoisotopic_molecular_weight`
- Skips duplicates using `compound_id + adduct_id`
- Supports test mode by accession, e.g. Creatine `HMDB0000064`

### Spectra import

Populates:

```txt
import_batches
spectra
spectrum_peaks
```

Behavior:

- One reusable script imports predicted or experimental spectra
- Links spectra to compounds through `compound_accession`
- Normalizes accession casing
- Skips spectra whose compound accession does not exist in `compounds`
- Skips malformed spectrum rows
- Skips malformed peak rows
- Stores `raw_metadata` as JSONB
- Stores peaks relationally in `spectrum_peaks`

---

## Environment Variables

Typical local `.env.local`:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hmdb_search
APP_NAME="HMDB Search"

HMDB_BASE_URL=https://hmdb.ca

IMPORT_BATCH_SIZE=1000
METABOLITES_JSONL_GZ=datasets/parsed/hmdb_metabolite_output.jsonl.gz

PREDICTED_SPECTRA_JSONL_GZ=datasets/parsed/hmdb_predicted_msms_spectra.jsonl.gz
EXPERIMENTAL_SPECTRA_JSONL_GZ=datasets/parsed/hmdb_experimental_msms_spectra.jsonl.gz

COMPUTE_ADDUCT_COMPOUND_BATCH_SIZE=1000

DEFAULT_SEARCH_LIMIT=10
MAX_SEARCH_LIMIT=100
```

Optional test variables:

```env
IMPORT_MAX_ROWS=1000
SPECTRA_IMPORT_MAX_ROWS=1000
COMPUTE_ADDUCT_ACCESSION=HMDB0000064
COMPUTE_ADDUCT_MAX_COMPOUNDS=1
ALLOW_TEST_IMPORT_ALL=true
```

---

## Kysely Notes

Kysely types are generated from PostgreSQL:

```txt
src/db/schema.ts
```

Generate types:

```bash
npm run db:types:generate
```

Do not manually edit `src/db/schema.ts`.

PostgreSQL-to-TypeScript notes:

```txt
TEXT              -> string
BOOLEAN           -> boolean
DOUBLE PRECISION  -> number
INTEGER           -> number
BIGINT            -> string or number depending on pg parser/codegen behavior
JSONB             -> JsonValue / unknown / JSON-compatible value
TIMESTAMPTZ       -> Date or string depending on driver/runtime
```

`compound_adducts.id` and `spectrum_peaks.id` are internal `BIGINT` surrogate IDs. Avoid exposing them in UI/API unless needed.

Prefer stable identifiers:

```txt
compounds.accession
spectra.hmdb_spectrum_id
adducts.label
```

---

## Planned Backend Repository Structure

Use balanced repository split:

```txt
src/repositories/
  compounds.repository.ts
  search.repository.ts
  metadata.repository.ts
```

### compounds.repository.ts

Planned functions:

```txt
findCompoundByAccession
searchCompoundsByName
```

### search.repository.ts

Planned functions:

```txt
searchNeutralMass
searchAdductMzExactAdduct
searchAdductMzUnknownAllowed
searchFragmentMass
```

### metadata.repository.ts

Planned functions:

```txt
listEnabledAdducts
listSourceTerms
```

Services should handle:

- Tolerance window calculation
- Mass error calculation
- Default search behavior
- `Unknown` adduct behavior
- Blacklist behavior
- Result mapping

Repositories should focus on Kysely queries.

---

## Features Intentionally Deferred

Do not implement these in v1 unless clearly separated as TODOs:

- CCS support
- Search history
- Saved result tables
- Cosine similarity
- ML ranking
- Manually curated mass annotations
- User-specific adduct blacklist profiles
- Authentication/authorization
- Full spectral similarity scoring
- Frontend-heavy visualizations

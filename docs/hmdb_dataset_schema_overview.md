# HMDB-like Search Engine Dataset and Schema Overview

## Purpose

This database supports a customizable HMDB-like search engine focused first on backend data loading and simple search. The initial search capabilities are designed around:

- neutral compound mass search
- LC-MS/adduct m/z search using precomputed adduct masses
- MS/MS fragment mass search
- filtering by ion mode, predicted/experimental spectra, compound source terms, name, HMDB ID, and chemical formula

The schema intentionally avoids implementing CCS, saved search history, cosine similarity result storage, ML score storage, and curated mass-annotation storage for now. Those features can be added later without changing the core compound, adduct, spectra, and peak model.

---

## Extracted Datasets

The current pipeline is based on three HMDB-derived datasets.

### 1. All Metabolites XML

This dataset is parsed into a compressed JSONL file, for example:

```text
hmdb_metabolites.jsonl.gz
```

Each JSONL row represents one metabolite/compound.

Extracted fields:

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

- compound identity lookup by HMDB accession
- display name and formula lookup
- neutral mass search using `monoisotopic_molecular_weight`
- source-based filtering using `sources_hierarchy` and normalized `compound_sources`
- base data for computing adduct m/z values

Important note:

- `monoisotopic_molecular_weight` is the preferred mass field for accurate-mass searching.
- `average_molecular_weight` is stored for reference but is not the main mass-search field.

---

### 2. MS/MS Spectra XML - Predicted

This dataset is parsed into a compressed JSONL file, for example:

```text
hmdb_predicted_msms_spectra.jsonl.gz
```

Each JSONL row represents one MS/MS spectrum and contains a nested peak list.

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

- broad-coverage MS/MS fragment searching
- future spectral similarity/cosine similarity experiments
- predicted-vs-experimental filtering
- candidate expansion when experimental spectra are not available

Important note:

- The `predicted` field is relied on to distinguish predicted and experimental spectra.
- Peaks are stored relationally in `spectrum_peaks`, not as JSONB inside `spectra`.

---

### 3. MS/MS Spectra XML - Experimental

This dataset is parsed into a compressed JSONL file, for example:

```text
hmdb_experimental_msms_spectra.jsonl.gz
```

The shape is the same as the predicted MS/MS dataset, but:

```json
{
  "predicted": false
}
```

Primary uses:

- higher-confidence MS/MS fragment matching
- future experimental-first candidate ranking
- comparison between predicted and observed spectra
- filtering search results to experimental spectra only

Important note:

- Experimental spectra are expected to be preferred during ranking later, but ranking logic is intentionally not finalized in the current schema.

---

## Adduct Computation Dataset

Adduct definitions are not extracted from the HMDB XML parser output. They are seeded into the database separately.

The adduct seed data defines values such as:

- adduct label
- ion mode
- charge
- mass multiplier
- mass shift
- enabled flag

The precomputed m/z formula is:

```text
theoretical_mz = ((monoisotopic_molecular_weight * mass_multiplier) + mass_shift) / abs(charge)
```

The computed values are stored in `compound_adducts`.

Default search behavior:

```text
ion mode: positive
adduct type: Unknown
```

In this design, `Unknown` means:

```text
search across all allowed positive adducts, excluding active global blacklist entries
```

All seeded adducts are computed in `compound_adducts`. The blacklist affects search behavior, not precomputation.

---

## Schema Overview

### `import_batches`

Tracks large dataset imports.

Represents:

- All Metabolites import batch
- Predicted MS/MS spectra import batch
- Experimental MS/MS spectra import batch

Important fields:

- `dataset_name`
- `source_filename`
- `hmdb_release_date`
- `status`
- `notes`

Allowed statuses:

```text
running
completed
failed
partial
```

This helps identify whether a large import completed successfully or failed midway.

---

### `compounds`

Stores one row per HMDB metabolite/compound.

Represents data parsed from the All Metabolites XML.

Important fields:

- `id` internal integer primary key
- `accession` unique HMDB ID, such as `HMDB0000064`
- `name`
- `chemical_formula`
- `average_molecular_weight`
- `monoisotopic_molecular_weight`
- `iupac_name`
- `traditional_iupac`
- `sources_hierarchy` raw JSONB source tree

Used for:

- HMDB ID lookup
- name lookup
- neutral mass search
- joining spectra to compounds
- computing adduct m/z values

---

### `compound_sources`

Stores normalized source hierarchy terms extracted from `sources_hierarchy`.

Each source term contains:

- `term`
- `parent_term`
- `level`

Example:

```json
{
  "term": "Plant",
  "level": 2,
  "parent_term": "Biological"
}
```

Used for:

- filtering compounds by source
- building source filters/facets
- querying all compounds related to terms such as `Food`, `Endogenous`, `Plant`, or `Synthetic`

The original full source data is still preserved in `compounds.sources_hierarchy`.

---

### `adducts`

Stores seeded adduct definitions.

Important fields:

- `label`
- `ion_mode`
- `charge`
- `mass_multiplier`
- `mass_shift`
- `enabled`

Used for:

- computing theoretical adduct m/z values
- powering adduct dropdowns in the search UI
- filtering by ion mode and selected adduct type

Adduct definitions are admin/config data, so the table includes both `created_at` and `updated_at`.

---

### `adduct_blacklist`

Stores a single global admin-managed adduct blacklist.

Important fields:

- `adduct_id`
- `reason`
- `active`

Used for:

- excluding unwanted adducts from default `Unknown` adduct searches
- keeping all adducts precomputed while allowing search behavior to be adjusted

This is global because the initial application is admin-only and does not need user-specific blacklist profiles.

---

### `compound_adducts`

Stores precomputed theoretical m/z values for every compound/adduct pair.

Important fields:

- `compound_id`
- `adduct_id`
- `theoretical_mz`

Used for:

- default HMDB-like LC-MS/adduct search
- fast range queries using ppm or Dalton tolerance
- joining adduct candidates back to compounds

Uniqueness rule:

```text
compound_id + adduct_id must be unique
```

This ensures one computed m/z per compound/adduct pair.

---

### `spectra`

Stores one row per MS/MS spectrum.

Represents metadata parsed from both predicted and experimental MS/MS spectra datasets.

Important fields:

- `compound_id`
- `hmdb_spectrum_id`
- `predicted`
- `ionization_mode`
- `polarity`
- `instrument_type`
- `collision_energy_voltage`
- `splash_key`
- `peak_counter`
- `raw_metadata`

Used for:

- connecting MS/MS spectra to compounds
- filtering predicted vs experimental spectra
- filtering by positive/negative polarity
- preserving extra spectrum metadata for future fragmentation/cosine similarity work

`raw_metadata` stores additional XML-derived fields that might become useful later, such as:

```text
collision_energy_level
energy_field
structure_id
mono_mass
chromatography_type
analyzer_type
ionization_type
charge_type
data_source
data_source_id
adduct
adduct_type
adduct_mass
created_at_source
updated_at_source
```

`raw_metadata` should not store the peak list. Peaks are stored separately in `spectrum_peaks`.

---

### `spectrum_peaks`

Stores normalized MS/MS peak rows.

Each row represents one peak from one spectrum.

Important fields:

- `spectrum_id`
- `hmdb_peak_id`
- `hmdb_msms_id`
- `mass_charge`
- `raw_intensity`
- `normalized_intensity`

Used for:

- fragment m/z search
- future cosine similarity / spectral similarity computation
- intensity-based filtering during query time

`normalized_intensity` uses a 0-100 convention:

```text
base peak = 100.0
other peaks = 0.0 to 100.0
```

All peaks are stored during import. No minimum-intensity filtering is applied at import time because fragmentation and similarity logic are not finalized yet.

---

## Search Modes Supported by This Schema

### 1. HMDB-like LC-MS/adduct search

Searches:

```text
compound_adducts.theoretical_mz
```

Typical filters:

- query mass
- ppm or Dalton tolerance
- ion mode
- selected adduct or Unknown
- global adduct blacklist
- compound source term

---

### 2. Neutral mass search

Searches:

```text
compounds.monoisotopic_molecular_weight
```

Typical filters:

- query mass
- ppm or Dalton tolerance
- source term
- name or HMDB accession

---

### 3. MS/MS fragment mass search

Searches:

```text
spectrum_peaks.mass_charge
```

Typical filters:

- fragment m/z
- ppm or Dalton tolerance
- predicted vs experimental
- polarity
- optional minimum normalized intensity

---

### 4. Compound identity search

Searches:

```text
compounds.accession
compounds.name
compounds.chemical_formula
```

Primary use cases:

- lookup by HMDB ID
- lookup by compound name
- lookup by formula

Fuzzy/trigram search is intentionally not included yet, but can be added later if name search becomes slow or needs partial matching.

---

## Features Intentionally Deferred

The following are not implemented in the initial schema:

- CCS table and CCS prediction method support
- saved search history
- saved result tables
- cosine similarity result storage
- ML score storage
- manually curated mass/weight annotation storage
- user-specific blacklist profiles
- user accounts/permissions

These are deferred because the initial focus is backend data loading, adduct precomputation, simple search, and preserving enough structure for later fragmentation and similarity work.

---

## Recommended Import Order

```text
1. Create schema
2. Insert import batch for All Metabolites
3. Stream All Metabolites JSONL.GZ
4. Insert compounds
5. Insert compound_sources
6. Seed adducts
7. Compute compound_adducts
8. Insert import batch for predicted MS/MS spectra
9. Stream predicted MS/MS JSONL.GZ
10. Insert spectra
11. Insert spectrum_peaks
12. Insert import batch for experimental MS/MS spectra
13. Stream experimental MS/MS JSONL.GZ
14. Insert spectra
15. Insert spectrum_peaks
16. Create/analyze indexes after large imports if needed
```

---

## Notes for Kysely

The schema is designed to work cleanly with Kysely.

Recommended TypeScript mapping:

```text
PostgreSQL TEXT              -> string
PostgreSQL BOOLEAN           -> boolean
PostgreSQL DOUBLE PRECISION  -> number
PostgreSQL INTEGER           -> number
PostgreSQL BIGINT            -> string or number, depending on pg type parser config
PostgreSQL JSONB             -> typed object, array, or unknown
PostgreSQL TIMESTAMPTZ       -> Date, depending on driver/runtime handling
```

Because `spectrum_peaks.id` and `compound_adducts.id` are `BIGINT`, the Node/Postgres driver may return them as strings unless configured otherwise.

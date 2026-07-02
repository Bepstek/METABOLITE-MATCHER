# Backend Query and Service Contract

## Purpose

This document defines the backend query/service contract for the HMDB-like mass spectrometry search engine before API routes and UI are built.

The current milestone is backend-first:

- repository/query layer implemented and smoke-tested
- service validation and pagination implemented
- metadata queries implemented
- primitive fragment peak lookup implemented as a non-final MS/MS inspection tool
- API routes and frontend are not implemented yet

This contract should be used as the reference for the next phase: API route design.

---

## Layering Rules

### Database schema

PostgreSQL schema remains the source of truth. Kysely table types are generated from PostgreSQL and stored in:

```txt
src/db/schema.ts
```

Do not manually edit generated Kysely schema types.

### Kysely connection

The shared Kysely instance lives in:

```txt
src/db/kysely.ts
```

The database instance should be imported at entry points such as scripts, API routes, and tests, then passed into services or repositories.

### Repositories

Repositories contain Kysely queries only.

Repository functions:

- receive `db: Kysely<DB>` as the first argument
- require normalized internal inputs
- return DB-shaped selected rows using snake_case fields
- do not parse request data
- do not apply UI defaults
- do not calculate tolerance windows
- do not map to API/UI DTOs
- do not construct HMDB external URLs

Repository files:

```txt
src/repositories/compounds.repository.ts
src/repositories/search.repository.ts
src/repositories/metadata.repository.ts
```

### Services

Services are the validation and application-behavior boundary.

Service functions:

- receive `db: Kysely<DB>` as the first argument
- accept `rawInput: unknown`
- parse/validate with Zod schemas from `src/validation/search.schemas.ts`
- apply defaults
- calculate tolerance windows
- calculate offset pagination
- call repository rows/count functions
- run rows/count queries with `Promise.all`
- map DB-shaped rows into camelCase DTOs
- calculate signed mass error fields

Current service file:

```txt
src/services/search.service.ts
```

Pagination helpers live in:

```txt
src/services/pagination.ts
```

Tolerance/mass-error helpers live in:

```txt
src/services/tolerance.ts
```

---

## Pagination Contract

All data intended for table presentation should be paginated.

Pagination uses offset pagination, not cursor pagination.

Input:

```ts
{
  page?: number;
  limit?: 10 | 25 | 50 | 100;
}
```

Defaults:

```ts
page = 1
limit = 10
```

Offset calculation:

```ts
offset = (page - 1) * limit
```

Service response shape:

```ts
{
  rows: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
```

Repositories expose one rows query and one count query for paginated table data.

Examples:

```ts
searchNeutralMass(...)
countNeutralMass(...)
```

```ts
searchAdductMz(...)
countAdductMz(...)
```

```ts
searchFragmentMass(...)
countFragmentMass(...)
```

---

## Validation Rules

Validation schemas live in:

```txt
src/validation/search.schemas.ts
```

Services parse raw input internally. API routes should call services, not repositories directly.

### Tolerance units

Code/API values:

```ts
"ppm" | "da"
```

UI may display:

```txt
ppm
Da
```

### Tolerance behavior

Valid exact search:

```ts
{
  queryMz: 132.0767
}
```

Valid practical exact search because tolerance is blank even if unit exists:

```ts
{
  queryMz: 132.0767,
  toleranceUnit: "ppm"
}
```

Valid practical exact search because tolerance is zero:

```ts
{
  queryMz: 132.0767,
  tolerance: 0,
  toleranceUnit: "ppm"
}
```

Valid range search:

```ts
{
  queryMz: 132.0767,
  tolerance: 10,
  toleranceUnit: "ppm"
}
```

Invalid:

```ts
{
  queryMz: 132.0767,
  tolerance: 10
}
```

Reason: tolerance value without tolerance unit is ambiguous.

Invalid:

```ts
{
  queryMz: 132.0767,
  tolerance: -1,
  toleranceUnit: "ppm"
}
```

Reason: tolerance must be non-negative.

### Exact-match epsilon

No tolerance or zero tolerance means practical exact search using a tiny internal epsilon window:

```ts
EXACT_MASS_EPSILON = 1e-9
```

This avoids brittle floating-point equality against `DOUBLE PRECISION` mass fields.

### Query mass/m/z values

Neutral mass, adduct m/z, and fragment m/z query values must be positive.

Invalid:

```ts
{
  queryMz: 0
}
```

Invalid:

```ts
{
  queryMass: -1
}
```

---

## Mass Error Contract

Services calculate signed mass error fields.

Formula:

```ts
massErrorDa = actual - query
massErrorPpm = ((actual - query) / query) * 1_000_000
```

Sign convention:

- negative means candidate is below query
- positive means candidate is above query

Repositories may sort by SQL absolute difference, but they do not return mass-error fields.

Example repository ordering:

```sql
ORDER BY abs(actual_mass - query_mass) ASC
```

Service DTOs include signed error fields for mass/m/z searches.

---

## Source Filtering Contract

Source filters use normalized source term IDs.

Input:

```ts
sourceTermId?: number
```

Search repositories apply source filtering with `WHERE EXISTS`, not direct joins, to avoid duplicate result rows from multiple source hierarchy entries.

Conceptual SQL:

```sql
WHERE EXISTS (
  SELECT 1
  FROM compound_sources
  WHERE compound_sources.compound_id = compounds.id
    AND compound_sources.source_term_id = :sourceTermId
)
```

The UI source filter should expose only source terms observed at levels 1 and 2. Level 3 terms remain in the database but are not included in the normal UI filter due to size.

Metadata source-term dropdown rows return only:

```ts
{
  id: number;
  name: string;
}
```

Level is not returned because source-term level is contextual in `compound_sources`, not intrinsic to `source_terms`.

---

## Compound Repository Contract

File:

```txt
src/repositories/compounds.repository.ts
```

### `findCompoundByAccession(db, accession)`

Behavior:

- trims input
- uppercases input
- exact-match lookup against `compounds.accession`

Returns one compound row or `undefined`.

Repository row shape is DB-shaped:

```ts
{
  id: number;
  accession: string;
  name: string;
  chemical_formula: string | null;
  average_molecular_weight: number | null;
  monoisotopic_molecular_weight: number | null;
  iupac_name: string | null;
  traditional_iupac: string | null;
  sources_hierarchy: unknown;
  created_at: Date | string;
}
```

### `searchCompoundsByName(db, input)`

Behavior:

- searches `compounds.name` only
- case-insensitive partial match with `ILIKE`
- does not search IUPAC fields for v1
- uses relevance-lite deterministic ordering

Ordering:

1. exact case-insensitive name match
2. prefix case-insensitive name match
3. other partial matches
4. `compounds.name ASC`
5. `compounds.accession ASC`

Input:

```ts
{
  query: string;
  limit: number;
  offset: number;
}
```

### `countCompoundsByName(db, input)`

Returns normalized `Promise<number>`.

### `listCompoundSourceTermsByAccession(db, accession)`

Returns normalized source hierarchy rows for a compound.

Unpaginated for now because these are compact compound metadata, not a large table workflow.

### `listCompoundSpectraByAccession(db, input)`

Paginated spectra metadata list for a compound detail page.

Does not load peaks.

Ordering:

1. positive polarity first
2. experimental spectra first
3. collision energy ascending with nulls last
4. HMDB spectrum ID ascending as a stable tie-breaker

### `countCompoundSpectraByAccession(db, accession)`

Returns normalized `Promise<number>`.

---

## Metadata Repository Contract

File:

```txt
src/repositories/metadata.repository.ts
```

### `listEnabledAdductsByIonMode(db, ionMode)`

Returns only searchable adducts for the selected ion mode.

Filters:

- `adducts.ion_mode = ionMode`
- `adducts.enabled = true`
- excludes active rows in `adduct_blacklist`

Returns DB-shaped rows:

```ts
{
  id: number;
  label: string;
  ion_mode: "positive" | "negative";
  charge: number;
  mass_multiplier: number;
  mass_shift: number;
}
```

Normal dropdown behavior should show only these returned adducts.

Future admin/debug UI may add a separate query that includes blacklisted adducts and reasons.

### `listSourceTerms(db, { maxLevel = 2 })`

Returns distinct source terms observed in `compound_sources.level <= maxLevel`.

Returns:

```ts
{
  id: number;
  name: string;
}
```

Unpaginated for now.

---

## Search Repository Contract

File:

```txt
src/repositories/search.repository.ts
```

Repositories receive precomputed lower/upper bounds. They do not calculate tolerance windows.

### Neutral mass search

Functions:

```ts
searchNeutralMass(db, input)
countNeutralMass(db, input)
```

Searches:

```txt
compounds.monoisotopic_molecular_weight
```

Filters:

- mass window
- optional `sourceTermId` via `WHERE EXISTS`
- excludes compounds with null monoisotopic mass

Ordering:

1. absolute mass difference ascending
2. compound name ascending
3. accession ascending

Repository rows include actual mass but not mass-error fields.

### LC-MS/adduct m/z search

Functions:

```ts
searchAdductMz(db, input)
countAdductMz(db, input)
```

Searches:

```txt
compound_adducts.theoretical_mz
```

One KISS method handles both explicit selected adducts and virtual Unknown behavior.

Input includes:

```ts
{
  queryMz: number;
  lowerMz: number;
  upperMz: number;
  ionMode: "positive" | "negative";
  adductIds: number[];
  sourceTermId?: number;
  limit: number;
  offset: number;
}
```

Behavior:

- `adductIds.length === 0` means virtual Unknown
- `adductIds.length > 0` means explicit selected adduct IDs
- `ionMode` is always enforced
- `adducts.enabled = true` is always enforced
- active blacklist exclusion is always enforced
- optional source filter uses `WHERE EXISTS`

Ordering:

1. absolute m/z difference ascending
2. adduct label ascending
3. compound name ascending
4. accession ascending

### Primitive fragment peak lookup

Functions:

```ts
searchFragmentMass(db, input)
countFragmentMass(db, input)
```

This is intentionally primitive and not final LC-MS/MS search behavior.

It is not:

- cosine similarity
- spectral similarity scoring
- final LC-MS/MS identification logic
- grouped compound evidence ranking

Searches:

```txt
spectrum_peaks.mass_charge
```

Joins:

```txt
spectrum_peaks -> spectra -> compounds
```

Filters:

- fragment m/z window
- `spectrumKind`: `"predicted" | "experimental" | "both"`
- `polarity`: `"positive" | "negative" | "both"`
- optional `minNormalizedIntensity`
- optional `sourceTermId` via `WHERE EXISTS`

Defaults are service-level:

```ts
spectrumKind = "both"
polarity = "both"
```

Ordering:

1. absolute fragment m/z difference ascending
2. normalized intensity descending, nulls last
3. compound name ascending
4. accession ascending
5. HMDB spectrum ID ascending
6. peak internal ID ascending

---

## Search Service Contract

File:

```txt
src/services/search.service.ts
```

Service functions accept raw input and return paginated camelCase DTOs.

### `searchCompoundsByNameService(db, rawInput)`

Input:

```ts
{
  query: string;
  page?: number;
  limit?: 10 | 25 | 50 | 100;
}
```

Returns:

```ts
{
  rows: Array<{
    compoundId: number;
    accession: string;
    name: string;
    chemicalFormula: string | null;
    averageMolecularWeight: number | null;
    monoisotopicMolecularWeight: number | null;
  }>;
  pagination: PaginationMeta;
}
```

### `searchNeutralMassService(db, rawInput)`

Input:

```ts
{
  queryMass: number;
  tolerance?: number;
  toleranceUnit?: "ppm" | "da";
  sourceTermId?: number;
  page?: number;
  limit?: 10 | 25 | 50 | 100;
}
```

Returns rows with:

```ts
{
  compoundId: number;
  accession: string;
  name: string;
  chemicalFormula: string | null;
  monoisotopicMolecularWeight: number;
  averageMolecularWeight: number | null;
  massErrorDa: number;
  massErrorPpm: number;
}
```

### `searchAdductMzService(db, rawInput)`

Input:

```ts
{
  queryMz: number;
  tolerance?: number;
  toleranceUnit?: "ppm" | "da";
  ionMode?: "positive" | "negative";
  adductIds?: number[];
  sourceTermId?: number;
  page?: number;
  limit?: 10 | 25 | 50 | 100;
}
```

Defaults:

```ts
ionMode = "positive"
adductIds = []
```

An empty `adductIds` array means virtual Unknown.

Returns rows with:

```ts
{
  compoundId: number;
  accession: string;
  name: string;
  chemicalFormula: string | null;
  monoisotopicMolecularWeight: number | null;
  averageMolecularWeight: number | null;
  adductId: number;
  adductLabel: string;
  ionMode: "positive" | "negative";
  theoreticalMz: number;
  massErrorDa: number;
  massErrorPpm: number;
}
```

### `searchFragmentMassService(db, rawInput)`

Input:

```ts
{
  queryMz: number;
  tolerance?: number;
  toleranceUnit?: "ppm" | "da";
  spectrumKind?: "predicted" | "experimental" | "both";
  polarity?: "positive" | "negative" | "both";
  minNormalizedIntensity?: number;
  sourceTermId?: number;
  page?: number;
  limit?: 10 | 25 | 50 | 100;
}
```

Defaults:

```ts
spectrumKind = "both"
polarity = "both"
```

Returns one row per matched peak.

Rows include:

```ts
{
  compoundId: number;
  accession: string;
  name: string;
  chemicalFormula: string | null;
  spectrumId: number;
  hmdbSpectrumId: number;
  predicted: boolean;
  ionizationMode: string | null;
  polarity: string | null;
  instrumentType: string | null;
  collisionEnergyVoltage: number | null;
  peakId: string | number;
  hmdbPeakId: number | null;
  hmdbMsmsId: number | null;
  massCharge: number;
  rawIntensity: number | null;
  normalizedIntensity: number | null;
  massErrorDa: number;
  massErrorPpm: number;
}
```

### `listCompoundSpectraService(db, rawInput)`

Input:

```ts
{
  accession: string;
  page?: number;
  limit?: 10 | 25 | 50 | 100;
}
```

Returns paginated spectra metadata rows for a compound detail page.

---

## External HMDB URLs

Services return stable identifiers only:

- `accession`
- `hmdbSpectrumId`

Services do not construct external HMDB URLs.

Future UI should construct links using env/config and stable identifiers:

```ts
const hmdbBaseUrl = process.env.NEXT_PUBLIC_HMDB_BASE_URL ?? "https://hmdb.ca";

const metaboliteUrl = `${hmdbBaseUrl}/metabolites/${accession}`;
const spectrumUrl = `${hmdbBaseUrl}/spectra/ms_ms/${hmdbSpectrumId}`;
```

Compound route should use accession:

```txt
/compounds/HMDB0000064
```

---

## Global Search Status

Do not implement global search yet.

Future global search may accept one raw query string, but numeric input is ambiguous:

- neutral mass
- LC-MS/adduct m/z
- fragment m/z

Future behavior should not auto-decide. It should route users to explicit search modes or present choices.

---

## Deferred Features

Do not implement the following in this backend query/service pass:

- CCS support
- search history
- saved result tables
- cosine similarity
- spectral similarity scoring
- ML ranking
- curated mass annotations
- user-specific blacklist profiles
- authentication/authorization
- grouped fragment evidence scoring
- advanced LC-MS/MS identification workflow

Primitive fragment mass lookup exists only to inspect imported spectra/peaks and support future design decisions.

---

## Smoke Test

Command:

```bash
npm run db:test:search
```

The smoke test should confirm:

- compound accession lookup
- compound name search and count
- compound source terms
- compound spectra list and count
- positive/negative adduct metadata
- level <= 2 source terms metadata
- service pagination metadata
- neutral mass search
- LC-MS/adduct m/z search with Unknown behavior
- primitive fragment peak lookup
- source-filtered fragment lookup using Endogenous
- validation failure for tolerance without tolerance unit

Expected validation line:

```txt
[validation] tolerance without toleranceUnit failed as expected
```

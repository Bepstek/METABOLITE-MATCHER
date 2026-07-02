# HMDB-like Search App: Frontend Progress Reference

Last updated: 2026-06-26

## Purpose

This document summarizes the current frontend implementation state and the decisions made so far. Use this as the reference context for future frontend changes, especially while continuing the LC-MS/adduct m/z search workflow.

The app is an HMDB-like metabolomics search prototype focused on:

- compound name search,
- compound detail inspection,
- related spectra inspection,
- LC-MS/adduct m/z search,
- future multi-mass, multi-adduct, and spectrum graph comparison workflows.

---

## Global frontend decisions

### UI stack

- Next.js App Router.
- Client components for interactive search pages.
- shadcn-style UI components currently used:
  - `Button`
  - `Input`
  - `Select`
  - `Table`
- Continue using `components/ui/table` for now.
- Do not move to TanStack Table yet.
- Tailwind CSS is active and used for all layout/styling.
- Font issue fixed by mapping the app font CSS variables correctly and applying `font-sans` globally.

### Styling direction

- HMDB-like scientific cyan/blue theme.
- Main page background uses subtle radial/cyan gradients.
- Primary content is organized in rounded white cards/panels:

```tsx
rounded-xl border border-cyan-900/10 bg-white p-4 shadow-sm
```

### Navigation behavior

- Search pages should generally be URL-stateful.
- Search submissions use `router.push`.
- Pagination/sort changes use `router.replace`.
- Use `{ scroll: false }` for URL updates where possible to prevent the page snapping to the top.
- Result links that may disrupt complex search context should open in a new tab.

---

## Home page

Route:

```txt
/
```

File:

```txt
src/app/page.tsx
```

Current purpose:

- Acts as a quick prototype/tester landing page.
- Provides quick links to implemented pages.

Current links:

- `/search/compounds`
- `/search/adduct-mz`
- `/search/compounds?query=Creatine&page=1&limit=10`
- `/compounds/HMDB0000064`
- `/search/adduct-mz?queryMzValues=132.076752547&ionMode=positive&adductId=unknown&tolerance=10&toleranceUnit=ppm&page=1&limit=10`

Home page is responsive and verified working.

---

## Compound search page

Route:

```txt
/search/compounds
```

Primary file:

```txt
src/app/search/compounds/compound-search-client.tsx
```

Page wrapper:

```txt
src/app/search/compounds/page.tsx
```

### Features implemented

- URL-stateful search.
- Search by compound name.
- Server-side sorting.
- Pagination with:
  - First
  - Previous
  - Next
  - Last
  - Go to page
- Rows selector:
  - 10
  - 25
  - 50
  - 100
- Fixed layout table.
- Long compound names are truncated with title hover.
- Formula numbers are rendered as subscript.
- Monoisotopic and average mass columns are left-aligned.
- Home button added to the top header card.
- Responsive behavior verified.

### URL params

```txt
query
page
limit
sortBy
sortDirection
```

Example:

```txt
/search/compounds?query=Creatine&page=1&limit=10&sortBy=name&sortDirection=asc
```

### Sortable columns

```txt
accession
name
monoisotopicMolecularWeight
averageMolecularWeight
```

### Return behavior

Compound links include a `returnTo` param so the compound detail page can display:

```txt
← Back to results for “...”
```

---

## Compound detail page

Route:

```txt
/compounds/[accession]
```

Files:

```txt
src/app/compounds/[accession]/page.tsx
src/app/compounds/[accession]/compound-detail-client.tsx
```

### APIs used

```txt
GET /api/compounds/[accession]
GET /api/compounds/[accession]/spectra?page=1&limit=10
```

### Features implemented

- Client-side fetch for compound detail.
- Client-side fetch for related spectra.
- Reads `returnTo` using `useSearchParams()`.
- Shows contextual back link:
  - `← Back to results for “...”`
  - fallback: `← Back to compound search`
- Top `View on HMDB` button.
- Compound summary section.
- Formula subscript rendering.
- Names section.
- Source hierarchy section.
- Related spectra section.
- Desktop/mobile responsive design verified.

### Source hierarchy behavior

- Uses `compound.sourcesHierarchy` JSONB for display.
- Ignores normalized `sourceTerms` in the UI for now.
- Renders source hierarchy by `level` indentation.
- Preserves JSONB order.

### Related spectra table

Columns:

```txt
HMDB ID
Type
Polarity
Instrument
Collision
Peaks
Splash
HMDB
```

Implemented behavior:

- Ionization column removed.
- Polarity kept.
- Type filter:
  - Both
  - Experimental
  - Predicted
- Polarity filter:
  - Both
  - Positive
  - Negative
- Collision filters:
  - Collision min
  - Collision max
- Rows selector.
- Pagination:
  - First
  - Previous
  - Next
  - Last
  - Go to page
- Sorting:
  - HMDB ID
  - Polarity
  - Collision
  - Peaks
- Filter bar layout improved and verified responsive.

### Future related spectrum feature

Later, spectra rows should become clickable and open a spectrum detail page such as:

```txt
/spectra/ms-ms/[hmdbSpectrumId]
```

That future page should include:

- spectrum metadata,
- compound context,
- MS/MS peak graph,
- future comparison/search workflow support.

This is deferred until MS search workflows are more complete.

---

## LC-MS / Adduct m/z search page

Route:

```txt
/search/adduct-mz
```

Files:

```txt
src/app/search/adduct-mz/page.tsx
src/app/search/adduct-mz/adduct-mz-search-client.tsx
```

### APIs used

```txt
GET /api/metadata/adducts?ionMode=positive|negative
GET /api/metadata/source-terms
GET /api/search/adduct-mz
```

### Current v1 behavior

- HMDB-inspired Search Options panel.
- URL-stateful search.
- Textarea for m/z values.
- For now, only the first valid m/z value is searched.
- If multiple valid m/z values are entered, show a note that batch tabs will be added next.
- Form edits are staged locally.
- Search results refresh only when clicking `Search`.
- Pagination and table sorting still refresh results because they are result controls.
- Use `{ scroll: false }` in router updates to avoid snapping to top.

### URL params

```txt
queryMzValues
ionMode
adductIds
adductId // older/single-select version compatibility only if still present
tolerance
toleranceUnit
sourceTermId
page
limit
sortBy
sortDirection
```

Current planned multi-select URL shape:

```txt
adductIds=13,15,17
```

### Search form fields

- Query m/z values textarea.
- Ion mode:
  - positive
  - negative
- Adduct Type.
- Tolerance ±.
- Tolerance Unit:
  - ppm
  - Da
- Source filter in the main options panel because source filtering is a primary client concern.
- Rows selector.
- Buttons:
  - Load Example
  - Search
  - Reset

### Result table columns

Use these labels:

```txt
Compound
Name
Formula
Monoisotopic Mass
Adduct
Adduct M/Z
Delta (ppm)
```

### Delta behavior

- Delta is always displayed as `Delta (ppm)`.
- Delta display should use absolute rounded ppm:

```ts
Math.round(Math.abs(row.massErrorPpm))
```

- Search tolerance unit can still be `ppm` or `Da`; it controls filtering only.
- Delta display does not switch to Da.

### Result links

- Compound accession links open in a new tab:

```tsx
target="_blank"
rel="noreferrer"
```

Reason: future multiple-mass tabs will make preserving search context important.

### Sorting

Adduct m/z search result headers are intended to be sortable server-side.

Sortable fields:

```txt
accession
name
chemicalFormula
monoisotopicMolecularWeight
adductLabel
theoreticalMz
massErrorPpm
```

Delta sorting should use absolute ppm error first, then signed ppm error as tie-breaker.

---

## Current adduct multi-select plan

Next feature:

```txt
Multi-select adducts on /search/adduct-mz
```

Decision:

- Use inline checkbox list first.
- Use compact scrollable checkbox box.
- No new shadcn components yet.

Behavior:

```txt
Unknown selected
  -> clears previous selected adducts
  -> API omits adductIds

Known adduct selected
  -> unchecks Unknown
  -> allows multiple selected adducts
```

URL shape:

```txt
adductIds=13,15,17
```

API call may convert to repeated query params:

```ts
selectedAdductIds.forEach((id) => apiParams.append("adductIds", id));
```

Ion mode behavior:

- Ion mode change clears selected adducts.
- Adduct state returns to Unknown.
- Adduct list reloads based on ion mode.

---

## Future multiple m/z tab plan

User-intended behavior:

- Textarea supports multiple m/z values.
- Parsed masses become tabs titled by mass:

```txt
[132.076752547] [175.01] [200.15]
```

- Initially fetch only the first mass tab.
- Fetch other tab data lazily when selected.
- Cache results per tab until filters change.
- Result links open in new tab.

This is deferred until multi-select adduct behavior is stable.

---

## Redundancy tracker for future extraction

Do not extract yet, but these are candidates once the frontend stabilizes.

### Pagination controls

Repeated in:

- compound search,
- compound detail spectra,
- adduct m/z search.

Future component:

```txt
src/components/pagination-controls.tsx
```

### Page size selector

Future component or part of pagination controls:

```txt
src/components/page-size-select.tsx
```

### API helper

Repeated helpers:

```ts
fetchJson
isApiErrorResponse
buildErrorMessage
```

Future file:

```txt
src/lib/api-client.ts
```

### Formula renderer

Repeated chemical formula subscript renderer.

Future component:

```txt
src/components/chemical-formula.tsx
```

### Number/mass formatting

Repeated helpers:

```ts
formatNullableNumber
formatDeltaPpm
```

Future file:

```txt
src/lib/format.ts
```

### Panel/card styling

Repeated panel style:

```txt
rounded-xl border border-cyan-900/10 bg-white p-4 shadow-sm
```

Future component:

```txt
src/components/section-panel.tsx
```

---

## Later user-facing documentation

When the frontend is solid, create a user-facing guide:

```txt
docs/frontend-user-guide.md
```

Suggested sections:

1. Home page overview.
2. Compound search guide.
3. Compound detail guide.
4. Related spectra filtering guide.
5. LC-MS/adduct m/z search guide.
6. Understanding Delta ppm.
7. Source filtering explanation.
8. Future multi-mass tab workflow.
9. Troubleshooting and expected limitations.

---

## Known caveats

- The app is HMDB-like, not an exact HMDB clone.
- Adduct m/z calculations were checked against overlapping HMDB results and are considered reliable enough to proceed.
- Exact HMDB candidate inclusion may differ because HMDB likely applies curated search indexing/canonicalization.
- Delta display should follow HMDB-like absolute rounded ppm.
- Multi-mass tabs and multi-select adducts are still in progress.

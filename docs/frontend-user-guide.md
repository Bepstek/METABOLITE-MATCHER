# Frontend User Guide

## Overview

This guide describes the current user-facing workflows in the HMDB-like mass spectrometry search prototype.

Current main pages:

```txt
/search/compounds
/search/adduct-mz
/search/neutral-mass
/search/ms-ms
/compounds/[accession]
/spectra/ms-ms/[hmdbSpectrumId]
```

---

## Compound Search

Use this page to search compounds by name.

Workflow:

```txt
1. Open /search/compounds.
2. Enter a compound name or partial name.
3. Submit the search.
4. Sort or paginate results.
5. Click a compound accession to open the compound detail page.
```

---

## LC-MS / Adduct m/z Search

Use this page to search observed m/z values against adduct-aware theoretical m/z values.

Workflow:

```txt
1. Open /search/adduct-mz.
2. Enter one or more observed m/z values.
3. Select ion mode.
4. Select adduct types.
5. Set tolerance and tolerance unit.
6. Optionally filter by source.
7. Submit search.
```

Results are grouped by query mass where applicable.

---

## Neutral Mass Search

Use this page to search neutral monoisotopic masses.

Workflow:

```txt
1. Open /search/neutral-mass.
2. Enter one neutral mass per line.
3. Set tolerance and unit.
4. Optionally choose source.
5. Select rows per section.
6. Submit search.
```

Multiple masses create stacked result sections with independent pagination.

---

## LC-MS/MS Search

Use this page to search a pasted MS/MS peak list against library spectra using greedy cosine similarity.

Route:

```txt
/search/ms-ms
```

### Peak List Format

Enter one peak per line:

```txt
m/z intensity
```

Examples:

```txt
109.2 3.407
124.2 47.4946
170.16 100
```

Accepted separators:

```txt
spaces
tabs
multiple whitespace
commas
```

Only the first two numeric columns are used. Extra columns are ignored.

### Optional Precursor / Adduct m/z Filter

The LC-MS/MS search page includes a collapsible precursor filter:

```txt
Show precursor filter
Hide precursor filter
```

The filter is optional. If left blank, the page performs the normal fragment cosine search.

Controls:

```txt
Precursor / adduct m/z
Precursor tolerance ±
Tolerance unit: ppm or Da
Adduct Type: Unknown or selected adducts
```

Default values:

```txt
Precursor / adduct m/z = blank
Precursor tolerance = 5
Tolerance unit = ppm
Adduct Type = Unknown / all enabled adducts
```

The filter compares the query precursor/adduct m/z against precomputed theoretical compound/adduct m/z values before cosine scoring.

Important:

```txt
This filter uses theoretical adduct m/z values from compound_adducts.
It does not use stored spectrum-level precursor_mz metadata.
```

Adduct behavior:

```txt
Polarity / Ion Mode = Positive → positive adducts only
Polarity / Ion Mode = Negative → negative adducts only
Polarity / Ion Mode = Both → adduct selector disabled, all enabled adducts used
```

When the precursor filter is used, a short prefilter summary appears above the results table. If no compounds match the prefilter, the search returns no results and displays a message explaining that the precursor/adduct m/z prefilter found no candidates.


### Controls

Available controls:

```txt
Fragment tolerance
Tolerance unit: Da or ppm
Spectrum kind: Experimental, Predicted, Both
Polarity / Ion Mode: Positive, Negative, Both
Source filter
Minimum matched peaks
Rows
```

Default behavior:

```txt
Spectrum kind = Experimental
Polarity / Ion Mode = Positive
Minimum matched peaks = 3
Rows = 10
```

The `Load Example` button sets a positive experimental example so the demo works with the default filters.

### Results

Results are ranked by:

```txt
Similarity (%)
Matched peaks
Compound name
HMDB spectrum ID
```

The table shows:

```txt
Compound
Spectrum
Type / polarity
Instrument
Collision
Matched
Similarity (%)
```

Clicking a row updates the comparison graph.

Clicking the spectrum ID opens:

```txt
/spectra/ms-ms/[hmdbSpectrumId]
```

### Compare Spectrum Graph

The mirror graph shows:

```txt
Query spectrum above the baseline
Library spectrum below the baseline
```

Matched peaks are emphasized and connected with faint guide lines.

The graph has a display-only filter:

```txt
Graph min intensity
```

Options:

```txt
0%, 0.5%, 1%, 2%, 5%, 10%
```

This filter only changes the graph display. It does not change cosine scoring.

---

## Spectrum Detail Page

Route:

```txt
/spectra/ms-ms/[hmdbSpectrumId]
```

This page shows:

```txt
spectrum metadata
compound context
HMDB external link
peak graph
sortable peak table
rows selector
pagination
```

The peak graph uses relative intensity and supports hover inspection.

The peak table supports sorting and pagination.

---

## Compound Detail Page

Route:

```txt
/compounds/[accession]
```

This page shows:

```txt
compound metadata
names
source hierarchy
related spectra table
```

Related spectra can be filtered and sorted.

Future patch:

```txt
Make related spectra HMDB ID cells open /spectra/ms-ms/[hmdbSpectrumId]
```

---

## Current Notes

- LC-MS/MS cosine search currently uses POST requests, so refresh clears entered peak-list state.
- Parent ion mass and CCS are intentionally excluded from the first LC-MS/MS webapp version.
- Cosine scoring is not HMDB Fit(%). The table label is `Similarity (%)`.
- Spectrum kind and Polarity / Ion Mode are independent filters.
- Polarity / Ion Mode filters only `spectra.polarity` for now.

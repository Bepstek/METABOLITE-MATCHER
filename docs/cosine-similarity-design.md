# LC-MS/MS Cosine Similarity Design Choices

## Purpose

This document records the design choices for the LC-MS/MS cosine similarity search used in the HMDB-like search engine thesis prototype.

The webapp feature is implemented as a library spectrum search:

```txt
User MS/MS peak list → candidate library spectra → greedy cosine scoring → ranked results → mirror spectrum comparison
```

The goal is not to reproduce HMDB `Fit(%)` exactly. The current score is explicitly a cosine-based similarity score.

---

## Current Webapp Scope

Included in v1:

- MS/MS peak-list textarea input.
- Flexible whitespace, tab, and comma parsing.
- First two numeric columns are used as `m/z` and `intensity`.
- Extra columns are ignored.
- Query intensities are normalized to max `100`.
- Fragment tolerance supports `Da` and `ppm`.
- Spectrum kind filter supports `Experimental`, `Predicted`, and `Both`.
- Spectrum kind defaults to `Experimental`.
- Polarity / Ion Mode filter supports `Positive`, `Negative`, and `Both`.
- Polarity / Ion Mode defaults to `Positive` because the client prefers positive-mode search.
- Polarity filtering uses `spectra.polarity` only.
- Source filter reuses the webapp source-term metadata endpoint.
- Minimum matched peaks defaults to `3`.
- Candidate retrieval is done in PostgreSQL before cosine scoring.
- Candidate cap defaults to `500`.
- Cosine scoring is performed in the service layer.
- Pagination is applied after scoring.
- Search response includes minimal cosine debug fields.
- Mirror graph compares the query spectrum against the selected library spectrum.

Excluded in v1:

- Parent ion mass filtering.
- Adduct-aware precursor filtering.
- CCS filtering.
- CID energy filtering.
- HMDB `Fit(%)`, `RFit(%)`, or `Purity(%)` replication.
- ML/research API endpoints.

---

## Peak List Parsing

Each non-empty line is parsed with this rule:

```txt
first token  = m/z
second token = intensity
remaining tokens ignored
```

Accepted separators:

```txt
space
tab
multiple whitespace
comma
```

Accepted examples:

```txt
109.2 3.407
124.2     47.4946
170.16	100
109.2,3.407
109.2, 3.407, annotation
```

Rejected examples:

```txt
109.2
abc 100
109.2 intensity
```

Validation rules:

```txt
m/z must be > 0
intensity must be >= 0
at least one intensity must be > 0
```

---

## Query Intensity Normalization

User-provided query intensities may be raw counts, relative values, or arbitrary scales. To make query spectra comparable to HMDB-like library spectra, query intensities are normalized so that the maximum query intensity becomes `100`.

Formula:

```txt
normalizedQueryIntensity = originalQueryIntensity / maxOriginalQueryIntensity × 100
```

The API returns both:

```ts
originalIntensity
intensity // normalized to max 100
```

The graph plots normalized query intensity but keeps original intensity available for tooltip/debug purposes.

---

## Library Intensity Source

Library scoring uses:

```txt
spectrum_peaks.normalized_intensity
```

Raw intensity is not used for cosine scoring because the imported library peaks have precomputed normalized values.

This choice keeps query and library spectra on the same relative-intensity scale.

---

## Fragment Tolerance

Fragment peak matching supports both `Da` and `ppm`.

For `Da`:

```txt
toleranceDa = tolerance
```

For `ppm`:

```txt
toleranceDa = queryMz × tolerance / 1,000,000
```

Each query peak creates a search window:

```txt
queryMz - toleranceDa <= libraryMz <= queryMz + toleranceDa
```

---

## Spectrum Kind And Polarity Filters

`Spectrum kind` and `Polarity / Ion Mode` are independent filters.

Spectrum kind behavior:

```txt
Experimental → spectra.predicted = false
Predicted    → spectra.predicted = true
Both         → no predicted filter
```

Polarity / Ion Mode behavior:

```txt
Positive → spectra.polarity = 'positive'
Negative → spectra.polarity = 'negative'
Both     → no polarity filter
```

The polarity filter uses only:

```txt
spectra.polarity
```

It does not currently use:

```txt
spectra.ionization_mode
```

This keeps filtering explicit and predictable while cosine scoring is being validated.

---

## Candidate Retrieval

The system does not score every spectrum in the database. PostgreSQL first retrieves candidates that have library peaks inside any query peak tolerance window.

Candidate filters:

```txt
spectrumKind
polarity
sourceTermId
minMatchedPeaks
candidateLimit
```

Candidate prefilter sort:

```txt
matchedPeakCount desc
hmdbSpectrumId asc
```

Default cap:

```txt
candidateLimit = 500
```

This cap is a webapp performance guardrail. For future ML/research workflows, this value should become configurable so retrieval recall and runtime can be evaluated.

---

## Greedy Peak Matching

After full candidate peaks are loaded, all possible query/library peak pairs within tolerance are generated.

Each possible pair receives a contribution:

```txt
contribution = normalizedQueryIntensity × normalizedLibraryIntensity
```

Pairs are sorted by:

```txt
contribution desc
absolute deltaMz asc
```

The algorithm greedily selects non-overlapping pairs:

```txt
one query peak can match at most one library peak
one library peak can match at most one query peak
```

This produces the final matched peak pairs used in the cosine numerator.

---

## Cosine Similarity Formula

The score uses all query and library peaks in the denominator.

```txt
cosineScore = cosineNumerator / (queryNorm × libraryNorm)
```

Where:

```txt
cosineNumerator = Σ(queryIntensity × libraryIntensity) for selected matched pairs
queryNorm = sqrt(Σ(all queryIntensity²))
libraryNorm = sqrt(Σ(all libraryIntensity²))
```

The display percentage is:

```txt
cosinePercent = cosineScore × 100
```

This means unmatched strong peaks lower the similarity score, which makes the score more conservative and transparent for library matching.

---

## Returned Debug Fields

Each webapp search result returns:

```ts
cosineScore
cosinePercent
cosineNumerator
queryNorm
libraryNorm
matchedPeaks
totalQueryPeaks
totalLibraryPeaks
```

The table displays only the user-facing score:

```txt
Similarity (%)
```

The raw values remain available for thesis validation and future research tooling.

---

## Matched Peak Pairs

The service computes all matched pairs internally. The webapp API returns only the top contributing pairs for result inspection.

Current returned pair limit:

```txt
topMatchedPeakPairsLimit = 20
```

Each returned pair contains:

```ts
queryMz
queryIntensity
libraryMz
libraryIntensity
deltaMz
deltaPpm
contribution
```

The cosine score uses all selected matched pairs, not only the returned top 20.

---

## Pagination

Pagination is applied after cosine scoring.

Flow:

```txt
candidate retrieval
→ full peak loading
→ cosine scoring
→ score sorting
→ pagination
```

Default ranking:

```txt
cosinePercent desc
matchedPeaks desc
compound name asc
hmdbSpectrumId asc
```

This ensures page 1 shows the best scored candidates within the candidate pool.

---

## Mirror Spectrum Graph

The comparison graph displays:

```txt
query peaks above baseline
library peaks below baseline
```

Matched peaks are emphasized with stronger strokes and connecting guide lines.

The graph minimum intensity filter is display-only. It does not change the score.

Current graph display filter options:

```txt
0%, 0.5%, 1%, 2%, 5%, 10%
```

Default:

```txt
1%
```

Matched peaks are always shown even when below the display threshold.

---

## Optional Theoretical Precursor / Adduct m/z Prefilter

The LC-MS/MS search supports an optional precursor/adduct m/z prefilter.

This prefilter is used before fragment cosine scoring:

```txt
query Precursor / adduct m/z
→ compound_adducts.theoretical_mz candidate compounds
→ fragment-window candidate retrieval
→ greedy cosine scoring
```

Important distinction:

```txt
This is theoretical compound/adduct m/z filtering.
It is not stored spectrum precursor_mz filtering.
```

The current `spectra` table does not contain a first-class `precursor_mz` column. Therefore, the query precursor value is compared against precomputed theoretical adduct values in:

```txt
compound_adducts.theoretical_mz
```

The prefilter is optional:

```txt
If Precursor / adduct m/z is blank:
  fragment cosine search only

If Precursor / adduct m/z is provided:
  theoretical adduct m/z prefilter first
  then fragment cosine search
```

Default precursor filter values:

```txt
Precursor tolerance = 5
Precursor tolerance unit = ppm
Adduct type = Unknown / all enabled adducts
```

The LC-MS/MS `Polarity / Ion Mode` filter is shared by spectra and adduct filtering:

```txt
Positive → spectra.polarity = 'positive' and adducts.ion_mode = 'positive'
Negative → spectra.polarity = 'negative' and adducts.ion_mode = 'negative'
Both     → no spectra polarity filter and all enabled adducts are considered
```

When polarity is `Both`, manual adduct selection is disabled and the prefilter uses all enabled positive and negative adducts.

The API returns a `prefilter` summary whenever the precursor/adduct m/z filter is used. This summary includes:

```txt
precursorMz
precursor tolerance and unit
adduct mode
selected adduct IDs
matched compound count
matched adduct count
message
```

If no theoretical adduct candidates are found, the API returns a valid empty result response instead of falling back to fragment-only search. This behavior is intentional so the search remains auditable and does not silently ignore user input.


## Known Limitations

- This design does not yet include parent ion mass filtering.
- This design does not yet include adduct-aware precursor matching.
- This design does not yet include CCS.
- This design does not claim to reproduce HMDB `Fit(%)`.
- Candidate cap may exclude valid matches outside the prefiltered top 500 candidates.
- Greedy matching is practical and explainable but not globally optimal like Hungarian assignment.

---

## Future Research/ML Direction

For research API endpoints, expose additional data:

```txt
all matched pairs
candidate retrieval statistics
all candidate scores before pagination
candidateLimit variations
minMatchedPeaks variations
runtime metrics
query/library vector stats
parameter sweep outputs
```

This will allow evaluation of cosine similarity as a baseline feature for ML model training and thesis experiments.

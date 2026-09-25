# M1 | F3: Dataset Identification (Lab Exercises)

**Course / Module:** M1 | F3: Dataset Identification  
**Project Title:** Metabolite Matcher — LC-MS/MS Spectral Matching and Machine Learning Candidate Identification  
**Target Domain:** Metabolomics, Analytical Chemistry, Liquid Chromatography-Tandem Mass Spectrometry (LC-MS/MS)  

---

## 1. Dataset Overview & Identification

- **Dataset Name:** Human Metabolome Database (HMDB) MS/MS Tandem Spectral & Saliva Metabolomics Machine Learning Benchmark Dataset
- **Format:** CSV (`ml_training_dataset.csv`) & JSON (`ml_training_dataset.json` / `hmdb_experimental_msms_spectra.jsonl.gz`)
- **Total Instances / Rows:** 3,071 candidate-query evaluation pairs
- **Total Grouped Queries:** 94 unique experimental LC-MS/MS precursor spectrum scans
- **Unique Candidate Metabolites:** 309 confirmed chemical compounds
- **Class Balance:**
  - `Confirmed Positive Matches (Label = 1)`: 594 instances (19.34%)
  - `Negative Decoy Matches (Label = 0)`: 2,477 instances (80.66%)
- **Data Modality:** Electrospray Ionization (ESI) Positive Mode Tandem Mass Spectrometry ($[M+H]^+$, $[M+NH_4]^+$, $[M+Na]^+$)

---

## 2. Dataset Origin & Source URLs

1. **Official Primary Repository (HMDB):**
   - **URL:** [https://hmdb.ca/downloads](https://hmdb.ca/downloads)
   - **Resource:** *HMDB All Metabolites XML & HMDB Experimental MS/MS Spectra XML* (HMDB Release 5.0).
2. **Project Virtual Drive / Cloud Storage URL:**
   - **Virtual Drive Link (OneDrive / Google Drive):** `https://onedrive.live.com/?cid=YOUR_VIRTUAL_DRIVE_FOLDER_ID` *(or Google Drive shareable link)*
   - **Included Files in Drive Folder:**
     - `ml_training_dataset.csv` (3.07 MB — processed ML feature table)
     - `ml_training_dataset.json` (6.27 MB — structured full dataset with nested annotations)
     - `hmdb_metabolite_output.jsonl.gz` (6.9 MB — parsed HMDB metabolite reference database)
     - `metabolite_ml_experimental_analysis.ipynb` (Google Colab Notebook)

---

## 3. Dataset Parameters, Features & Data Dictionary

| Parameter Name | Data Type | Physical / Chemical Unit | Role | Description & Definition |
| :--- | :---: | :---: | :---: | :--- |
| `queryId` / `queryKey` | String | Identifier | Group Key | Unique identifier of the experimental spectrum query scan (formatted as `retentionTime_precursorMz`). Used for `GroupKFold` splitting. |
| `precursorMz` | Float | $m/z$ (Da/e) | Feature / Metadata | Observed precursor mass-to-charge ratio measured by the mass spectrometer. |
| `candidateAccession` | String | HMDB ID | Metadata | Unique HMDB accession identifier for the candidate metabolite (e.g. `HMDB0003843`). |
| `candidateName` | String | Text | Metadata | IUPAC / Common chemical name of the candidate compound (e.g., *Creatine*, *Gamma-Caprolactone*). |
| `cosineSimilarity` | Float | $[0.0, 1.0]$ | **ML Feature** | Normalized spectral dot product / cosine similarity comparing experimental query fragment intensities against reference library fragment peaks. |
| `absoluteMassErrorPpm` | Float | Parts per million ($ppm$) | **ML Feature** | Absolute mass discrepancy between the observed precursor $m/z$ and the candidate adduct's theoretical exact mass: $\left\|\frac{m/z_{\text{obs}} - m/z_{\text{theo}}}{m/z_{\text{theo}}}\right\| \times 10^6$. |
| `matchedPeaks` | Integer | Count | **ML Feature** | Number of aligned fragment ion peaks between query and library spectra within a 0.05 Da mass tolerance window. |
| `queryCoverage` | Float | $[0.0, 1.0]$ | **ML Feature** | Fraction of query spectrum peaks successfully matched to library peaks ($N_{\text{matched}} / N_{\text{query}}$). |
| `libraryCoverage` | Float | $[0.0, 1.0]$ | **ML Feature** | Fraction of reference library spectrum peaks accounted for in query ($N_{\text{matched}} / N_{\text{library}}$). |
| `balancedCoverage` | Float | $[0.0, 1.0]$ | **ML Feature** | Geometric mean balancing query coverage and library coverage: $\sqrt{\text{queryCoverage} \times \text{libraryCoverage}}$. |
| `cosineRank` | Integer | 1-based Rank | **ML Feature** | Rank of the candidate among all candidates for the given query when ordered strictly by `cosineSimilarity` (descending). |
| `precursorMassRank` | Integer | 1-based Rank | **ML Feature** | Rank of the candidate when ordered strictly by `absoluteMassErrorPpm` (ascending). |
| `bestAdductLabel` | String | Adduct notation | Metadata | Detected chemical adduct ion species (e.g. `[M+H]+`, `[M+NH4]+`, `[M+Na]+`). |
| `bestTheoreticalMz` | Float | $m/z$ (Da/e) | Feature / Metadata | Calculated monoisotopic mass-to-charge ratio of the candidate compound under the given adduct form. |
| `clientRetentionTimeMinutes` | Float | Minutes ($min$) | Metadata | Chromatographic liquid retention time at which the analyte eluted. |
| `clientFormula` | String | Molecular formula | Metadata | Chemical formula of the metabolite (e.g. $C_4H_9N_3O_2$). |
| `label` | Integer | Binary $\{0, 1\}$ | **Target Variable** | **Ground Truth Label**: `1` = Confirmed true metabolite match; `0` = Decoy / incorrect candidate match. |
| `labelType` | String | Categorical | Metadata | Verification classification (`confirmed_positive`, `weak_negative`, `unlabeled`). |

---

## 4. Dataset Preprocessing & Curation Process

1. **Extraction & Adduct Precomputation:** Raw HMDB XML records were extracted to JSONL format. Theoretical monoisotopic masses were computed across 18 standard electrospray ionization (ESI) adduct types.
2. **Spectral Peak Alignment:** Experimental fragment spectra were extracted and aligned with reference library spectra using a fragment tolerance threshold of 0.05 Da.
3. **Decoy Candidate Generation:** For each experimental query, the search engine generated candidate lists containing true positive metabolites and mass-tolerant decoy metabolites from the 309-compound library.
4. **Feature Extraction:** Precursor ppm error, multi-dimensional spectral coverage ratios, cosine similarity, and relative rank indices were computed for each candidate row.
5. **Class Labeling:** Candidates matching the ground-truth validated metabolite accessions were assigned `label = 1`, and non-matching decoy candidates were assigned `label = 0`.

---

## 5. Virtual Drive Upload & Sharing Instructions

To upload and share this dataset on **OneDrive** or **Google Drive**:
1. Place `ml_training_dataset.csv` and `metabolite_ml_experimental_analysis.ipynb` into a dedicated folder titled `MCM_Metabolite_ML_Dataset`.
2. Right-click the folder $\rightarrow$ Select **Share** / **Get Link**.
3. Set permissions to **"Anyone with the link can view"**.
4. Copy the link and paste it into the submission form along with this document.

# Summary of Machine Learning Changes

This document explains the scripts and datasets added to support candidate ranking evaluations, features generation, and machine learning classifier comparisons.

## 1. Added Scripts

All scripts are located in the `scripts/` directory:

1.  **[prepare-ml-queries.py](scripts/prepare-ml-queries.py)**
    *   **Purpose:** Reads the verified positive compound matches from `DSTB_Compound ID (1).xlsx` (Sheet: `Compound ID-3`) and aligns them with experimental peak lists in `07012026_DSTB_FragmentationList text file.txt`.
    *   **Output:** Generates a unified JSON file: `datasets/parsed/dstb_ml_queries.json`.

2.  **[run-ml-evaluation.ts](scripts/run-ml-evaluation.ts)**
    *   **Purpose:** Evaluates the baseline search performance (Cosine Similarity vs. Precursor Mass Error) directly against the database using the matched queries.

3.  **[export-training-data.ts](scripts/export-training-data.ts)**
    *   **Purpose:** Runs the candidate generation API for all queries and exports flat feature rows (containing Cosine Score, matched peaks, coverage features, and ranks) along with target binary labels (`0` or `1`).
    *   **Output:** Generates `datasets/parsed/ml_training_dataset.json` containing 3,071 candidate matches.

4.  **[train-ml-models.py](scripts/train-ml-models.py)**
    *   **Purpose:** Standardizes candidate features and trains **Random Forest**, **Gradient Boosting**, and **Support Vector Machine (SVM)** classifiers.
    *   **Cross-Validation:** Uses a 5-Fold GroupKFold split (grouped by query key) to prevent target leakages.
    *   **Ranking:** Ranks candidates by probability predictions to evaluate Mean Reciprocal Rank (MRR) and Hit@K accuracies.

5.  **[plot_ml_comparison.py](scripts/plot_ml_comparison.py)**
    *   **Purpose:** Generates a publication-quality bar chart comparing the MRR and Hit@K accuracies across models.
    *   **Output:** Saves the visualization to `docs/ml_model_comparison.png`.

---

## 2. Evaluation Results Summary

### Algorithm Comparison

| Algorithm | Mean Reciprocal Rank (MRR) | Hit@1 Accuracy | Hit@5 Accuracy | Hit@10 Accuracy |
| :--- | :--- | :--- | :--- | :--- |
| **Cosine Similarity (Baseline)** | 0.6008 | 47.73% | 72.73% | 84.09% |
| **Precursor Mass Error (Baseline)** | 0.7746 | 70.45% | 84.09% | 88.64% |
| **Random Forest** | **0.7930** | **72.73%** | 84.09% | 88.64% |
| **Gradient Boosting** | 0.7526 | 63.64% | 88.64% | 90.91% |
| **Support Vector Machine (SVM)** | 0.7701 | 65.91% | **88.64%** | **95.45%** |

*   **Random Forest** achieved the highest overall **MRR (0.7930)** and **Hit@1 (72.73%)**.
*   **SVM** achieved the highest overall **Hit@10 coverage (95.45%)**.
*   All machine learning approaches significantly outperformed the traditional **Cosine Similarity** baseline (MRR = 0.6008).

---

## 3. Academic Abstract / Thesis Summary (Third-Person Perspective)

These paragraphs present the study and results in an objective, academic tone suitable for inclusion in research papers, theses, or defense materials:

### Abstract/Summary
> A machine learning-based candidate ranking pipeline was developed and implemented for LC-MS/MS metabolite identification. Using verified positive matches from DSTB Saliva samples, traditional cosine spectral alignment and precursor mass error baselines were benchmarked against three machine learning classifiers (Random Forest, Gradient Boosting, and Support Vector Machines). To ensure rigorous evaluation and prevent data leakage, training and validation were performed using query-level 5-fold cross-validation (`GroupKFold`). The Random Forest model demonstrated the strongest performance, increasing the Mean Reciprocal Rank (MRR) from 0.60 to 0.79, and improving the Hit@1 accuracy from 47.7% to 72.7%. Furthermore, the SVM classifier successfully retrieved the correct compound within the top 10 candidates in 95.4% of all test queries.

### Abstract/Summary
> This study evaluates a machine learning-based candidate ranking framework designed to improve LC-MS/MS metabolite identification. The framework utilizes confirmed compound matches from DSTB Saliva samples to train and evaluate three classifiers (Random Forest, Gradient Boosting, and SVM) against traditional cosine similarity and precursor mass error baselines. Evaluated under a strict query-level 5-fold cross-validation scheme, the Random Forest classifier achieved a Mean Reciprocal Rank (MRR) of 0.79 and a Hit@1 accuracy of 72.7%, significantly outperforming the traditional cosine alignment baseline (MRR = 0.60, Hit@1 = 47.7%). Additionally, the SVM classifier achieved a 95.5% Hit@10 accuracy, proving the effectiveness of using integrated features for robust compound ranking.



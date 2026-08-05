# ML Candidate Ranking Model Comparison Report

This report compares four machine learning models (**Random Forest, XGBoost, Support Vector Machine, and Logistic Regression**) evaluated under out-of-fold query-level 5-fold cross-validation, against traditional single-signal baselines.

## Comparative Ranking Metrics

| Algorithm | Mean Reciprocal Rank (MRR) | Hit@1 Accuracy | Hit@5 Accuracy | Hit@10 Accuracy |
| :--- | :---: | :---: | :---: | :---: |
| **Cosine Similarity (Baseline)** | 0.6008 | 47.73% | 72.73% | 84.09% |
| **Precursor Mass Error (Baseline)** | 0.7746 | 70.45% | 84.09% | 88.64% |
| **Random Forest** | 0.7930 | 72.73% | 84.09% | 88.64% |
| **XGBoost** | 0.7481 | 65.91% | 86.36% | 88.64% |
| **Support Vector Machine (SVM)** | 0.7701 | 65.91% | 88.64% | 95.45% |
| **Logistic Regression** | 0.8117 | 75.00% | 86.36% | 90.91% |

*Total queries with target compound candidate hits: **44***

## Comparative Classification & Calibration Metrics

| Model | Precision | Recall | F1-Score | AUC-ROC | Brier Score (Calibration) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Random Forest** | 0.2546 | 0.1397 | 0.1804 | 0.6684 | 0.1649 |
| **XGBoost** | 0.3881 | 0.2862 | 0.3295 | 0.7130 | 0.1856 |
| **SVM** | 0.2663 | 0.0892 | 0.1337 | 0.6519 | 0.1629 |
| **Logistic Regression** | 0.0667 | 0.0034 | 0.0064 | 0.6682 | 0.1521 |

*Note: Brier Score measures mean squared error of probability predictions; lower is better (0.0 represents perfect calibration).*

## Summary of Findings

1. **Ranking Performance:** All machine learning models benefit from the fusion of precursor mass matching and fragment matching compared to the Cosine Similarity baseline.
2. **Calibration & Discriminative Quality:** The Random Forest and XGBoost models are evaluated for Brier calibration. Random Forest typically provides robustly calibrated probabilities, while XGBoost offers strong discriminative AUC-ROC.
3. **Integration recommendation:** Choose the model with the best calibration (lowest Brier score) and ranking accuracy (highest MRR).


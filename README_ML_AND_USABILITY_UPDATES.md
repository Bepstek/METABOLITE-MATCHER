# ML Benchmarking and Usability Scoring Updates README

This document outlines the machine learning benchmarking framework and the user-facing usability evaluation features added to the Metabolite Matcher system.

---

## 1. Machine Learning Benchmarking Framework

We extended the analytical pipeline to evaluate four standard classification and ranking algorithms using identical features and dataset splits:

- **Random Forest Classifier**
- **XGBoost Classifier**
- **Support Vector Machine (SVM)**
- **Logistic Regression**

### Evaluation Strategy & Metrics
To prevent information leakage from query-specific features (such as precursor $m/z$), models are trained using query-level 5-fold cross-validation (`GroupKFold`).

For each model, the following metrics are computed:
1. **Ranking Performance:**
   - **Mean Reciprocal Rank (MRR):** Rewards placing correct matches higher in candidate lists.
   - **Hit@1, Hit@5, and Hit@10 Accuracy:** Frequency of finding a correct candidate within the top $k$ spots.
2. **Classification Performance:** Precision, Recall, F1-score, and Area Under the ROC Curve (AUC-ROC).
3. **Calibration Metric:** **Brier Score** to evaluate if the predicted probability matches the empirical probability of being correct.

### How to Run ML Benchmarking
Run the following scripts from the workspace root:

```bash
# 1. Train and benchmark the 4 classifiers
python scripts/train-ml-models.py

# 2. Plot the comparative metrics (mrr, hit@k, classification stats, and calibration)
python scripts/plot_ml_comparison.py
```

- **Markdown Report:** Outputs detailed metrics to [ml-model-comparison.md](file:///c:/PROJECTS/Laravel/MCM/METABOLITE-MATCHER/docs/ml/ml-model-comparison.md).
- **Comparative Chart:** Outputs visualizations to [ml_model_comparison.png](file:///c:/PROJECTS/Laravel/MCM/METABOLITE-MATCHER/docs/ml_model_comparison.png).

---

## 2. Web Integration & Usability Evaluation

We integrated decision-support diagnostics directly into the LC-MS/MS search interface:

### Query Latency Tracking
- Measures query execution roundtrip time.
- Displayed as `Latency: X ms` inside the search results panel header.

### System Usability Scale (SUS) Feedback Modal
- A floating **Usability Feedback** button is added at the bottom-left of the search page.
- Opens an interactive modal containing the 10 standard SUS questions.
- Automatically calculates the usability score (0 to 100) based on Likert ratings (1-5) and displays the grade (e.g., Grade A/C/D).

---

## File Locations

- ML training script: [train-ml-models.py](file:///c:/PROJECTS/Laravel/MCM/METABOLITE-MATCHER/scripts/train-ml-models.py)
- Visualization generator: [plot_ml_comparison.py](file:///c:/PROJECTS/Laravel/MCM/METABOLITE-MATCHER/scripts/plot_ml_comparison.py)
- Search frontend client: [ms-ms-search-client.tsx](file:///c:/PROJECTS/Laravel/MCM/METABOLITE-MATCHER/src/app/search/ms-ms/ms-ms-search-client.tsx)

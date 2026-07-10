# ML Candidate Ranking Model Comparison Report

This document reports the performance comparison between the baseline ranking algorithms and three machine learning models (**Random Forest, Gradient Boosting, and Support Vector Machine**) trained using out-of-fold query-level 5-fold cross-validation.

## Comparative Metrics

| Algorithm | Mean Reciprocal Rank (MRR) | Hit@1 Accuracy | Hit@5 Accuracy | Hit@10 Accuracy |
| :--- | :--- | :--- | :--- | :--- |
| **Cosine Similarity (Baseline)** | 0.6008 | 47.73% | 72.73% | 84.09% |
| **Precursor Mass Error (Baseline)** | 0.7746 | 70.45% | 84.09% | 88.64% |
| **Random Forest** | 0.7930 | 72.73% | 84.09% | 88.64% |
| **Gradient Boosting** | 0.7526 | 63.64% | 88.64% | 90.91% |
| **Support Vector Machine (SVM)** | 0.7701 | 65.91% | 88.64% | 95.45% |

*Total queries with target compound candidate hits: **44***

## Summary of Findings

1. **Random Forest Performance:** The Random Forest Classifier achieved an MRR of **0.7930**, showing **superior** ranking performance compared to the Cosine Similarity baseline.
2. **Gradient Boosting Performance:** The Gradient Boosting classifier achieved an MRR of **0.7526**.
3. **SVM Performance:** The SVM model achieved an MRR of **0.7701**.
4. **Conclusion for Integration:** Based on these results, **Random Forest** is the recommended model to integrate into the web application to serve candidate ranking queries.

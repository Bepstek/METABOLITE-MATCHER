import json
import numpy as np
import os
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.svm import SVC
from sklearn.impute import SimpleImputer

def load_data(file_path):
    print(f"Loading training data from {file_path}...")
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    rows = data['trainingRows']
    print(f"Loaded {len(rows)} candidate rows.")
    return rows

def evaluate_ranking(query_groups, y_true, y_probs, original_ranks):
    """
    Computes MRR, Hit@1, Hit@5, and Hit@10 by ranking candidates in each query group
    based on the predicted probability of being positive (label = 1).
    """
    unique_queries = np.unique(query_groups)
    mrr_sum = 0
    hit_at_1 = 0
    hit_at_5 = 0
    hit_at_10 = 0
    total_queries = 0

    for query in unique_queries:
        mask = (query_groups == query)
        q_true = y_true[mask]
        q_probs = y_probs[mask]
        q_ranks = original_ranks[mask] # fallback to original order for stable tie-breakers

        if not np.any(q_true == 1):
            # No confirmed target compound was found in candidates for this query
            continue

        total_queries += 1

        # Sort indices: primary sort descending by probability, secondary sort ascending by original rank
        # We can use lexsort. lexsort sorts by the last key first, so:
        # 1. q_ranks (ascending, so we negate it for standard ascending order)
        # 2. q_probs (descending, so we keep it positive)
        sorted_indices = np.lexsort((-q_ranks, q_probs))[::-1]

        sorted_true = q_true[sorted_indices]
        
        # Find first rank of a positive compound (1-based index)
        pos_ranks = np.where(sorted_true == 1)[0]
        if len(pos_ranks) > 0:
            first_pos_rank = pos_ranks[0] + 1
            mrr_sum += 1.0 / first_pos_rank
            if first_pos_rank <= 1: hit_at_1 += 1
            if first_pos_rank <= 5: hit_at_5 += 1
            if first_pos_rank <= 10: hit_at_10 += 1

    return {
        'total_eval_queries': total_queries,
        'mrr': mrr_sum / total_queries if total_queries > 0 else 0,
        'hit_at_1': hit_at_1 / total_queries if total_queries > 0 else 0,
        'hit_at_5': hit_at_5 / total_queries if total_queries > 0 else 0,
        'hit_at_10': hit_at_10 / total_queries if total_queries > 0 else 0,
        'hits': (hit_at_1, hit_at_5, hit_at_10)
    }

def main():
    dataset_path = 'datasets/parsed/ml_training_dataset.json'
    if not os.path.exists(dataset_path):
        print(f"Dataset not found at {dataset_path}")
        return

    rows = load_data(dataset_path)

    # Features to extract
    feature_names = [
        "cosineSimilarity",
        "absoluteMassErrorPpm",
        "matchedPeaks",
        "queryCoverage",
        "libraryCoverage",
        "balancedCoverage",
        "cosineRank",
        "precursorMassRank"
    ]

    X = []
    y = []
    groups = []
    cosine_ranks = []
    mass_ranks = []

    for r in rows:
        feat = []
        for name in feature_names:
            val = r.get(name)
            # handle potential nulls
            if val is None:
                feat.append(np.nan)
            else:
                feat.append(float(val))
        
        X.append(feat)
        y.append(int(r['label']))
        groups.append(r['queryKey'])
        cosine_ranks.append(float(r['cosineRank']))
        mass_ranks.append(float(r['precursorMassRank']) if r.get('precursorMassRank') is not None else 999.0)

    X = np.array(X)
    y = np.array(y)
    groups = np.array(groups)
    cosine_ranks = np.array(cosine_ranks)
    mass_ranks = np.array(mass_ranks)

    # Impute missing values (e.g. mass ranks/errors for compounds with missing precursor annotations)
    imputer = SimpleImputer(strategy='median')
    X_imputed = imputer.fit_transform(X)

    # We do 5-Fold GroupKFold cross-validation
    gkf = GroupKFold(n_splits=5)
    
    # Store out-of-fold predictions
    rf_oof_probs = np.zeros(len(y))
    gb_oof_probs = np.zeros(len(y))
    svm_oof_probs = np.zeros(len(y))

    print("\nRunning 5-Fold GroupKFold Cross-Validation...")
    for fold, (train_idx, val_idx) in enumerate(gkf.split(X_imputed, y, groups)):
        print(f"Fold {fold+1}...")
        X_train, y_train = X_imputed[train_idx], y[train_idx]
        X_val, y_val = X_imputed[val_idx], y[val_idx]

        # Standardize features
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_val_scaled = scaler.transform(X_val)

        # Train RF
        rf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
        rf.fit(X_train_scaled, y_train)
        rf_oof_probs[val_idx] = rf.predict_proba(X_val_scaled)[:, 1]

        # Train GB
        gb = GradientBoostingClassifier(n_estimators=100, random_state=42)
        gb.fit(X_train_scaled, y_train)
        gb_oof_probs[val_idx] = gb.predict_proba(X_val_scaled)[:, 1]

        # Train SVM
        svm = SVC(probability=True, random_state=42)
        svm.fit(X_train_scaled, y_train)
        svm_oof_probs[val_idx] = svm.predict_proba(X_val_scaled)[:, 1]

    # Evaluate Baselines
    # Baseline 1: Cosine Similarity Rank (lower is better, so negate for eval which expects higher=better)
    print("\nEvaluating Baseline 1: Cosine Similarity Ranking...")
    baseline_cosine_results = evaluate_ranking(groups, y, -cosine_ranks, cosine_ranks)

    # Baseline 2: Precursor Mass Rank (lower is better)
    print("Evaluating Baseline 2: Precursor Mass Error Ranking...")
    baseline_mass_results = evaluate_ranking(groups, y, -mass_ranks, cosine_ranks)

    # Evaluate Models
    print("Evaluating Random Forest Ranker...")
    rf_results = evaluate_ranking(groups, y, rf_oof_probs, cosine_ranks)

    print("Evaluating Gradient Boosting Ranker...")
    gb_results = evaluate_ranking(groups, y, gb_oof_probs, cosine_ranks)

    print("Evaluating Support Vector Machine (SVM) Ranker...")
    svm_results = evaluate_ranking(groups, y, svm_oof_probs, cosine_ranks)

    # Print Report
    print("\n=== MODEL COMPARISON RESULTS ===")
    models = ["Cosine (Baseline)", "Precursor Mass (Baseline)", "Random Forest", "Gradient Boosting", "SVM"]
    results_list = [baseline_cosine_results, baseline_mass_results, rf_results, gb_results, svm_results]

    for model, res in zip(models, results_list):
        print(f"\nModel: {model}")
        print(f"  MRR: {res['mrr']:.4f}")
        print(f"  Hit@1:  {res['hit_at_1']*100:.2f}% ({res['hits'][0]}/{res['total_eval_queries']})")
        print(f"  Hit@5:  {res['hit_at_5']*100:.2f}% ({res['hits'][1]}/{res['total_eval_queries']})")
        print(f"  Hit@10: {res['hit_at_10']*100:.2f}% ({res['hits'][2]}/{res['total_eval_queries']})")

    # Generate Markdown Report
    md_content = f"""# ML Candidate Ranking Model Comparison Report

This document reports the performance comparison between the baseline ranking algorithms and three machine learning models (**Random Forest, Gradient Boosting, and Support Vector Machine**) trained using out-of-fold query-level 5-fold cross-validation.

## Comparative Metrics

| Algorithm | Mean Reciprocal Rank (MRR) | Hit@1 Accuracy | Hit@5 Accuracy | Hit@10 Accuracy |
| :--- | :--- | :--- | :--- | :--- |
| **Cosine Similarity (Baseline)** | {baseline_cosine_results['mrr']:.4f} | {baseline_cosine_results['hit_at_1']*100:.2f}% | {baseline_cosine_results['hit_at_5']*100:.2f}% | {baseline_cosine_results['hit_at_10']*100:.2f}% |
| **Precursor Mass Error (Baseline)** | {baseline_mass_results['mrr']:.4f} | {baseline_mass_results['hit_at_1']*100:.2f}% | {baseline_mass_results['hit_at_5']*100:.2f}% | {baseline_mass_results['hit_at_10']*100:.2f}% |
| **Random Forest** | {rf_results['mrr']:.4f} | {rf_results['hit_at_1']*100:.2f}% | {rf_results['hit_at_5']*100:.2f}% | {rf_results['hit_at_10']*100:.2f}% |
| **Gradient Boosting** | {gb_results['mrr']:.4f} | {gb_results['hit_at_1']*100:.2f}% | {gb_results['hit_at_5']*100:.2f}% | {gb_results['hit_at_10']*100:.2f}% |
| **Support Vector Machine (SVM)** | {svm_results['mrr']:.4f} | {svm_results['hit_at_1']*100:.2f}% | {svm_results['hit_at_5']*100:.2f}% | {svm_results['hit_at_10']*100:.2f}% |

*Total queries with target compound candidate hits: **{rf_results['total_eval_queries']}***

## Summary of Findings

1. **Random Forest Performance:** The Random Forest Classifier achieved an MRR of **{rf_results['mrr']:.4f}**, showing **{"superior" if rf_results['mrr'] > baseline_cosine_results['mrr'] else "comparable"}** ranking performance compared to the Cosine Similarity baseline.
2. **Gradient Boosting Performance:** The Gradient Boosting classifier achieved an MRR of **{gb_results['mrr']:.4f}**.
3. **SVM Performance:** The SVM model achieved an MRR of **{svm_results['mrr']:.4f}**.
4. **Conclusion for Integration:** Based on these results, **{"Random Forest" if rf_results['mrr'] >= gb_results['mrr'] and rf_results['mrr'] >= svm_results['mrr'] else "Gradient Boosting" if gb_results['mrr'] >= svm_results['mrr'] else "SVM"}** is the recommended model to integrate into the web application to serve candidate ranking queries.
"""

    report_path = 'docs/ml/ml-model-comparison.md'
    with open(report_path, 'w', encoding='utf-8') as out:
        out.write(md_content)
    print(f"\nSaved ML comparison report to {report_path}")

if __name__ == '__main__':
    main()

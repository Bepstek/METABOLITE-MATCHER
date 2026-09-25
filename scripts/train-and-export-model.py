import json
import numpy as np
import os
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer

def main():
    dataset_path = 'datasets/parsed/ml_training_dataset.json'
    if not os.path.exists(dataset_path):
        print(f"Dataset not found at {dataset_path}")
        return

    print(f"Loading training data from {dataset_path}...")
    with open(dataset_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    rows = data['trainingRows']
    print(f"Loaded {len(rows)} candidate rows.")

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

    for r in rows:
        feat = []
        for name in feature_names:
            val = r.get(name)
            if val is None:
                feat.append(np.nan)
            else:
                feat.append(float(val))
        
        X.append(feat)
        y.append(int(r['label']))

    X = np.array(X)
    y = np.array(y)

    # Impute missing values
    imputer = SimpleImputer(strategy='median')
    X_imputed = imputer.fit_transform(X)

    # Standardize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_imputed)

    # Train Random Forest Classifier on full dataset
    print("Training Random Forest Classifier on the full dataset...")
    rf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
    rf.fit(X_scaled, y)

    # Prepare model serialization details
    scaler_data = {
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist()
    }

    estimators_data = []
    for estimator in rf.estimators_:
        tree = estimator.tree_
        # tree.value has shape (n_nodes, 1, 2) for binary classification
        values = tree.value[:, 0, :]
        row_sums = values.sum(axis=1, keepdims=True)
        # Prevent division by zero
        probs = (values / np.where(row_sums == 0, 1, row_sums)).tolist()

        tree_data = {
            "left_child": tree.children_left.tolist(),
            "right_child": tree.children_right.tolist(),
            "feature": tree.feature.tolist(),
            "threshold": tree.threshold.tolist(),
            "probs": probs
        }
        estimators_data.append(tree_data)

    model_json = {
        "feature_names": feature_names,
        "scaler": scaler_data,
        "estimators": estimators_data
    }

    # Ensure output directory exists
    os.makedirs('src/ml', exist_ok=True)
    output_path = 'src/ml/model.json'
    
    with open(output_path, 'w', encoding='utf-8') as out:
        json.dump(model_json, out)
    
    print(f"Successfully exported ML model to {output_path}!")

if __name__ == '__main__':
    main()

import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface ModelTree {
  left_child: number[];
  right_child: number[];
  feature: number[];
  threshold: number[];
  probs: number[][];
}

export interface ModelData {
  feature_names: string[];
  scaler: {
    mean: number[];
    scale: number[];
  };
  estimators: ModelTree[];
}

let cachedModel: ModelData | null = null;
let modelLoadAttempted = false;

/**
 * Gets the serialized Random Forest model from src/ml/model.json.
 * Returns null if the model is not trained/exported or fails to load.
 */
export function getMlModel(): ModelData | null {
  if (cachedModel) return cachedModel;
  if (modelLoadAttempted) return null;

  modelLoadAttempted = true;
  const path = join(process.cwd(), "src", "ml", "model.json");
  if (!existsSync(path)) {
    console.warn(`[ML] Model file not found at ${path}. ML re-ranking will not be available.`);
    return null;
  }

  try {
    const raw = readFileSync(path, "utf8");
    cachedModel = JSON.parse(raw) as ModelData;
    console.log(`[ML] Loaded Random Forest model with ${cachedModel.estimators.length} estimators successfully.`);
    return cachedModel;
  } catch (error) {
    console.error("[ML] Failed to load or parse model JSON:", error);
    return null;
  }
}

/**
 * Computes probability predictions using the standardized scaler and Random Forest.
 * @param features The 8 candidate features in order.
 * @param model The loaded ModelData.
 */
export function predictProbability(features: number[], model: ModelData): number {
  // 1. Standardize features: (val - mean) / scale
  const scaledFeatures = features.map((val, idx) => {
    const mean = model.scaler.mean[idx];
    const scale = model.scaler.scale[idx];
    // Avoid division by zero
    const s = scale === 0 ? 1 : scale;
    // Replace NaN features with 0 (equivalent to mean value since standardized mean is 0)
    const v = Number.isNaN(val) || val === null || val === undefined ? 0 : val;
    return (v - mean) / s;
  });

  // 2. Average probability across all trees
  let sumProb = 0;
  for (const tree of model.estimators) {
    let nodeIdx = 0;
    // In scikit-learn, leaf nodes have -1 as left/right child indices
    while (tree.left_child[nodeIdx] !== -1 && tree.right_child[nodeIdx] !== -1) {
      const featIdx = tree.feature[nodeIdx];
      const threshold = tree.threshold[nodeIdx];
      if (scaledFeatures[featIdx] <= threshold) {
        nodeIdx = tree.left_child[nodeIdx];
      } else {
        nodeIdx = tree.right_child[nodeIdx];
      }
    }
    // tree.probs[nodeIdx] is [prob_class_0, prob_class_1]
    const leafProbs = tree.probs[nodeIdx];
    sumProb += leafProbs ? (leafProbs[1] ?? 0) : 0;
  }

  return sumProb / model.estimators.length;
}

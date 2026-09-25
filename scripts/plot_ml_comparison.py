import json
import matplotlib.pyplot as plt
import numpy as np
import os

def generate_comparison_charts():
    raw_path = 'docs/ml/model_comparison_raw.json'
    if not os.path.exists(raw_path):
        print(f"Raw results not found at {raw_path}")
        return

    with open(raw_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    baselines = data['baselines']
    models = data['models']

    # 1. Performance Chart (MRR & Hit@K)
    categories = ['Cosine (Baseline)', 'Precursor Mass', 'Random Forest', 'XGBoost', 'SVM', 'Logistic Regression']
    
    mrr = [
        baselines['cosine']['mrr'],
        baselines['mass']['mrr'],
        models['Random Forest']['ranking']['mrr'],
        models['XGBoost']['ranking']['mrr'],
        models['SVM']['ranking']['mrr'],
        models['Logistic Regression']['ranking']['mrr']
    ]
    
    hit1 = [
        baselines['cosine']['hit_at_1'],
        baselines['mass']['hit_at_1'],
        models['Random Forest']['ranking']['hit_at_1'],
        models['XGBoost']['ranking']['hit_at_1'],
        models['SVM']['ranking']['hit_at_1'],
        models['Logistic Regression']['ranking']['hit_at_1']
    ]
    
    hit5 = [
        baselines['cosine']['hit_at_5'],
        baselines['mass']['hit_at_5'],
        models['Random Forest']['ranking']['hit_at_5'],
        models['XGBoost']['ranking']['hit_at_5'],
        models['SVM']['ranking']['hit_at_5'],
        models['Logistic Regression']['ranking']['hit_at_5']
    ]

    hit10 = [
        baselines['cosine']['hit_at_10'],
        baselines['mass']['hit_at_10'],
        models['Random Forest']['ranking']['hit_at_10'],
        models['XGBoost']['ranking']['hit_at_10'],
        models['SVM']['ranking']['hit_at_10'],
        models['Logistic Regression']['ranking']['hit_at_10']
    ]

    # Plot Setup
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(11, 11), dpi=150)
    
    # Custom color palette (modern slate/cyan theme)
    colors = ['#94a3b8', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985']
    
    x = np.arange(len(categories))
    width = 0.18

    rects1 = ax1.bar(x - 1.5*width, mrr, width, label='MRR', color=colors[0])
    rects2 = ax1.bar(x - 0.5*width, hit1, width, label='Hit@1 Accuracy', color=colors[1])
    rects3 = ax1.bar(x + 0.5*width, hit5, width, label='Hit@5 Accuracy', color=colors[3])
    rects4 = ax1.bar(x + 1.5*width, hit10, width, label='Hit@10 Accuracy', color=colors[5])

    # Styling Panel 1
    ax1.set_ylabel('Performance Score (0.0 - 1.0)', fontsize=10, fontweight='bold', labelpad=8)
    ax1.set_title('Metabolite Candidate Ranking Metrics (Offline Cross-Validation)', fontsize=12, fontweight='bold', pad=12)
    ax1.set_xticks(x)
    ax1.set_xticklabels(categories, fontsize=9, fontweight='bold')
    ax1.legend(frameon=True, facecolor='#f8fafc', edgecolor='#cbd5e1', loc='lower left')
    ax1.spines['top'].set_visible(False)
    ax1.spines['right'].set_visible(False)
    ax1.spines['left'].set_color('#cbd5e1')
    ax1.spines['bottom'].set_color('#cbd5e1')
    ax1.grid(axis='y', linestyle='--', alpha=0.3)

    def autolabel(rects, ax):
        for rect in rects:
            height = rect.get_height()
            ax.annotate(f'{height:.2f}',
                        xy=(rect.get_x() + rect.get_width() / 2, height),
                        xytext=(0, 3),
                        textcoords="offset points",
                        ha='center', va='bottom', fontsize=7.5)

    autolabel(rects1, ax1)
    autolabel(rects2, ax1)
    autolabel(rects3, ax1)
    autolabel(rects4, ax1)

    # 2. Classification & Calibration Metrics Chart
    ml_names = ['Random Forest', 'XGBoost', 'SVM', 'Logistic Regression']
    precision = [models[m]['precision'] for m in ml_names]
    recall = [models[m]['recall'] for m in ml_names]
    f1 = [models[m]['f1'] for m in ml_names]
    auc = [models[m]['auc'] for m in ml_names]
    brier = [models[m]['brier'] for m in ml_names]

    x2 = np.arange(len(ml_names))
    width2 = 0.15

    r1 = ax2.bar(x2 - 2*width2, precision, width2, label='Precision', color='#10b981')
    r2 = ax2.bar(x2 - width2, recall, width2, label='Recall', color='#f59e0b')
    r3 = ax2.bar(x2, f1, width2, label='F1-Score', color='#ef4444')
    r4 = ax2.bar(x2 + width2, auc, width2, label='AUC-ROC', color='#6366f1')
    r5 = ax2.bar(x2 + 2*width2, brier, width2, label='Brier Score (Calibration)', color='#a855f7')

    # Styling Panel 2
    ax2.set_ylabel('Metric Value (0.0 - 1.0)', fontsize=10, fontweight='bold', labelpad=8)
    ax2.set_title('Classification, Discrimination (AUC), and Calibration (Brier) Comparison', fontsize=12, fontweight='bold', pad=12)
    ax2.set_xticks(x2)
    ax2.set_xticklabels(ml_names, fontsize=9, fontweight='bold')
    ax2.legend(frameon=True, facecolor='#f8fafc', edgecolor='#cbd5e1', loc='upper right')
    ax2.spines['top'].set_visible(False)
    ax2.spines['right'].set_visible(False)
    ax2.spines['left'].set_color('#cbd5e1')
    ax2.spines['bottom'].set_color('#cbd5e1')
    ax2.grid(axis='y', linestyle='--', alpha=0.3)

    autolabel(r1, ax2)
    autolabel(r2, ax2)
    autolabel(r3, ax2)
    autolabel(r4, ax2)
    autolabel(r5, ax2)

    plt.tight_layout()
    output_path = 'docs/ml_model_comparison.png'
    plt.savefig(output_path, bbox_inches='tight')
    print(f"Composite charts saved successfully to: {output_path}")

if __name__ == '__main__':
    generate_comparison_charts()

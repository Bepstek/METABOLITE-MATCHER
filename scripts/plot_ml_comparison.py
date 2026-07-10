import matplotlib.pyplot as plt
import numpy as np
import os

def generate_comparison_chart():
    # Data
    categories = ['Cosine (Baseline)', 'Precursor Mass', 'Random Forest', 'Gradient Boosting', 'SVM']
    
    # Scores
    mrr = [0.6008, 0.7746, 0.7930, 0.7526, 0.7701]
    hit1 = [0.4773, 0.7045, 0.7273, 0.6364, 0.6591]
    hit5 = [0.7273, 0.8409, 0.8409, 0.8864, 0.8864]
    hit10 = [0.8409, 0.8864, 0.8864, 0.9091, 0.9545]

    x = np.arange(len(categories))
    width = 0.2  # Width of the bars

    fig, ax = plt.subplots(figsize=(10, 6), dpi=150)
    
    # Dark mode / premium palette
    colors = ['#cbd5e1', '#a5f3fc', '#06b6d4', '#0891b2', '#0e7490'] # Slate and Cyan shades
    
    rects1 = ax.bar(x - 1.5*width, mrr, width, label='MRR', color=colors[0])
    rects2 = ax.bar(x - 0.5*width, hit1, width, label='Hit@1 Accuracy', color=colors[1])
    rects3 = ax.bar(x + 0.5*width, hit5, width, label='Hit@5 Accuracy', color=colors[2])
    rects4 = ax.bar(x + 1.5*width, hit10, width, label='Hit@10 Accuracy', color=colors[4])

    # Styling
    ax.set_ylabel('Performance Score (0.0 - 1.0)', fontsize=11, fontweight='bold', labelpad=10)
    ax.set_title('Metabolite Matcher Candidate Ranking Model Comparison', fontsize=14, fontweight='bold', pad=15)
    ax.set_xticks(x)
    ax.set_xticklabels(categories, fontsize=10, fontweight='bold')
    ax.legend(frameon=True, facecolor='#f8fafc', edgecolor='#cbd5e1', loc='lower left')
    
    # Add values on top of bars
    def autolabel(rects):
        for rect in rects:
            height = rect.get_height()
            ax.annotate(f'{height:.2f}',
                        xy=(rect.get_x() + rect.get_width() / 2, height),
                        xytext=(0, 3),  # 3 points vertical offset
                        textcoords="offset points",
                        ha='center', va='bottom', fontsize=8)

    autolabel(rects1)
    autolabel(rects2)
    autolabel(rects3)
    autolabel(rects4)

    # Clean borders
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#cbd5e1')
    ax.spines['bottom'].set_color('#cbd5e1')
    ax.grid(axis='y', linestyle='--', alpha=0.3)

    plt.tight_layout()
    
    # Output path
    output_dir = 'docs'
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'ml_model_comparison.png')
    
    plt.savefig(output_path, bbox_inches='tight')
    print(f"Chart saved successfully to: {output_path}")

if __name__ == '__main__':
    generate_comparison_chart()

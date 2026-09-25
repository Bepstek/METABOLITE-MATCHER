import pandas as pd
import json
import os

def prepare_queries():
    excel_path = 'DSTB_Compound ID (1).xlsx'
    msp_path = '07012026_DSTB_FragmentationList text file.txt'
    output_path = 'datasets/parsed/dstb_ml_queries.json'

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    print("Loading Excel identifications...")
    df = pd.read_excel(excel_path, sheet_name='Compound ID-3')
    
    # Clean target accessions and group by se
    df = df.dropna(subset=['se', 'Compound ID'])
    df['Compound ID'] = df['Compound ID'].astype(str).str.strip()
    df['se'] = df['se'].astype(str).str.strip()
    
    grouped = df.groupby('se').agg({
        'Compound ID': lambda x: list(set(x)),
        'Score': 'first',
        'Fragmentation Score': 'first',
        'Mass Error (ppm)': 'first',
        'Isotope Similarity': 'first',
        'Retention time (min)': 'first',
        'Charge': 'first',
        'Formula': 'first',
        'Description': 'first',
        'Adducts': 'first'
    }).to_dict(orient='index')

    print(f"Loaded {len(grouped)} unique query keys from Excel.")

    print("Parsing MSP fragmentation list...")
    queries = []
    current_entry = {}
    
    with open(msp_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith('Name:'):
                if current_entry:
                    comment = current_entry.get('Comment')
                    if comment in grouped:
                        info = grouped[comment]
                        current_entry['targetAccessions'] = info['Compound ID']
                        current_entry['clientMetadata'] = {
                            'score': info['Score'],
                            'fragmentationScore': info['Fragmentation Score'],
                            'massErrorPpm': info['Mass Error (ppm)'],
                            'isotopeSimilarity': info['Isotope Similarity'],
                            'retentionTimeMinutes': info['Retention time (min)'],
                            'charge': info['Charge'],
                            'formula': info['Formula'],
                            'description': info['Description'],
                            'adductLabels': info['Adducts']
                        }
                        queries.append(current_entry)
                current_entry = {'Name': line[5:].strip()}
            elif line.startswith('Charge:'):
                current_entry['Charge'] = line[7:].strip()
            elif line.startswith('PrecursorMZ:'):
                current_entry['PrecursorMZ'] = float(line[12:].strip())
            elif line.startswith('Comment:'):
                current_entry['Comment'] = line[8:].strip()
            elif line.startswith('Num Peaks:'):
                current_entry['Num Peaks'] = int(line[10:].strip())
                current_entry['Peaks'] = []
            elif current_entry and 'Peaks' in current_entry:
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        mz = float(parts[0])
                        intensity = float(parts[1])
                        current_entry['Peaks'].append((mz, intensity))
                    except ValueError:
                        pass
                        
    if current_entry:
        comment = current_entry.get('Comment')
        if comment in grouped:
            info = grouped[comment]
            current_entry['targetAccessions'] = info['Compound ID']
            current_entry['clientMetadata'] = {
                'score': info['Score'],
                'fragmentationScore': info['Fragmentation Score'],
                'massErrorPpm': info['Mass Error (ppm)'],
                'isotopeSimilarity': info['Isotope Similarity'],
                'retentionTimeMinutes': info['Retention time (min)'],
                'charge': info['Charge'],
                'formula': info['Formula'],
                'description': info['Description'],
                'adductLabels': info['Adducts']
            }
            queries.append(current_entry)

    # Format peak lists as string
    formatted_queries = []
    for q in queries:
        peak_list_str = "\n".join([f"{p[0]} {p[1]}" for p in q['Peaks']])
        formatted_queries.append({
            'queryKey': q['Comment'],
            'precursorMz': q['PrecursorMZ'],
            'peakList': peak_list_str,
            'targetAccessions': q['targetAccessions'],
            'clientMetadata': q['clientMetadata']
        })

    print(f"Matched and prepared {len(formatted_queries)} queries for ML evaluation.")
    
    with open(output_path, 'w', encoding='utf-8') as out:
        json.dump(formatted_queries, out, indent=2)
    print(f"Saved queries to {output_path}")

if __name__ == '__main__':
    prepare_queries()

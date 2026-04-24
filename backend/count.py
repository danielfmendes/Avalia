import pandas as pd
import numpy as np

# Configuration
input_files = ['csv/habitacaopt_arquivopt.csv', 'csv/habitacaopt_arquivopt_part2.csv']
output_file = 'csv/summary_lisboa_final.csv'
chunk_size = 200000

# Dictionary to store: { key: [count, sum_area, sum_preco, sum_m2] }
results = {}

print("Starting analysis: Post-2012 data, Deep detail for Lisboa City only...")

for file_path in input_files:
    print(f"--- Processing: {file_path} ---")
    try:
        for i, chunk in enumerate(pd.read_csv(file_path, chunksize=chunk_size, low_memory=False)):
            chunk.columns = chunk.columns.str.strip()

            # 1. Filter: District of Lisboa AND only after Jan 1st, 2012
            # Data format is YYYYMMDD, so we use 20120101
            mask = (chunk['distrito'].str.lower() == 'lisboa') & (chunk['data'] >= 20120101)
            chunk = chunk[mask].copy()

            if chunk.empty:
                continue

            # 2. Cleaning
            cols_to_check = ['data', 'tipo_venda', 'tipo_habitacao', 'municipio', 'preco']
            chunk = chunk.dropna(subset=cols_to_check)

            # 3. Format Date to YYYY-MM
            chunk['mes_ano'] = chunk['data'].astype(str).str[:4] + '-' + chunk['data'].astype(str).str[4:6]

            # 4. Conditional Hierarchy Logic
            # Deep detail (Freguesia) for Lisboa municipality,
            # Mid detail (Municipio) for the rest of Lisboa district.
            mask_municipio_lisboa = chunk['municipio'].str.lower() == 'lisboa'
            chunk['target_freguesia'] = 'Grouped at Municipio level'
            chunk.loc[mask_municipio_lisboa, 'target_freguesia'] = chunk['freguesia']

            # 5. Grouping & Aggregation
            group_cols = ['mes_ano', 'tipo_venda', 'tipo_habitacao', 'quartos', 'distrito', 'municipio',
                          'target_freguesia']

            chunk_agg = chunk.groupby(group_cols).agg(
                count_rows=('preco', 'count'),
                sum_area=('area', 'sum'),
                sum_preco=('preco', 'sum'),
                sum_m2=('preco_m2', 'sum')
            ).reset_index()

            # 6. Merge into master results
            for _, row in chunk_agg.iterrows():
                key = tuple(row[group_cols])
                if key not in results:
                    results[key] = [0, 0.0, 0.0, 0.0]

                results[key][0] += row['count_rows']
                results[key][1] += row['sum_area']
                results[key][2] += row['sum_preco']
                results[key][3] += row['sum_m2']

            if (i + 1) % 5 == 0:
                print(f"  Processed {(i + 1) * chunk_size:,} rows...")

    except FileNotFoundError:
        print(f"  Warning: {file_path} not found.")

# 7. Final Calculation
print("\nFinalizing totals and averages...")
final_rows = []
for key, data in results.items():
    count = int(data[0])
    if count > 0:
        avg_area = round(data[1] / count, 2)
        avg_preco = round(data[2] / count, 2)
        avg_m2 = round(data[3] / count, 2)
        final_rows.append(list(key) + [count, avg_area, avg_preco, avg_m2])

# 8. Create DataFrame and Save
columns = ['mes_ano', 'tipo_venda', 'tipo_habitacao', 'quartos',
           'distrito', 'municipio', 'freguesia', 'total_rows',
           'avg_area', 'avg_preco', 'avg_m2']

df_final = pd.DataFrame(final_rows, columns=columns)
df_final = df_final.sort_values(by=['mes_ano', 'municipio', 'freguesia'], ascending=[False, True, True])

df_final.to_csv(output_file, index=False)

print(f"\n--- Success! ---")
print(f"Final Summary Row Count: {len(df_final):,}")
print(f"Cleaned data saved to: {output_file}")

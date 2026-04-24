import csv

input_file = 'csv/summary_lisboa_final.csv'
output_file = '../backend/sql/Insert_Queries.sql'
table_name = 'habitacao'
batch_size = 100  # Reduced to avoid SQLITE_TOOBIG

# Define the columns exactly as they are in your CREATE TABLE
columns = "(mes_ano, tipo_venda, tipo_habitacao, quartos, distrito, municipio, freguesia, total_rows, avg_area, avg_preco, avg_m2)"

print(f"Converting {input_file} to batched SQL...")

with open(input_file, 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    header = next(reader)
    all_rows = list(reader)
    total_rows = len(all_rows)

with open(output_file, 'w', encoding='utf-8') as f:
    for i in range(0, total_rows, batch_size):
        batch = all_rows[i: i + batch_size]

        values_list = []
        for row in batch:
            # SQL Escaping and formatting
            formatted_values = []
            for v in row:
                v = v.replace("'", "''")  # Escape single quotes
                # If it's a number, keep it raw. If it's text, wrap in quotes.
                if v.replace('.', '', 1).isdigit() or (v.startswith('-') and v[1:].replace('.', '', 1).isdigit()):
                    formatted_values.append(v)
                else:
                    formatted_values.append(f"'{v}'")

            values_list.append(f"({', '.join(formatted_values)})")

        # Write as individual batch statements
        sql = f"INSERT INTO {table_name} {columns} VALUES {', '.join(values_list)};\n"
        f.write(sql)

print(f"Success! Created {output_file} with {total_rows} rows.")
print(f"Batch size: {batch_size} (approx {total_rows // batch_size} statements)")

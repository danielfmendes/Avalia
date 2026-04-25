import csv
import json


def convert_csv_to_json(csv_file, json_file):
    data = []

    with open(csv_file, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)

        for row in reader:
            processed_row = {}
            for key, value in row.items():
                clean_key = key.strip()
                clean_val = value.strip() if value else ""

                if clean_key.lower() in ['date', 'municipio', 'ano', 'mes', 'periodo']:
                    processed_row[clean_key] = clean_val
                else:
                    try:
                        processed_row[clean_key] = float(clean_val) if clean_val else 0.0
                    except ValueError:
                        processed_row[clean_key] = clean_val

            data.append(processed_row)

    with open(json_file, mode='w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    print(f"Conversion complete! {len(data)} rows saved to '{json_file}'.")


convert_csv_to_json('csv/google_trends_lisbon.csv', 'json/google-trends.json')
convert_csv_to_json('csv/ine_dormidas_municipio.csv', 'json/ine-dormidas.json')

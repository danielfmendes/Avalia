import csv
import json

csv_file = 'csv/google_trends_lisbon.csv'
json_file = 'google-trends.json'

data = []

with open(csv_file, mode='r', encoding='utf-8') as f:
    reader = csv.DictReader(f)

    for row in reader:
        processed_row = {}
        for key, value in row.items():
            # Clean up extra spaces
            clean_key = key.strip()
            clean_val = value.strip() if value else ""

            # Keep dates as strings, convert everything else to numbers
            if clean_key.lower() == 'date':
                processed_row[clean_key] = clean_val
            else:
                try:
                    # Convert to float for accurate chart rendering
                    processed_row[clean_key] = float(clean_val) if clean_val else 0.0
                except ValueError:
                    processed_row[clean_key] = clean_val

        data.append(processed_row)

# Save to JSON
with open(json_file, mode='w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)

print(f"Conversion complete! {len(data)} rows saved to '{json_file}'.")

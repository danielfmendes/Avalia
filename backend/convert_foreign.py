import pandas as pd
import json
import re
import os

# Define your directories here
INPUT_DIR = 'excel'
OUTPUT_DIR = 'json'


def clean_number(val):
    if pd.isna(val):
        return 0
    val_str = str(val).strip().replace('.', '')
    val_str = re.sub(r'[^\d]', '', val_str)
    try:
        return int(val_str) if val_str else 0
    except ValueError:
        return 0


def process_pordata_excel(excel_file, json_file, metric_name):
    # Create the full file paths using the directories
    input_path = os.path.join(INPUT_DIR, excel_file)
    output_path = os.path.join(OUTPUT_DIR, json_file)

    if not os.path.exists(input_path):
        print(f"⚠️ Warning: '{input_path}' not found. Skipping...")
        return

    # Ensure the output directory exists before we try to save to it
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    df = pd.read_excel(input_path, header=None)
    data = []
    years = []

    # Dynamically find the row containing the years
    for index, row in df.iterrows():
        if str(row[1]).strip() == 'Anos':
            for col_idx in range(2, len(row)):
                year_val = str(row[col_idx]).strip()
                if year_val.isdigit():
                    years.append(int(year_val))
            break

    if not years:
        print(f"Could not find years in {input_path}. Skipping...")
        return

    # Extract the municipality data
    for index, row in df.iterrows():
        if str(row[0]).strip() == 'Município':
            municipio_name = str(row[1]).strip()

            for i, year in enumerate(years):
                if (2 + i) < len(row):
                    val = clean_number(row[2 + i])
                    data.append({
                        "municipio": municipio_name,
                        "year": year,
                        metric_name: val
                    })

    # Save to the json subfolder
    with open(output_path, mode='w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    print(f"✅ Processed {input_path} -> {output_path} ({len(data)} records)")


# List of your files and the metric names you want to use in the JSON
files_to_process = [
    ("working_foreigners.xlsx", "working-foreigners.json", "foreign_workers"),
    ("tourist_accommodation_capacity.xlsx", "tourist-capacity.json", "tourist_capacity"),
    ("monthly_earnings.xlsx", "monthly-earnings.json", "monthly_earnings"),
    ("completed_constructions.xlsx", "completed-constructions.json", "completed_constructions")
]

for excel, json_out, metric in files_to_process:
    process_pordata_excel(excel, json_out, metric)

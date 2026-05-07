#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
filename="report"

# Verbose flag
QUIET=">/dev/null"
if [[ "${1:-}" == "-v" || "${1:-}" == "--verbose" ]]; then
  QUIET=""
fi

# ---- Clean previous build artefacts ----
rm -f "$filename".{aux,log,bcf,bbl,blg,fdb_latexmk,fls,lof,lot,out,run.xml,synctex.gz,toc,pdf}
rm -f *.aux

# ---- Compile ----
# Pass 1: write .aux + .bcf so biber has something to read.
# Biber:  resolve citations against references.bib and emit .bbl.
# Pass 2: pull in .bbl entries; cross-references still unresolved.
# Pass 3: cross-references stable, final PDF.
eval "lualatex -interaction=nonstopmode -halt-on-error \"$filename.tex\" $QUIET"
biber "$filename"
eval "lualatex -interaction=nonstopmode -halt-on-error \"$filename.tex\" $QUIET"
eval "lualatex -interaction=nonstopmode -halt-on-error \"$filename.tex\" $QUIET"

# ---- Clean up auxiliary files (keep the PDF) ----
rm -f "$filename".{aux,log,bcf,bbl,blg,fdb_latexmk,fls,lof,lot,out,run.xml,synctex.gz,toc}
rm -f *.aux

# ---- Report ----
if [[ -f "$filename.pdf" ]]; then
  size=$(wc -c < "$filename.pdf" | tr -d ' ')
  echo "Built $filename.pdf ($size bytes)"
else
  echo "ERROR: $filename.pdf was not produced." >&2
  exit 1
fi

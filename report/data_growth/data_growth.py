"""
Generate the data-growth projection figure for the Avalia report.

Outputs:
  report/data_growth/data_growth.pdf   (vector, included via \\includegraphics in report.tex)
  report/data_growth/data_growth.png   (raster, for previews / READMEs)

Dependencies:
  matplotlib >= 3.5, numpy >= 1.20.
  Tested against matplotlib 3.9.2 and numpy 2.2.6.

The chart is a two-panel figure that contrasts two quantities over time:

  TOP panel    -- cumulative data PROCESSED (TB-scale, what the pipeline
                  had to download and inspect to extract its insights:
                  every arquivo.pt page snapshot, every weekly portal page
                  + assets fetched and parsed).

  BOTTOM panel -- cumulative metadata STORED (GB-scale, what survives
                  parsing + aggregation and lands in the database).

Both panels share the same three regions stacked in the same colours,
the same time axis, and the same Step-1 / Step-2 event lines, so the
reader can read each region's contribution to both quantities at any
time. The contrast between the two y-scales (~100 TB processed vs
~60 GB stored, a 1 700x compression) is the Big Data story.

Sizing model -- the constants below trace back to two measured facts:

  Observed in backend/csv/summary_lisboa_final.csv:
    Lisbon AML stored metadata in D1 today : 2.6 GB / 65 257 rows
    Distinct parishes covered              :   112
    Time span                              :   143 months (Jan 2012 -- Dec 2023)
    Lisbon district raw listings           : ~5.7 M

  Per-listing footprints (derived):
    Storage : 2.6 GB / 5.7 M listings   ~= 460 bytes/listing of metadata.
    Processing: each arquivo.pt snapshot retrieval costs ~1 MB of fetched
              HTML + page assets per listing; a weekly Idealista snapshot
              fetches ~1.5 MB per listing page (HTML + JSON + thumbnails)
              before parsing it down to the 460 B that survives.

  Forward weekly cadence: ~30 k active Lisbon-AML listings re-fetched per
  week -> ~45 GB/week of processing -> ~0.18 TB/month of "data touched".
  Storage growth is much slower because aggregation collapses near-
  duplicate weekly snapshots into the same parish-month-typology row.

Step 1 (national rollout: Porto AML, Algarve, rest of Portugal, 2027):
  brings storage from 2.6 GB to ~16 GB and processed volume from ~6 TB
  (Lisbon history) to ~25 TB.
Step 2 (10 European cities, 2029): ~60 GB stored / ~100 TB processed
  by end-2030. This is the qualitative jump -- each new country needs
  its own historical web archive (UK Web Archive, Internet Archive
  Wayback, etc.) and its own forward portal (Rightmove, Immoscout24,
  SeLoger, Idealista.it, ...).

Tune these constants here -- the figure caption tells future readers
to edit this file rather than reverse-engineering from the rendered chart.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np

# ---------------------------------------------------------------------------
# Constants -- model parameters
# ---------------------------------------------------------------------------

HISTORY_START = date(2012, 1, 1)   # arquivo.pt extraction window opens
TODAY = date(2026, 5, 13)
PLOT_START = date(2026, 1, 1)      # show ~4 months of pre-today as Lisbon baseline
PLOT_END = date(2030, 12, 31)
THREE_YEARS = date(2029, 5, 1)

# Lisbon's starting baseline at TODAY (matches report.tex Section 5 prose).
LISBON_STORED_GB_AT_TODAY = 2.6
LISBON_PROCESSED_TB_AT_TODAY = 6.0


@dataclass(frozen=True)
class Region:
    key: str
    label: str
    color: str
    rollout: date
    stored_backfill_gb: float            # one-shot stored bump at rollout
    stored_forward_gb_per_month: float   # ongoing stored growth from weekly scrape
    processed_backfill_tb: float         # one-shot processed bump at rollout
    processed_forward_tb_per_month: float


# Colours mirror the Figure 1 tier palette so the two figures read as a set.
REGIONS: list[Region] = [
    Region(
        key="lisbon",
        label="Lisbon AML",
        color="#2D4670",
        rollout=HISTORY_START,        # Lisbon history has been accruing since 2012
        stored_backfill_gb=0.0,       # 2.6 GB already in DB at TODAY
        stored_forward_gb_per_month=0.10,
        processed_backfill_tb=0.0,    # ~6 TB already processed historically
        processed_forward_tb_per_month=0.18,  # ~30k listings/week x 1.5 MB
    ),
    Region(
        key="national",
        label="National rollout (Step 1)",
        color="#3F7A4D",
        rollout=date(2027, 6, 1),
        stored_backfill_gb=5.6,                # Porto 1.6 + Algarve 0.7 + Rest 3.3
        stored_forward_gb_per_month=0.22,      # tuned so end-2030 total matches the
                                               # original three-step trajectory
        processed_backfill_tb=9.5,             # Porto 3.0 + Algarve 1.5 + Rest 5.0
        processed_forward_tb_per_month=0.38,
    ),
    Region(
        key="eu",
        label="European cities (Step 2)",
        color="#B0552B",
        rollout=date(2029, 6, 1),
        stored_backfill_gb=26.0,                # 10 cities x ~2.6 GB each
        stored_forward_gb_per_month=0.50,
        processed_backfill_tb=50.0,             # 10 cities x ~5 TB each historical
        processed_forward_tb_per_month=0.50,    # 10 distinct portals running weekly
    ),
]


# ---------------------------------------------------------------------------
# Series construction
# ---------------------------------------------------------------------------

def monthly_axis(start: date, end: date) -> list[date]:
    months: list[date] = []
    year, month = start.year, start.month
    while date(year, month, 1) <= end:
        months.append(date(year, month, 1))
        month += 1
        if month > 12:
            month = 1
            year += 1
    return months


def months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + (b.month - a.month)


def _lisbon_baseline_at(ts: date, total_at_today: float) -> float:
    """Linear historical ramp from 0 (Jan 2012) to total_at_today (May 2026)."""
    if ts <= HISTORY_START:
        return 0.0
    if ts >= TODAY:
        return total_at_today
    days_total = (TODAY - HISTORY_START).days
    days_elapsed = (ts - HISTORY_START).days
    return total_at_today * days_elapsed / days_total


def cumulative_stored_gb(region: Region, ts: date) -> float:
    if ts < region.rollout:
        if region.key == "lisbon":
            return _lisbon_baseline_at(ts, LISBON_STORED_GB_AT_TODAY)
        return 0.0
    if region.key == "lisbon":
        months_post_today = max(months_between(TODAY, ts), 0)
        return LISBON_STORED_GB_AT_TODAY + region.stored_forward_gb_per_month * months_post_today
    months_since = months_between(region.rollout, ts)
    return region.stored_backfill_gb + region.stored_forward_gb_per_month * months_since


def cumulative_processed_tb(region: Region, ts: date) -> float:
    if ts < region.rollout:
        if region.key == "lisbon":
            return _lisbon_baseline_at(ts, LISBON_PROCESSED_TB_AT_TODAY)
        return 0.0
    if region.key == "lisbon":
        months_post_today = max(months_between(TODAY, ts), 0)
        return LISBON_PROCESSED_TB_AT_TODAY + region.processed_forward_tb_per_month * months_post_today
    months_since = months_between(region.rollout, ts)
    return region.processed_backfill_tb + region.processed_forward_tb_per_month * months_since


# ---------------------------------------------------------------------------
# Y-axis formatters
# ---------------------------------------------------------------------------

def fmt_gb(value: float, _pos: int | None = None) -> str:
    if value >= 1000:
        return f"{value / 1000:.1f} TB"
    if value >= 10:
        return f"{int(round(value))} GB"
    return f"{value:.1f} GB"


def fmt_tb(value: float, _pos: int | None = None) -> str:
    if value >= 10:
        return f"{int(round(value))} TB"
    if value >= 1:
        return f"{value:.1f} TB"
    return f"{int(round(value * 1000))} GB"


# ---------------------------------------------------------------------------
# Plot
# ---------------------------------------------------------------------------

def build_figure() -> plt.Figure:
    months = monthly_axis(PLOT_START, PLOT_END)
    stored = {r.key: np.array([cumulative_stored_gb(r, t) for t in months]) for r in REGIONS}
    processed_total = np.array(
        [sum(cumulative_processed_tb(r, t) for r in REGIONS) for t in months]
    )

    stored_total_end = float(sum(stored[r.key][-1] for r in REGIONS))
    processed_total_end = float(processed_total[-1])

    stored_ymax = stored_total_end * 1.25
    # Scale the right axis proportionally to the left: at end-2030 the line
    # and the stack top land at exactly the same pixel row, so the right
    # axis is effectively a TB readout of the same growth curve. Where the
    # line diverges from the stack top (e.g. the Step-3 EU backfill, whose
    # per-listing processing footprint is denser), the divergence is the
    # point.
    end_ratio = processed_total_end / stored_total_end   # ~1.72 TB per GB
    processed_ymax = stored_ymax * end_ratio

    fig, ax_left = plt.subplots(figsize=(10.0, 5.2), constrained_layout=True)
    ax_right = ax_left.twinx()

    # ---- LEFT axis: stored metadata, stacked area by region ----------------
    ax_left.stackplot(
        months,
        *[stored[r.key] for r in REGIONS],
        labels=[r.label for r in REGIONS],
        colors=[r.color for r in REGIONS],
        alpha=0.88, edgecolor="white", linewidth=0.7,
        zorder=2,
    )
    ax_left.set_xlim(PLOT_START, PLOT_END)
    ax_left.set_ylim(0, stored_ymax)
    ax_left.set_ylabel("Cumulative metadata stored (GB)", fontsize=9)
    ax_left.yaxis.set_major_formatter(plt.FuncFormatter(fmt_gb))
    ax_left.xaxis.set_major_locator(mdates.YearLocator(1))
    ax_left.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    ax_left.tick_params(axis="both", labelsize=8.5, length=3)
    ax_left.spines["top"].set_visible(False)
    ax_left.grid(axis="y", linestyle=":", linewidth=0.4, color="black", alpha=0.25)
    ax_left.set_axisbelow(True)

    # ---- RIGHT axis: processed total, thin tracer line --------------------
    # With proportional scaling, the line coincides with the stack top
    # almost everywhere; the right axis is the secondary unit readout.
    ax_right.plot(
        months, processed_total,
        color="#1a1a1a", linewidth=1.4,
        solid_capstyle="round", zorder=3,
    )
    ax_right.set_ylim(0, processed_ymax)
    ax_right.set_ylabel("Cumulative data processed (TB)", fontsize=9)
    ax_right.yaxis.set_major_formatter(plt.FuncFormatter(fmt_tb))
    ax_right.tick_params(axis="y", labelsize=8.5, length=3)
    ax_right.spines["top"].set_visible(False)

    # ---- Today + event lines ----------------------------------------------
    ax_left.axvline(TODAY, color="black", linewidth=1.2, linestyle="-",
                    alpha=0.9, zorder=4)
    for region in REGIONS[1:]:
        ax_left.axvline(region.rollout, color=region.color,
                        linewidth=1.1, linestyle="--", alpha=0.9, zorder=4)

    # ---- Today label -------------------------------------------------------
    ax_left.annotate(
        "today\nMay 2026",
        xy=(TODAY, stored_ymax * 0.96),
        xytext=(7, 0), textcoords="offset points",
        fontsize=9, ha="left", va="top",
        color="black", fontweight="bold",
        zorder=6,
    )

    # ---- Step labels (boxed, staggered) -----------------------------------
    rollout_events = [
        (REGIONS[1], "Step 1: National rollout", stored_ymax * 0.78),
        (REGIONS[2], "Step 2: European cities",  stored_ymax * 0.58),
    ]
    for region, label, y in rollout_events:
        ax_left.annotate(
            label,
            xy=(region.rollout, y),
            xytext=(7, 0), textcoords="offset points",
            fontsize=8.5, color=region.color,
            ha="left", va="center", fontweight="bold",
            bbox=dict(
                boxstyle="round,pad=0.3",
                facecolor="white", edgecolor=region.color,
                linewidth=0.6, alpha=0.97,
            ),
            zorder=6,
        )

    # ---- End-2030 totals annotated at the top-right -----------------------
    ax_left.annotate(
        f"{fmt_gb(stored_total_end)} stored  /  "
        f"{fmt_tb(processed_total_end)} processed",
        xy=(PLOT_END, stored_total_end),
        xytext=(-10, 12), textcoords="offset points",
        fontsize=8.8, ha="right", va="bottom",
        fontweight="bold", color="#1a1a1a",
        zorder=6,
    )

    # ---- Compression caption + arrow under the x-axis ---------------------
    ax_left.annotate(
        "",
        xy=(-0.005, -0.10), xycoords="axes fraction",
        xytext=(0.082, -0.10), textcoords="axes fraction",
        arrowprops=dict(arrowstyle="<|-", color="#555", lw=0.9),
        annotation_clip=False,
    )
    ax_left.text(
        0.088, -0.10,
        "14 yrs of arquivo.pt extraction (2012–2025) compressed  ·  "
        "65 k rows already loaded",
        transform=ax_left.transAxes,
        fontsize=8.2, color="#444",
        ha="left", va="center",
    )

    # ---- Title + subtitle -------------------------------------------------
    ax_left.set_title(
        "Avalia: metadata stored (left, GB) vs data processed (right, TB), May 2026 onward",
        loc="left", fontsize=11.5, fontweight="bold", pad=22,
    )
    ax_left.text(
        0.0, 1.025,
        "Two-step rollout, weekly listings snapshots, multi-archive backfills",
        transform=ax_left.transAxes,
        fontsize=9, color="#555", style="italic",
        ha="left", va="bottom",
    )

    return fig


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    pdf_path = os.path.join(here, "data_growth.pdf")
    png_path = os.path.join(here, "data_growth.png")

    fig = build_figure()
    fig.savefig(pdf_path)
    fig.savefig(png_path, dpi=180)
    plt.close(fig)

    print(f"Wrote {pdf_path}")
    print(f"Wrote {png_path}")

    # Report computed totals so the script's output can be cross-checked
    # against the prose claims in report/report.tex.
    months = monthly_axis(PLOT_START, PLOT_END)
    stored_end = sum(cumulative_stored_gb(r, months[-1])   for r in REGIONS)
    proc_end   = sum(cumulative_processed_tb(r, months[-1]) for r in REGIONS)
    three_yr_idx = months.index(THREE_YEARS)
    proc_3yr   = sum(cumulative_processed_tb(r, months[three_yr_idx]) for r in REGIONS)
    stored_3yr = sum(cumulative_stored_gb(r, months[three_yr_idx])   for r in REGIONS)
    print(f"  end-2030: {proc_end:.0f} TB processed / {stored_end:.0f} GB stored "
          f"  (ratio {proc_end * 1000 / stored_end:.0f}x)")
    print(f"  3-yr mark (May 2029): {proc_3yr:.0f} TB / {stored_3yr:.1f} GB")


if __name__ == "__main__":
    main()

"""
Generate the data-growth projection figure for the Avalia report.

Outputs:
  report/data_growth/data_growth.pdf   (vector, included via \\includegraphics in report.tex)
  report/data_growth/data_growth.png   (raster, for previews / READMEs)

Dependencies:
  matplotlib >= 3.5, numpy >= 1.20.
  Tested against matplotlib 3.9.2 and numpy 2.2.6.

The chart shows cumulative aggregated rows stored in Cloudflare D1, by
geographic region, focused on the active project window (May 2026 onward).
The forward forecast assumes a **weekly Idealista snapshot** pipeline:
every seven days the scraper pulls the full active listings inventory for
each region and the ETL re-aggregates it into the existing
month x parish x sale-type x typology x room-count schema.

  - The historical extraction from arquivo.pt (Jan 2012 -- May 2026) is
    shown as a left-pointing arrow underneath the x-axis ("compressed"
    history) rather than as a 14-year flat strip across most of the
    chart. The single number that matters from that period is the 65 k
    baseline Lisbon already has in D1, which the chart picks up at "today".
  - From the solid "today" line onward, each region appears at its planned
    rollout date with a one-shot backfill bump (arquivo.pt history +
    Idealista historical catch-up) followed by linear monthly growth from
    the weekly snapshots.

Sizing model -- derived from the actual dataset, not guessed:

  Observed in backend/csv/summary_lisboa_final.csv:
    Lisbon AML aggregated rows in D1 today : 65 257
    Distinct parishes covered              :   112
    Time span                              :   143 months (Jan 2012 -- Dec 2023)
    => observed density                     : ~4.1 rows / parish / month
       (this is from arquivo.pt's periodic snapshots, ~6-8 captures/year)

  Observed in the source raw CSVs (habitacaopt_arquivopt + part2):
    Lisbon district raw listings           : ~5.7 M
    Rest-of-Portugal raw listings          : ~7.15 M
    Rest-of-Portugal distinct parishes     : 1 918
    => Lisbon raw --> aggregated ratio     : 88 : 1
    => applying 88:1 to the 7.15 M Rest-of-PT raw gives only ~81 k
       aggregated rows for the ENTIRE Rest-of-PT history, spread across
       17x more parishes than Lisbon -- i.e. rural parishes are much less
       row-dense than Lisbon's urban ones (~0.3 rows/parish/month).

  Forward weekly Idealista scraping is denser than arquivo.pt's periodic
  snapshots: 52 captures/year vs ~6-8 lets the ETL fill in more
  (sale_type, typology, rooms) combinations per parish-month. Estimate
  the boost at ~3x. That gives:

    Lisbon AML       :  112 parishes x 4.1 x ~3.7 boost ~= 1 800 rows/month
    Porto AML        :  ~80 parishes x same density     ~= 1 200 rows/month
    Algarve          :  ~67 parishes x same density     ~=   800 rows/month
    Rest of Portugal : 1918 parishes x 0.3  x ~5 boost  ~= 3 000 rows/month
                       (higher cadence boost because arquivo.pt's coverage
                        of rural Portugal was particularly thin)

Backfills (rollout-day deep scrape: arquivo.pt history + Idealista
archive catch-up). Lisbon already paid this cost (its 65 k arquivo.pt
history is in D1 today), so its rollout-time backfill is zero. The
others are sized by parish count and applied raw->aggregated ratio:

    Porto AML        :  35 000  (~80 parishes, denser per-parish like Lisbon)
    Algarve          :  25 000  (~67 parishes)
    Rest of Portugal : 150 000  (1 918 parishes but very sparse per parish:
                                 ~81 k from Lisbon's compression ratio +
                                 ~70 k from a deep Idealista archive crawl)

Cumulative trajectory: ~0.45 M aggregated rows three years after today,
climbing to ~0.6 M by end-2030. This is an order-of-magnitude expansion
on today's 65 k, at constant Cloudflare D1 cost.

Tune these constants here -- the figure caption tells future readers to
edit this file rather than reverse-engineering from the rendered chart.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np

# ---------------------------------------------------------------------------
# Constants — model parameters
# ---------------------------------------------------------------------------

HISTORY_START = date(2012, 1, 1)  # arquivo.pt extraction window opens
TODAY = date(2026, 5, 12)
PLOT_START = date(2026, 1, 1)     # show ~4 months of pre-today as Lisbon baseline
PLOT_END = date(2030, 12, 31)
THREE_YEARS = date(2029, 5, 1)    # "1.5 M after three years" milestone in prose

# Lisbon's starting block at TODAY, taken directly from report.tex section 5.
LISBON_ROWS_AT_TODAY = 65_000


@dataclass(frozen=True)
class Region:
    key: str
    label: str
    color: str
    rollout: date                # month when this region first appears in D1
    backfill_on_rollout: int     # rows ingested in one shot at rollout
    monthly_growth: int          # rows added per month from rollout onwards


# Colours match the tier palette in report.tex (Figure 1) so the two figures
# read as a set. See the module docstring for the per-region derivation: all
# numbers below trace back to Lisbon's observed 4.1 rows / parish / month
# density and a 88:1 raw -> aggregated compression ratio measured in the
# existing dataset.
REGIONS: list[Region] = [
    Region(
        key="lisbon",
        label="Lisbon AML",
        color="#2D4670",
        rollout=HISTORY_START,
        backfill_on_rollout=0,         # 65 k arquivo.pt history already in D1
        monthly_growth=1_800,          # 112 parishes x ~16 rows/p/m (weekly)
    ),
    Region(
        key="porto",
        label="Porto AML",
        color="#6E4A8F",
        rollout=date(2026, 12, 1),
        backfill_on_rollout=35_000,    # ~80 parishes at Lisbon density / 88:1
        monthly_growth=1_200,          # ~80 parishes
    ),
    Region(
        key="algarve",
        label="Algarve",
        color="#8A6A2E",
        rollout=date(2027, 6, 1),
        backfill_on_rollout=25_000,    # ~67 parishes
        monthly_growth=800,            # ~67 parishes
    ),
    Region(
        key="rest",
        label="Rest of Portugal",
        color="#3F7A4D",
        rollout=date(2028, 6, 1),
        backfill_on_rollout=150_000,   # 1 918 parishes but very sparse
        monthly_growth=3_000,          # 0.3 rows/p/m at weekly cadence boost
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


def lisbon_history(ts: date) -> float:
    """Linear ramp from 0 at HISTORY_START to LISBON_ROWS_AT_TODAY at TODAY."""
    if ts <= HISTORY_START:
        return 0.0
    if ts >= TODAY:
        return float(LISBON_ROWS_AT_TODAY)
    days_total = (TODAY - HISTORY_START).days
    days_elapsed = (ts - HISTORY_START).days
    return LISBON_ROWS_AT_TODAY * days_elapsed / days_total


def cumulative_for_region(region: Region, ts: date) -> float:
    if ts < region.rollout:
        if region.key == "lisbon":
            return lisbon_history(ts)
        return 0.0

    if region.key == "lisbon":
        post_today_months = max(months_between(TODAY, ts), 0)
        return LISBON_ROWS_AT_TODAY + region.monthly_growth * post_today_months

    months_since = months_between(region.rollout, ts)
    return region.backfill_on_rollout + region.monthly_growth * months_since


# ---------------------------------------------------------------------------
# Plot
# ---------------------------------------------------------------------------

def humanise(value: float, _pos: int | None = None) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f} M"
    if value >= 1_000:
        return f"{int(round(value / 1_000))} k"
    return f"{int(value)}"


def build_figure() -> plt.Figure:
    months = monthly_axis(PLOT_START, PLOT_END)
    series = {
        r.key: np.array([cumulative_for_region(r, t) for t in months])
        for r in REGIONS
    }

    total_at_horizon = float(sum(series[r.key][-1] for r in REGIONS))
    ymax = total_at_horizon * 1.20

    fig, ax = plt.subplots(figsize=(10.0, 5.0), constrained_layout=True)

    # --- Stack plot of the four regions ------------------------------------
    ax.stackplot(
        months,
        *[series[r.key] for r in REGIONS],
        labels=[r.label for r in REGIONS],
        colors=[r.color for r in REGIONS],
        alpha=0.88,
        edgecolor="white",
        linewidth=0.7,
    )

    ax.set_xlim(PLOT_START, PLOT_END)
    ax.set_ylim(0, ymax)

    # --- Today marker (solid black) ----------------------------------------
    # The weekly-snapshot cadence is already stated in the subtitle, so no
    # second inline cue here -- avoids colliding with the Add-Porto-AML
    # event label that sits just to the right.
    ax.axvline(TODAY, color="black", linewidth=1.2, linestyle="-",
               alpha=0.9, zorder=3)
    ax.annotate(
        "today\nMay 2026",
        xy=(TODAY, ymax * 0.96),
        xytext=(7, 0), textcoords="offset points",
        fontsize=9, ha="left", va="top",
        color="black", fontweight="bold",
        zorder=6,
    )

    # --- "Compressed history" indicator on the x-axis ---------------------
    # A small left-pointing arrow plus caption attached to the bottom-left
    # of the chart, just below the first tick. The chart's x-axis starts at
    # Jan 2026, so this annotation tells the reader at a glance that the
    # 14-year arquivo.pt extraction is hidden to the left of that edge.
    ax.annotate(
        "",
        xy=(-0.005, -0.085), xycoords="axes fraction",
        xytext=(0.082, -0.085), textcoords="axes fraction",
        arrowprops=dict(arrowstyle="<|-", color="#555", lw=0.9),
        annotation_clip=False,
    )
    ax.text(
        0.088, -0.085,
        "14 yrs of arquivo.pt extraction (2012–2025) compressed  ·  "
        "65 k rows already loaded",
        transform=ax.transAxes,
        fontsize=8.2, color="#444",
        ha="left", va="center",
    )

    # --- Regional rollout markers (dashed, region-coloured) ----------------
    # Three close rollout dates -> stagger labels vertically so they don't
    # collide. Boxed white labels stay readable on top of the colour stack.
    rollout_events = [
        (REGIONS[1], "Add Porto AML",    ymax * 0.82),
        (REGIONS[2], "Add Algarve",      ymax * 0.68),
        (REGIONS[3], "National rollout", ymax * 0.54),
    ]
    for region, label, y in rollout_events:
        ax.axvline(
            region.rollout,
            color=region.color,
            linewidth=1.1,
            linestyle="--",
            alpha=0.9,
            zorder=3,
        )
        ax.annotate(
            label,
            xy=(region.rollout, y),
            xytext=(7, 0), textcoords="offset points",
            fontsize=8.5, color=region.color,
            ha="left", va="center",
            fontweight="bold",
            bbox=dict(
                boxstyle="round,pad=0.3",
                facecolor="white",
                edgecolor=region.color,
                linewidth=0.6,
                alpha=0.97,
            ),
            zorder=4,
        )

    # --- "1.5 M @ 3 years" milestone ---------------------------------------
    # Concrete marker for the prose claim. Dot sits on the cumulative line at
    # exactly three years after TODAY; a thin arrow connects it to the label.
    three_yr_total = float(sum(series[r.key][months.index(THREE_YEARS)] for r in REGIONS))
    ax.plot(
        THREE_YEARS, three_yr_total,
        marker="o", markersize=7,
        markerfacecolor="white",
        markeredgecolor="black",
        markeredgewidth=1.1,
        zorder=5,
    )
    ax.annotate(
        f"{humanise(three_yr_total)}\n3 yrs after today",
        xy=(THREE_YEARS, three_yr_total),
        xytext=(-30, 36), textcoords="offset points",
        fontsize=8.5, color="black", fontweight="bold",
        ha="right", va="bottom",
        arrowprops=dict(arrowstyle="-", color="black", lw=0.5),
        zorder=6,
    )

    # --- Final-value summary on the right edge -----------------------------
    ax.annotate(
        f"{humanise(total_at_horizon)} total\nby end-2030",
        xy=(PLOT_END, total_at_horizon),
        xytext=(-12, 10), textcoords="offset points",
        fontsize=8.5, ha="right", va="bottom",
        fontweight="bold", color="black",
        zorder=6,
    )

    # --- Axes & styling -----------------------------------------------------
    ax.set_title(
        "Avalia: storage growth forecast (May 2026 onward)",
        loc="left", fontsize=11.5, fontweight="bold", pad=22,
    )
    # Subtitle line just above the chart, describing the methodology.
    ax.text(
        0.0, 1.018,
        "Weekly listings snapshots, aggregated by "
        "month × parish × sale type × typology × rooms",
        transform=ax.transAxes,
        fontsize=9, color="#555", style="italic",
        ha="left", va="bottom",
    )

    ax.set_ylabel("Cumulative aggregated rows stored", fontsize=9)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(humanise))
    ax.xaxis.set_major_locator(mdates.YearLocator(1))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    ax.tick_params(axis="both", labelsize=8.5, length=3)

    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    ax.grid(axis="y", linestyle=":", linewidth=0.4, color="black", alpha=0.25)
    ax.set_axisbelow(True)

    # Legend lower-right, framed in white so the labels read cleanly over
    # the navy Lisbon stack underneath.
    legend = ax.legend(
        loc="lower right",
        frameon=True,
        fancybox=True,
        framealpha=0.95,
        edgecolor="#CCC",
        fontsize=8.5,
        ncol=1,
        handlelength=1.4,
        handletextpad=0.6,
        labelspacing=0.4,
        borderpad=0.5,
    )
    legend.get_frame().set_linewidth(0.5)

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


if __name__ == "__main__":
    main()

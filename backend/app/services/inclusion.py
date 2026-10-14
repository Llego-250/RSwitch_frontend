"""Financial inclusion analytics (SRS §5.10, §14.4).

Every figure is aggregated from submissions participant institutions sent to
RSwitch (REQ-FIN-001) — never customer-level records (§2.7): files are only
ever summed, and nothing below a segment of institution type × region leaves
this module. Metrics are data, not code: each entry in REGISTRY says which
submitted columns feed it and how they aggregate, so a metric RSwitch
confirms later (REQ-FIN-007, §24.5) is one more entry. A metric whose data
hasn't been received is reported as unavailable, never estimated."""

import io
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime
from functools import lru_cache
from typing import Optional

import pandas as pd
from fpdf import FPDF
from sqlmodel import Session, select

from app.models.enums import REGIONS, InstitutionType, SubmissionResult
from app.models.participant import Participant
from app.models.submission import Submission
from app.services.ingestion import read_rows
from app.storage import get_file

log = logging.getLogger(__name__)

INDICATIVE_LABEL = "Indicative — metrics to be confirmed with RSwitch"
INDICATIVE_NOTE = (
    "REQ-FIN-007: metrics and visualisations are indicative until RSwitch confirms data availability with "
    "participating institutions (SRS §24.5)."
)
NOT_AVAILABLE = "Not available — awaiting data"
INSTITUTION_TYPES = [t.value for t in InstitutionType]
ALL_TYPES, ALL_REGIONS = "All institution types", "All regions"
UNSPECIFIED = "Unspecified"
# A column with one of these names splits a return by region (REQ-FIN-003).
REGION_COLUMNS = ("region", "province")
ROWS = "@rows"  # pseudo-column: number of rows in the file


@dataclass(frozen=True)
class Source:
    column: str  # numeric column summed from the submission (ROWS = row count)
    label: str  # data source shown next to the metric (REQ-FIN-006)
    requires_column: str = ""  # only files that also carry this column


@dataclass(frozen=True)
class Metric:
    key: str
    label: str
    unit: str
    description: str
    # stock: point-in-time (latest reported period per institution);
    # flow: summed over periods; ratio: numerator ÷ denominator metrics.
    kind: str
    sources: tuple[Source, ...] = ()
    numerator: str = ""
    denominator: str = ""
    scale: float = 1.0
    # Data RDIP doesn't receive yet; the metric stays unavailable until it does.
    awaiting: str = ""


RETURN = "Aggregate inclusion returns submitted by institutions"
FILES = "Transaction-level submission files"
REGISTRY: list[Metric] = [
    Metric("accounts", "Number of accounts", "accounts", "Open accounts / wallets reported by institutions, as at the "
           "latest reported period.", "stock",
           (Source("accounts", RETURN), Source("accounts_total", RETURN), Source("number_of_accounts", RETURN))),
    Metric("active_users", "Active users", "users", "Customers with at least one transaction in the period, as at the "
           "latest reported period.", "stock",
           (Source("active_users", RETURN), Source("active_accounts", RETURN))),
    # The pipeline's Load step stores the transactions a file represents as
    # row_count (one per row, or the transaction_count column of a summary).
    Metric("transaction_count", "Transaction volume (count)", "transactions", "Number of transactions in the period.",
           "flow",
           (Source(ROWS, RETURN, requires_column="transaction_value"),
            Source(ROWS, f"{FILES} (transactions loaded)", requires_column="amount"))),
    Metric("transaction_value", "Transaction volume (value)", "RWF", "Value of transactions in the period.", "flow",
           (Source("transaction_value", RETURN), Source("amount", f"{FILES} (sum of amount)"))),
    Metric("activity_rate", "Active users per account", "%", "Active users ÷ number of accounts.", "ratio",
           numerator="active_users", denominator="accounts", scale=100),
    Metric("avg_transaction_value", "Average transaction value", "RWF", "Transaction value ÷ transaction count.",
           "ratio", numerator="transaction_value", denominator="transaction_count"),
    Metric("access_rate", "Access rate (adults with an account)", "%", "Accounts ÷ adult population of the region.",
           "ratio", numerator="accounts", denominator="adult_population", scale=100,
           awaiting="Adult population by region (e.g. NISR census data) has not been supplied to RDIP."),
]
METRICS = {m.key: m for m in REGISTRY}


def registry() -> list[dict]:
    return [
        {**{k: v for k, v in asdict(m).items() if k != "sources"},
         "sources": [{"column": s.column, "label": s.label, "requires_column": s.requires_column} for s in m.sources]}
        for m in REGISTRY
    ]


# ---- submitted facts ----------------------------------------------------------------

@dataclass
class Fact:
    """One submission's totals for one region — the finest grain used."""
    participant_id: int
    institution_type: str
    region: str
    region_basis: str  # reported (column in the return) | registered (institution's region)
    period: str  # YYYY-MM
    submission_id: int
    uploaded_at: datetime
    values: dict[str, float] = field(default_factory=dict)
    columns: frozenset = frozenset()


def period_of(s: Submission) -> str:
    for fmt in ("%B %Y", "%Y-%m", "%b %Y"):
        try:
            return datetime.strptime((s.period or "").strip(), fmt).strftime("%Y-%m")
        except ValueError:
            continue
    return s.uploaded_at.strftime("%Y-%m")


def period_label(key: str) -> str:
    return datetime.strptime(key, "%Y-%m").strftime("%b %Y")


@lru_cache(maxsize=4096)
def _region_split(storage_key: str, filename: str, totals: tuple, row_count: int) -> Optional[tuple]:
    """Per-region sums of a stored return's numeric columns (files are
    immutable once stored, so this is cached). Used only when the split adds
    up exactly to the aggregates the pipeline loaded — if a field mapping
    renamed the columns it won't, and the caller falls back."""
    table = read_rows(filename, get_file(storage_key))
    weight = "transaction_count" if "transaction_count" in table.columns else None
    per: dict[str, dict[str, float]] = {}
    for row in table.rows:
        region = next((str(row[c]).strip() for c in REGION_COLUMNS if str(row.get(c, "")).strip()), UNSPECIFIED)
        acc = per.setdefault(region, {ROWS: 0.0})
        acc[ROWS] += float(row.get(weight) or 0) if weight else 1
        for key, _ in totals:
            acc[key] = acc.get(key, 0.0) + float(str(row.get(key) or 0).replace(",", ""))
    for key, expected in (*totals, (ROWS, row_count)):
        if abs(sum(v.get(key, 0.0) for v in per.values()) - expected) > max(0.5, abs(expected) * 1e-6):
            return None
    return tuple((r, tuple(sorted(v.items()))) for r, v in per.items())


def _facts(session: Session) -> tuple[list[Fact], dict[int, Participant]]:
    participants = {p.id: p for p in session.exec(select(Participant)).all()}
    subs = session.exec(select(Submission).where(Submission.result == SubmissionResult.passed)).all()
    facts: list[Fact] = []
    for s in subs:
        # Data Compliance rejected is wrong data — never report it.
        if s.review_status == "Rejected" or s.status == "Rejected":
            continue
        p = participants.get(s.participant_id)
        if p is None or not (s.numeric_totals or s.row_count):
            continue  # not loaded by the pipeline yet
        totals = {k: float(v) for k, v in (s.numeric_totals or {}).items()}
        columns = frozenset(totals)
        base = dict(participant_id=p.id, institution_type=p.type or UNSPECIFIED, period=period_of(s),
                    submission_id=s.id, uploaded_at=s.uploaded_at, columns=columns)
        if any(c in (s.breakdowns or {}) for c in REGION_COLUMNS):
            try:
                split = _region_split(s.storage_key, s.filename, tuple(sorted(totals.items())), s.row_count)
            except Exception as exc:  # unreadable file: fall back to the institution's region
                log.warning("Could not split SUB-%s by region: %s", s.id, exc)
                split = None
            if split:
                for region, values in split:
                    facts.append(Fact(region=region, region_basis="reported", values=dict(values), **base))
                continue
        facts.append(Fact(region=p.region or UNSPECIFIED, region_basis="registered",
                          values={**totals, ROWS: float(s.row_count)}, **base))
    return facts, participants


# ---- aggregation --------------------------------------------------------------------

@dataclass
class Cell:
    value: Optional[float]
    last_updated: Optional[datetime] = None
    sources: dict[str, set] = field(default_factory=dict)  # source label → institution ids
    submissions: set = field(default_factory=set)

    @property
    def available(self) -> bool:
        return self.value is not None


def _reports(src: Source, f: Fact) -> bool:
    has = src.column in f.values if src.column == ROWS else src.column in f.columns
    return has and (not src.requires_column or src.requires_column in f.columns)


def _source_choice(metric: Metric, facts: list[Fact]) -> dict[int, Source]:
    """Per institution, the first source in the metric's priority order that
    it actually reports — so one institution is never counted from two
    different feeds."""
    choice: dict[int, Source] = {}
    for src in metric.sources:
        for f in facts:
            if f.participant_id not in choice and _reports(src, f):
                choice[f.participant_id] = src
    return choice


def _base_cell(metric: Metric, facts: list[Fact], choice: dict[int, Source]) -> Cell:
    points = [(f, choice[f.participant_id]) for f in facts
              if f.participant_id in choice and _reports(choice[f.participant_id], f)]
    if not points:
        return Cell(None)
    if metric.kind == "stock":
        latest: dict[int, str] = {}
        for f, _ in points:
            latest[f.participant_id] = max(latest.get(f.participant_id, ""), f.period)
        points = [(f, s) for f, s in points if f.period == latest[f.participant_id]]
    cell = Cell(sum(f.values.get(s.column, 0.0) for f, s in points))
    for f, s in points:
        cell.sources.setdefault(s.label, set()).add(f.participant_id)
        cell.submissions.add(f.submission_id)
        cell.last_updated = max(filter(None, [cell.last_updated, f.uploaded_at]))
    return cell


def _cells(facts: list[Fact], choices: dict[str, dict[int, Source]]) -> dict[str, Cell]:
    out: dict[str, Cell] = {}
    for m in REGISTRY:
        if m.kind != "ratio":
            out[m.key] = _base_cell(m, facts, choices[m.key])
    for m in REGISTRY:
        if m.kind != "ratio":
            continue
        num, den = out.get(m.numerator), out.get(m.denominator)
        if m.awaiting or not (num and den and num.available and den.available and den.value):
            out[m.key] = Cell(None)
            continue
        out[m.key] = Cell(num.value / den.value * m.scale, max(num.last_updated, den.last_updated),
                          {k: num.sources.get(k, set()) | den.sources.get(k, set()) for k in {*num.sources, *den.sources}},
                          num.submissions | den.submissions)
    return out


def _source_text(metric: Metric, cell: Cell) -> str:
    if metric.awaiting:
        return metric.awaiting
    if not cell.available:
        wanted = ", ".join(f"'{s.column}'" for s in metric.sources if s.column != ROWS) if metric.sources else (
            f"{METRICS[metric.numerator].label} and {METRICS[metric.denominator].label}")
        return f"No submitted data yet — needs {wanted} in a participant return."
    parts = [f"{label} ({len(ids)} institution{'s' if len(ids) != 1 else ''})" for label, ids in sorted(cell.sources.items())]
    return "; ".join(parts) + f" — {len(cell.submissions)} submission{'s' if len(cell.submissions) != 1 else ''}"


def _round(metric: Metric, value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    return round(value, 1) if metric.unit == "%" or metric.kind == "ratio" else round(value, 0)


def _values(cells: dict[str, Cell]) -> dict[str, Optional[float]]:
    return {k: _round(METRICS[k], c.value) for k, c in cells.items()}


class FilterError(ValueError):
    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field
        self.message = message


def _check_period(value: Optional[str], name: str) -> Optional[str]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m").strftime("%Y-%m")
    except ValueError:
        raise FilterError(name, "Must be a month in YYYY-MM form")


def dashboard(
    session: Session,
    institution_type: Optional[str] = None,
    region: Optional[str] = None,
    period_from: Optional[str] = None,
    period_to: Optional[str] = None,
) -> dict:
    """REQ-FIN-001..006: metrics for the filters, segmented by institution
    type and region, with source and last-updated date on every metric."""
    period_from, period_to = _check_period(period_from, "period_from"), _check_period(period_to, "period_to")
    if period_from and period_to and period_from > period_to:
        raise FilterError("period_from", "The start period must not be after the end period")
    if institution_type and institution_type not in INSTITUTION_TYPES:
        raise FilterError("institution_type", f"Must be one of: {', '.join(INSTITUTION_TYPES)}")
    if region and region not in REGIONS + [UNSPECIFIED]:
        raise FilterError("region", f"Must be one of: {', '.join(REGIONS)}")

    all_facts, participants = _facts(session)
    facts = [
        f for f in all_facts
        if (not institution_type or f.institution_type == institution_type)
        and (not region or f.region == region)
        and (not period_from or f.period >= period_from)
        and (not period_to or f.period <= period_to)
    ]
    # Source choice is made per institution over everything it reports in
    # the selection, then reused for every segment.
    choices = {m.key: _source_choice(m, facts) for m in REGISTRY if m.kind != "ratio"}
    totals = _cells(facts, choices)

    def used(cells: dict[str, Cell], pool: list[Fact]) -> list[Fact]:
        """The facts that actually fed a metric (not, e.g., a transaction
        file of an institution whose return was used instead)."""
        ids = set().union(*(c.submissions for c in cells.values()))
        return [f for f in pool if f.submission_id in ids]

    def segment(predicate) -> tuple[dict[str, Cell], list[Fact]]:
        sub = [f for f in facts if predicate(f)]
        cells = _cells(sub, choices)
        return cells, used(cells, sub)

    def basis(pool: list[Fact]) -> str:
        bases = {f.region_basis for f in pool}
        return "mixed" if len(bases) > 1 else (bases.pop() if bases else "")

    metrics = []
    for m in REGISTRY:
        c = totals[m.key]
        metrics.append({
            "key": m.key, "label": m.label, "unit": m.unit, "kind": m.kind, "description": m.description,
            "value": _round(m, c.value), "available": c.available,
            "status": "" if c.available else NOT_AVAILABLE,
            "data_source": _source_text(m, c),
            "last_updated": c.last_updated,
            "institutions": len(set().union(*c.sources.values())) if c.sources else 0,
        })

    by_type, type_cells = [], []
    for t in INSTITUTION_TYPES + sorted({f.institution_type for f in facts} - set(INSTITUTION_TYPES)):
        cells, fed = segment(lambda f, t=t: f.institution_type == t)
        by_type.append({"institution_type": t,
                        "institutions": sum(1 for p in participants.values() if p.type == t),
                        "reporting": len({f.participant_id for f in fed}), "values": _values(cells),
                        "last_updated": max((f.uploaded_at for f in fed), default=None)})
        if fed:
            type_cells.append((t, cells))

    by_region, region_cells = [], []
    for r in REGIONS + sorted({f.region for f in facts} - set(REGIONS)):
        cells, fed = segment(lambda f, r=r: f.region == r)
        by_region.append({"region": r, "reporting": len({f.participant_id for f in fed}), "values": _values(cells),
                          "region_basis": basis(fed), "last_updated": max((f.uploaded_at for f in fed), default=None)})
        if fed:
            region_cells.append((r, cells))

    matrix = []
    for t in sorted({f.institution_type for f in facts}):
        for r in sorted({f.region for f in facts if f.institution_type == t}):
            cells, fed = segment(lambda f, t=t, r=r: f.institution_type == t and f.region == r)
            if fed:
                matrix.append({"institution_type": t, "region": r, "values": _values(cells),
                               "cells": cells, "last_updated": max(f.uploaded_at for f in fed)})

    trend = []
    for p in sorted({f.period for f in facts}):
        cells, fed = segment(lambda f, p=p: f.period == p)
        if fed:
            trend.append({"period": p, "label": period_label(p), "values": _values(cells)})

    fed_all = used(totals, facts)
    # Filter options: every period any metric has data for, whatever the filters.
    unfiltered = _cells(all_facts, {m.key: _source_choice(m, all_facts) for m in REGISTRY if m.kind != "ratio"})
    return {
        "indicative": True,
        "indicative_label": INDICATIVE_LABEL,
        "indicative_note": INDICATIVE_NOTE,
        "not_available_label": NOT_AVAILABLE,
        "generated_at": datetime.utcnow(),
        "filters": {"institution_type": institution_type, "region": region, "period_from": period_from, "period_to": period_to},
        "options": {"institution_types": INSTITUTION_TYPES, "regions": REGIONS,
                    "periods": sorted({f.period for f in used(unfiltered, all_facts)})},
        "coverage": {
            "institutions_registered": sum(1 for p in participants.values()
                                           if not institution_type or p.type == institution_type),
            "institutions_reporting": len({f.participant_id for f in fed_all}),
            "submissions": len({f.submission_id for f in fed_all}),
            "periods": sorted({f.period for f in fed_all}),
            "last_updated": max((f.uploaded_at for f in fed_all), default=None),
        },
        "region_basis_note": _region_note({f.region_basis for f in fed_all}),
        "metrics": metrics,
        "by_institution_type": by_type,
        "by_region": by_region,
        "matrix": [{k: v for k, v in row.items() if k != "cells"} for row in matrix],
        "trend": trend,
        # internal: per-segment provenance for exports
        "_totals": totals,
        "_type_cells": type_cells,
        "_region_cells": region_cells,
        "_matrix_cells": matrix,
    }


def _region_note(bases: set) -> str:
    if bases == {"reported"}:
        return "Regions come from the region column of the institutions' returns."
    if bases == {"registered"}:
        return ("No return in this selection carries a region breakdown, so figures are attributed to each "
                "institution's registered region — this is not customer demographic data.")
    if bases:
        return ("Regions come from the returns' region column where present; otherwise from the institution's "
                "registered region (not customer demographic data).")
    return ""


def public(dash: dict) -> dict:
    return {k: v for k, v in dash.items() if not k.startswith("_")}


# ---- §14.4 report -------------------------------------------------------------------

REPORT_COLUMNS = ["Institution type", "Region", "Metric", "Value", "Data source", "Last updated"]


def report_rows(
    session: Session,
    institution_type: Optional[str] = None,
    region: Optional[str] = None,
    period_from: Optional[str] = None,
    period_to: Optional[str] = None,
) -> tuple[list[dict], list[str], dict]:
    """§14.4 Financial Inclusion Report: institution type, region, metric
    name, value, data source, last updated — overall, per type, per region
    and per type × region."""
    dash = dashboard(session, institution_type, region, period_from, period_to)
    rows: list[dict] = []

    def add(t: str, r: str, cells: dict[str, Cell], include_unavailable: bool = False) -> None:
        for m in REGISTRY:
            c = cells[m.key]
            if not c.available and not include_unavailable:
                continue
            rows.append({
                "Institution type": t, "Region": r, "Metric": _metric_name(m),
                "Value": _round(m, c.value) if c.available else NOT_AVAILABLE,
                "Data source": _source_text(m, c),
                "Last updated": c.last_updated.strftime("%Y-%m-%d") if c.last_updated else "",
            })

    add(institution_type or ALL_TYPES, region or ALL_REGIONS, dash["_totals"], include_unavailable=True)
    for t, cells in dash["_type_cells"]:
        add(t, region or ALL_REGIONS, cells)
    for r, cells in dash["_region_cells"]:
        add(institution_type or ALL_TYPES, r, cells)
    for row in dash["_matrix_cells"]:
        add(row["institution_type"], row["region"], row["cells"])
    return rows, REPORT_COLUMNS, dash


def _metric_name(m: Metric) -> str:
    """Label with its unit when the unit isn't obvious from the label."""
    if m.unit not in ("RWF", "%"):
        return m.label
    return f"{m.label[:-1]}, {m.unit})" if m.label.endswith(")") else f"{m.label} ({m.unit})"


def _latin1(text: str) -> str:
    for a, b in (("—", "-"), ("–", "-"), ("≥", ">="), ("≤", "<="), ("→", "->"), ("÷", "/"), ("’", "'")):
        text = text.replace(a, b)
    return text.encode("latin-1", "replace").decode("latin-1")


def _filters_text(filters: dict) -> str:
    period = (f"{period_label(filters['period_from']) if filters['period_from'] else 'earliest'} to "
              f"{period_label(filters['period_to']) if filters['period_to'] else 'latest'}")
    return (f"Institution type: {filters['institution_type'] or 'All'} | Region: {filters['region'] or 'All'} | "
            f"Period: {period}")


def render(rows: list[dict], columns: list[str], dash: dict, fmt: str, generated_by: str) -> bytes:
    generated = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    if fmt == "xlsx":
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as xl:
            pd.DataFrame(rows, columns=columns).to_excel(xl, sheet_name="Financial inclusion", index=False)
            about = [
                ("Report", "Financial Inclusion Report (SRS §14.4)"),
                ("Status", INDICATIVE_LABEL),
                ("Note", INDICATIVE_NOTE),
                ("Filters", _filters_text(dash["filters"])),
                ("Regions", dash["region_basis_note"]),
                ("Generated", f"{generated} by {generated_by}"),
                ("Privacy", "Aggregated institution-level data only; no customer-level records (SRS §2.7)."),
            ]
            pd.DataFrame(about, columns=["Item", "Detail"]).to_excel(xl, sheet_name="About", index=False)
            pd.DataFrame([
                {"Metric": m.label, "Unit": m.unit, "Aggregation": m.kind, "Definition": m.description,
                 "Source columns": ", ".join(s.column for s in m.sources) or f"{m.numerator} / {m.denominator}",
                 "Awaiting": m.awaiting}
                for m in REGISTRY
            ]).to_excel(xl, sheet_name="Metric definitions", index=False)
        return buffer.getvalue()

    pdf = FPDF(orientation="L", format="A4")
    pdf.set_auto_page_break(True, margin=12)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, "Financial Inclusion Report", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(160, 90, 0)
    pdf.cell(0, 5, _latin1(INDICATIVE_LABEL), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", size=8)
    for line in (_filters_text(dash["filters"]), dash["region_basis_note"],
                 f"Generated {generated} by {generated_by}. Aggregated institution-level data only (SRS §2.7)."):
        if line:
            pdf.multi_cell(0, 4, _latin1(line), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    widths = (34, 32, 52, 34, 100, 25)
    with pdf.table(col_widths=widths, text_align="LEFT", line_height=4.5, first_row_as_headings=True) as table:
        header = table.row()
        for c in columns:
            header.cell(c)
        for r in rows:
            row = table.row()
            for c in columns:
                v = r[c]
                row.cell(_latin1(f"{v:,.1f}" if isinstance(v, float) and v % 1 else f"{v:,.0f}" if isinstance(v, float) else str(v)))
    return bytes(pdf.output())


def summary(session: Session, months: int = 6) -> dict:
    """Compatibility for GET /reports/inclusion: the dashboard for the last
    `months` reported periods."""
    periods = dashboard(session)["options"]["periods"]
    return public(dashboard(session, period_from=periods[-months] if len(periods) >= months else None))

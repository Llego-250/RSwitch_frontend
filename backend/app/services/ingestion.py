"""Structure-agnostic ingestion: one shared validation engine driven entirely by
TemplateColumn rows. Adding a new file format means adding a reader function
here; adding a new FSP's schema means editing columns via the Configuration
API — neither touches the other.
"""

import io
import re
from datetime import datetime
from typing import Any

import pandas as pd

from app.models.template import TemplateColumn

READERS = {
    "csv": lambda data: pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False),
    "xlsx": lambda data: pd.read_excel(io.BytesIO(data), dtype=str),
    "xls": lambda data: pd.read_excel(io.BytesIO(data), dtype=str),
}


class UnsupportedFormat(ValueError):
    pass


def read_rows(filename: str, data: bytes) -> list[dict[str, Any]]:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    reader = READERS.get(ext)
    if reader is None:
        raise UnsupportedFormat(f"No reader registered for .{ext} files")
    df = reader(data).fillna("")
    return df.to_dict(orient="records")


def _check_type(value: str, column_type: str) -> bool:
    if value == "":
        return True  # emptiness is handled by the required check
    if column_type == "number":
        try:
            float(value)
            return True
        except ValueError:
            return False
    if column_type == "date":
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d %b %Y"):
            try:
                datetime.strptime(value, fmt)
                return True
            except ValueError:
                continue
        return False
    return True  # string / enum — no further check for v1


def validate_rows(rows: list[dict[str, Any]], columns: list[TemplateColumn]) -> list[dict]:
    errors: list[dict] = []
    header = set(rows[0].keys()) if rows else set()

    for column in columns:
        if column.required and column.name not in header:
            errors.append({"row": 0, "field": column.name, "error": "Column missing from file"})

    if errors:
        return errors  # a missing required column invalidates the whole file

    for row_index, row in enumerate(rows, start=1):
        for column in columns:
            value = str(row.get(column.name, ""))
            if column.required and value == "":
                errors.append({"row": row_index, "field": column.name, "error": "Required value is missing"})
                continue
            if not _check_type(value, column.type):
                errors.append(
                    {"row": row_index, "field": column.name, "error": f"Expected a {column.type} value"}
                )
                continue
            if column.rule.startswith("regex:") and value:
                pattern = column.rule.removeprefix("regex:")
                if not re.fullmatch(pattern, value):
                    errors.append({"row": row_index, "field": column.name, "error": f"Does not match rule: {column.rule}"})
    return errors


def summarize_rows(rows: list[dict[str, Any]], columns: list[TemplateColumn]) -> tuple[int, dict]:
    """Row count and the sum of each numeric column — used for board-level
    volume trends. Only meaningful to call on a submission that passed
    validation."""
    numeric_columns = [c.name for c in columns if c.type == "number"]
    totals = {name: 0.0 for name in numeric_columns}
    for row in rows:
        for name in numeric_columns:
            value = row.get(name, "")
            if value != "":
                totals[name] += float(value)
    return len(rows), totals


CATEGORICAL_NAMES = {"channel"}


def breakdown_rows(rows: list[dict[str, Any]], columns: list[TemplateColumn]) -> dict:
    """Count and summed amount per value of each categorical column (enum
    columns, plus well-known ones like 'channel'). Feeds inclusion analytics."""
    categorical = [c.name for c in columns if c.type == "enum" or c.name in CATEGORICAL_NAMES]
    amount_col = next((c.name for c in columns if c.type == "number"), None)
    result: dict[str, dict[str, dict[str, float]]] = {}
    for name in categorical:
        buckets: dict[str, dict[str, float]] = {}
        for row in rows:
            value = (row.get(name) or "").strip() or "Unspecified"
            bucket = buckets.setdefault(value, {"count": 0, "amount": 0.0})
            bucket["count"] += 1
            if amount_col and row.get(amount_col, "") != "":
                bucket["amount"] += float(row[amount_col])
        result[name] = buckets
    return result

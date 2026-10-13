"""Structure-agnostic ingestion: one shared validation engine driven entirely by
TemplateColumn rows. Adding a new file format means adding a reader here;
adding a new FSP's schema means editing columns via the Configuration API —
neither touches the other.

Error and warning entries name a row and a column and describe the rule —
they never quote cell values, so they are safe to show in the pipeline
monitor (REQ-PIPE-010)."""

import io
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

import pandas as pd
from sqlmodel import Session, select

from app.models.enums import SubmissionResult, UserRole
from app.models.integration import Integration
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.template import IngestionTemplate, TemplateColumn

# SRS §8.2 / §11.3
ALLOWED_TYPES = {"csv": "CSV", "xlsx": "XLSX", "xml": "XML"}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
TOO_LARGE_MESSAGE = "The uploaded file exceeds the 50 MB maximum size."  # §20.1 (413)
VALIDATION_FAILED_MESSAGE = "The file did not pass validation. See the error report below."  # §20.1 (422)
MAX_STORED_ISSUES = 1000  # error_count/warning_count keep the true totals

CONTENT_TYPES = {
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xml": "application/xml",
}
DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d %b %Y", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S")


class UnsupportedFormat(ValueError):
    pass


class FileRejected(ValueError):
    """The file can't be read at all (wrong encoding, malformed content).
    Recorded as a Validation Failed submission like any schema failure."""

    def __init__(self, rule: str, description: str):
        super().__init__(description)
        self.rule = rule
        self.description = description


@dataclass
class Table:
    columns: list[str]
    rows: list[dict[str, str]] = field(default_factory=list)


def issue(row: int, column: str, rule: str, description: str) -> dict:
    """One line of a §20.2 file error report. row 0 is the file/header;
    row n is the n-th data row (the header row is not counted)."""
    return {"row": row, "column": column, "rule": rule, "description": description}


def file_extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""


def _first_line(exc: Exception) -> str:
    return (str(exc).strip().splitlines() or [type(exc).__name__])[0][:160]


def _read_xml(data: bytes) -> Table:
    """<root><record><field>…</field>…</record>…</root>: each child of the
    root is a row; its child elements (and attributes) are the fields.
    defusedxml refuses entity/DTD tricks (billion laughs, XXE)."""
    from defusedxml import DefusedXmlException
    from defusedxml import ElementTree as SafeET
    from xml.etree.ElementTree import ParseError

    try:
        root = SafeET.fromstring(data)
    except ParseError as exc:
        raise FileRejected("format", f"The XML file is not well-formed ({_first_line(exc)}).") from exc
    except DefusedXmlException as exc:
        raise FileRejected("format", "XML entities and DTDs are not allowed.") from exc

    def local(tag: str) -> str:
        return tag.rsplit("}", 1)[-1]

    columns: list[str] = []
    rows: list[dict[str, str]] = []
    for record in root:
        row = {local(k): str(v).strip() for k, v in record.attrib.items()}
        for child in record:
            row[local(child.tag)] = (child.text or "").strip()
        for name in row:
            if name not in columns:
                columns.append(name)
        rows.append(row)
    return Table(columns=columns, rows=rows)


def read_rows(filename: str, data: bytes) -> Table:
    ext = file_extension(filename)
    if ext not in ALLOWED_TYPES:
        raise UnsupportedFormat(f"File type must be CSV, XLSX or XML (got .{ext or '?'})")
    if ext == "xml":
        return _read_xml(data)
    try:
        if ext == "csv":
            try:
                text = data.decode("utf-8-sig")
            except UnicodeDecodeError as exc:
                raise FileRejected("encoding", "CSV files must be UTF-8 encoded (§11.3).") from exc
            df = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
        else:
            df = pd.read_excel(io.BytesIO(data), dtype=str)
    except FileRejected:
        raise
    except pd.errors.EmptyDataError as exc:
        raise FileRejected("format", "The file is empty — it has no header row.") from exc
    except Exception as exc:  # malformed CSV, not really an .xlsx, ...
        raise FileRejected("format", f"The file could not be read as {ALLOWED_TYPES[ext]} ({_first_line(exc)}).") from exc
    df = df.fillna("")
    df.columns = [str(c).strip() for c in df.columns]
    rows = [{k: str(v).strip() for k, v in r.items()} for r in df.to_dict(orient="records")]
    return Table(columns=list(df.columns), rows=rows)


def _check_type(value: str, column_type: str) -> bool:
    if value == "":
        return True  # emptiness is handled by the required check
    if column_type == "number":
        try:
            float(value.replace(",", ""))
            return True
        except ValueError:
            return False
    if column_type == "date":
        return parse_date(value) is not None
    return True


def parse_date(value: str) -> Optional[datetime]:
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def validate_rows(table: Table, columns: list[TemplateColumn]) -> tuple[list[dict], list[dict]]:
    """Schema and data-quality check against the expected schema. Errors
    reject the whole file (no partial ingestion, §6.4); warnings don't, but
    make the transfer — and the integration — "Warning" (§9.1)."""
    errors: list[dict] = []
    warnings: list[dict] = []
    header = set(table.columns)
    expected = {c.name for c in columns}

    for column in columns:
        if column.name not in header:
            if column.required:
                errors.append(issue(0, column.name, "required_column", "Required column is missing from the file"))
            else:
                warnings.append(issue(0, column.name, "optional_column_missing", "Optional column is not in the file"))
    if errors:
        return errors, warnings  # a missing required column invalidates the whole file
    for name in table.columns:
        if name not in expected:
            warnings.append(issue(0, name, "unexpected_column", "Column is not in the expected schema and was ignored"))
    if not table.rows:
        warnings.append(issue(0, "file", "no_rows", "The file has a header but no data rows"))

    present = [c for c in columns if c.name in header]
    empty_optional = {c.name: 0 for c in present if not c.required}
    for row_index, row in enumerate(table.rows, start=1):
        for column in present:
            value = str(row.get(column.name, "") or "")
            if value == "":
                if column.required:
                    errors.append(issue(row_index, column.name, "required", "Required value is missing"))
                else:
                    empty_optional[column.name] += 1
                continue
            if not _check_type(value, column.type):
                errors.append(issue(row_index, column.name, "type", f"Expected a {column.type} value"))
                continue
            rule = column.rule or ""
            if rule.startswith("regex:"):
                pattern = rule.removeprefix("regex:")
                if not re.fullmatch(pattern, value):
                    errors.append(issue(row_index, column.name, "pattern", f"Does not match the pattern {pattern}"))
            elif column.type == "enum" and rule:
                allowed = [v.strip() for v in rule.split("|") if v.strip()]
                if allowed and value not in allowed:
                    errors.append(issue(row_index, column.name, "allowed_values", f"Not one of the allowed values: {', '.join(allowed)}"))
    if table.rows:
        for name, empties in empty_optional.items():
            if empties == len(table.rows):
                warnings.append(issue(0, name, "optional_column_empty", f"Optional column is empty in all {empties} rows"))
    return errors, warnings


def aggregate(
    rows: list[dict[str, Any]],
    numeric: dict[str, str],
    categorical: dict[str, str],
    weight_field: Optional[str] = None,
) -> tuple[int, dict, dict]:
    """What the Load step keeps — aggregates only, never rows: the number of
    transactions the file represents (the weight field's sum when the rows
    are summaries, else one per row), the sum of each numeric field, and a
    count/amount breakdown per categorical value. numeric/categorical map a
    field in `rows` to the analytics key it is stored under (e.g. a mapped
    "IntrBkSttlmAmt" is stored as "amount")."""
    amount_field = next((f for f, key in numeric.items() if key == "amount"), None) or next(iter(numeric), None)
    totals = {key: 0.0 for key in numeric.values()}
    breakdowns: dict[str, dict[str, dict[str, float]]] = {key: {} for key in categorical.values()}
    transactions = 0
    for row in rows:
        weight = 1
        if weight_field:
            raw = row.get(weight_field, "")
            weight = int(float(raw)) if raw not in ("", None) else 0
        transactions += weight
        for name, key in numeric.items():
            value = row.get(name, "")
            if value not in ("", None):
                totals[key] += float(value)
        for name, key in categorical.items():
            value = str(row.get(name) or "").strip() or "Unspecified"
            bucket = breakdowns[key].setdefault(value, {"count": 0, "amount": 0.0})
            bucket["count"] += weight
            if amount_field and row.get(amount_field, "") not in ("", None):
                bucket["amount"] += float(row[amount_field])
    return transactions, {k: round(v, 2) for k, v in totals.items()}, breakdowns


CATEGORICAL_NAMES = {"channel"}


def identity_fields(columns: list[TemplateColumn]) -> tuple[dict[str, str], dict[str, str], Optional[str]]:
    """Aggregate roles when no target mapping is assigned: source names are
    kept as they are."""
    numeric = {c.name: c.name for c in columns if c.type == "number" and c.name != "transaction_count"}
    categorical = {c.name: c.name for c in columns if c.type == "enum" or c.name in CATEGORICAL_NAMES}
    weight = "transaction_count" if any(c.name == "transaction_count" for c in columns) else None
    return numeric, categorical, weight


# ---- schema resolution -------------------------------------------------------

def template_columns(session: Session, template_id: int) -> list[TemplateColumn]:
    return list(
        session.exec(select(TemplateColumn).where(TemplateColumn.template_id == template_id).order_by(TemplateColumn.position)).all()
    )


def resolve_template(
    session: Session, participant_id: int, *, requirement=None, integration: Optional[Integration] = None
) -> Optional[IngestionTemplate]:
    """The expected schema: the requirement type's template, else the data
    source's, else the participant's latest."""
    for candidate in (getattr(requirement, "template_id", None), getattr(integration, "template_id", None)):
        if candidate:
            template = session.get(IngestionTemplate, candidate)
            if template:
                return template
    return session.exec(
        select(IngestionTemplate)
        .where(IngestionTemplate.participant_id == participant_id)
        .order_by(IngestionTemplate.version.desc(), IngestionTemplate.id.desc())
    ).first()


# ---- manual upload intake (SRS §6.1 steps 3-4a, §6.4, §8.2) -----------------

@dataclass
class UploadOutcome:
    submission: Submission
    job: Optional[Any] = None  # PipelineJob when validation passed


def ingest_upload(
    session: Session,
    *,
    participant: Participant,
    integration: Integration,
    template: IngestionTemplate,
    period_label: str,
    period_slug: str,
    original_filename: str,
    data: bytes,
    uploaded_by: str,
    requirement_id: Optional[int] = None,
    replaces_submission_id: Optional[int] = None,
) -> UploadOutcome:
    """Validate a file a participant sent offline and record it. Pass →
    "Submitted" and a pipeline job is queued; fail → "Validation Failed"
    with a row/column error report, nothing loaded, Compliance notified.
    Either way the file and the attempt are kept (audit, §6.4 step 6).
    Request-level checks (type, size, who may upload) are the caller's."""
    from app.services import compliance_hooks, pipeline_runner
    from app.storage import put_file

    ext = file_extension(original_filename)
    canonical_filename = f"{participant.code}_{period_slug}.{ext}"
    storage_key = f"submissions/{participant.id}/{uuid4()}-{canonical_filename}"
    put_file(storage_key, data, CONTENT_TYPES.get(ext, "application/octet-stream"))

    columns = template_columns(session, template.id)
    records = 0
    try:
        table = read_rows(original_filename, data)
        records = len(table.rows)
        errors, warnings = validate_rows(table, columns)
    except FileRejected as exc:
        errors, warnings = [issue(0, "file", exc.rule, exc.description)], []

    passed = not errors
    submission = Submission(
        participant_id=participant.id,
        integration_id=integration.id,
        template_id=template.id,
        requirement_id=requirement_id,
        replaces_submission_id=replaces_submission_id,
        period=period_label,
        filename=canonical_filename,
        storage_key=storage_key,
        uploaded_by=uploaded_by,
        result=SubmissionResult.passed if passed else SubmissionResult.failed,
        status="Submitted" if passed else "Validation Failed",
        records_received=records,
        error_count=len(errors),
        errors=errors[:MAX_STORED_ISSUES],
        warning_count=len(warnings),
        warnings=warnings[:MAX_STORED_ISSUES],
    )
    session.add(submission)
    session.commit()
    session.refresh(submission)

    job = None
    if passed:
        job = pipeline_runner.enqueue(session, integration=integration, submission=submission,
                                      trigger="Upload", triggered_by=uploaded_by)
    else:
        pipeline_runner.record_rejected_transfer(session, integration, submission)
        notify_validation_failed(session, submission, participant)
    compliance_hooks.on_submission_ingested(session, submission)
    session.refresh(submission)
    return UploadOutcome(submission=submission, job=job)


def notify_validation_failed(session: Session, submission: Submission, participant: Participant) -> None:
    """§6.1 step 4a: the Compliance user follows up with the institution."""
    from app.services.notify import dispatch, users_with_roles

    dispatch(
        session,
        "submission_validation_failed",
        users_with_roles(session, UserRole.compliance),
        f"Submission failed validation — {participant.name}",
        f"SUB-{submission.id} ({submission.period}) has {submission.error_count} validation error(s); nothing was loaded. "
        "Request a corrected file from the institution and re-upload it.",
        link="/integrations",
        severity="warning",
        dedupe_key=f"submission_validation_failed:{submission.id}",
    )

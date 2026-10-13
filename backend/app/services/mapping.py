"""Standards & Mapping (SRS §5.5): field-level translation of a participant's
source fields to a canonical target standard, versioned as immutable
published releases plus one editable draft, and applied by the pipeline's
Transform step (REQ-MAP-007).

The target standards are fixed specifications, so their field catalogues
live here. Each target field may carry an analytics role — "amount",
"channel" or "weight" (transactions a summary row represents) — which is
how the Load step knows what to aggregate whatever the standard calls it."""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from app.models.template import FieldMapping, FieldRule, IngestionTemplate, MappingVersion, TemplateColumn
from app.services.ingestion import identity_fields, parse_date


@dataclass(frozen=True)
class TargetField:
    name: str
    type: str  # string | number | date
    description: str
    role: str = ""  # "" | amount | channel | weight


STANDARDS: dict[str, list[TargetField]] = {
    # RDIP's own canonical JSON record.
    "JSON Canonical": [
        TargetField("transaction_id", "string", "Transaction reference"),
        TargetField("transaction_date", "date", "Value date (ISO 8601)"),
        TargetField("amount", "number", "Transaction amount (RWF)", "amount"),
        TargetField("currency", "string", "ISO 4217 currency code"),
        TargetField("channel", "string", "Channel (POS, Mobile, ATM, Web)", "channel"),
        TargetField("transaction_count", "number", "Transactions represented by a summary row", "weight"),
        TargetField("branch_code", "string", "Branch or agent code"),
        TargetField("region", "string", "Region of the transaction"),
    ],
    # ISO 20022 (pacs.008 FIToFICustomerCreditTransfer) element paths.
    "ISO 20022": [
        TargetField("CdtTrfTxInf.PmtId.TxId", "string", "Payment identification — transaction id"),
        TargetField("CdtTrfTxInf.IntrBkSttlmDt", "date", "Interbank settlement date"),
        TargetField("CdtTrfTxInf.IntrBkSttlmAmt", "number", "Interbank settlement amount", "amount"),
        TargetField("CdtTrfTxInf.IntrBkSttlmAmt.Ccy", "string", "Settlement currency"),
        TargetField("CdtTrfTxInf.PmtTpInf.LclInstrm.Prtry", "string", "Local instrument (channel)", "channel"),
        TargetField("GrpHdr.NbOfTxs", "number", "Number of transactions", "weight"),
        TargetField("CdtTrfTxInf.InstgAgt.BrnchId", "string", "Instructing agent branch"),
    ],
}

TRANSFORMS = {
    "": "Copy as is",
    "trim": "Trim spaces",
    "uppercase": "Upper case",
    "lowercase": "Lower case",
    "number": "Parse number (drops thousands separators)",
    "date": "Parse date to ISO 8601",
}


class MappingError(ValueError):
    """A rule set or action the mapping rules don't allow. `field` is the
    input it belongs to (§20.2)."""

    def __init__(self, field: str, message: str, **extra):
        super().__init__(message)
        self.field = field
        self.message = message
        self.extra = extra


def target_fields(standard: str) -> dict[str, TargetField]:
    return {f.name: f for f in STANDARDS.get(standard, [])}


# ---- reads -------------------------------------------------------------------

def rules_of(session: Session, version_id: int) -> list[FieldRule]:
    return list(session.exec(select(FieldRule).where(FieldRule.version_id == version_id).order_by(FieldRule.position, FieldRule.id)).all())


def draft_of(session: Session, mapping: FieldMapping) -> Optional[MappingVersion]:
    return session.exec(
        select(MappingVersion).where(MappingVersion.mapping_id == mapping.id, MappingVersion.is_draft == True)  # noqa: E712
    ).first()


def published_versions(session: Session, mapping_id: int) -> list[MappingVersion]:
    return list(
        session.exec(
            select(MappingVersion)
            .where(MappingVersion.mapping_id == mapping_id, MappingVersion.is_draft == False)  # noqa: E712
            .order_by(MappingVersion.number.desc())
        ).all()
    )


def counts(rules: list[FieldRule]) -> tuple[int, int]:
    """(mapped, total) source fields — REQ-MAP-002."""
    return sum(1 for r in rules if r.target_field), len(rules)


def status_of(session: Session, mapping: FieldMapping) -> str:
    """REQ-MAP-003: Draft until first published; then Healthy if every field
    of the active version is mapped, else Warning."""
    if not mapping.active_version_id:
        return "Draft"
    mapped, total = counts(rules_of(session, mapping.active_version_id))
    return "Healthy" if mapped == total else "Warning"


def next_code(session: Session) -> str:
    numbers = [int(code.split("-")[-1]) for code in session.exec(select(FieldMapping.code)).all() if code.split("-")[-1].isdigit()]
    return f"MAP-{(max(numbers) if numbers else 0) + 1:03d}"


# ---- writes (the caller commits) ---------------------------------------------

def create_mapping(
    session: Session,
    *,
    name: str,
    source_system: str,
    target_standard: str,
    user: str,
    source_template_id: Optional[int] = None,
    participant_id: Optional[int] = None,
) -> FieldMapping:
    """A new mapping starts as a draft whose rules list every column of the
    source schema, all unmapped until the technical user maps them."""
    if not name.strip():
        raise MappingError("name", "Name the mapping")
    if target_standard not in STANDARDS:
        raise MappingError("target_standard", f"Target standard must be one of: {', '.join(STANDARDS)}")
    template = session.get(IngestionTemplate, source_template_id) if source_template_id else None
    if source_template_id and not template:
        raise MappingError("source_template_id", "Source schema not found")
    mapping = FieldMapping(
        code=next_code(session),
        name=name.strip(),
        source_system=source_system.strip(),
        target_standard=target_standard,
        source_template_id=source_template_id,
        participant_id=participant_id or (template.participant_id if template else None),
        created_by=user,
    )
    session.add(mapping)
    session.flush()
    draft = MappingVersion(mapping_id=mapping.id, created_by=user)
    session.add(draft)
    session.flush()
    if template:
        columns = session.exec(select(TemplateColumn).where(TemplateColumn.template_id == template.id).order_by(TemplateColumn.position)).all()
        for position, column in enumerate(columns):
            session.add(FieldRule(mapping_id=mapping.id, version_id=draft.id, source_field=column.name, position=position))
    return mapping


def ensure_draft(session: Session, mapping: FieldMapping, user: str) -> MappingVersion:
    """Edits never touch a published version (REQ-MAP-004): the draft starts
    as a copy of the active release."""
    draft = draft_of(session, mapping)
    if draft:
        return draft
    draft = MappingVersion(mapping_id=mapping.id, created_by=user)
    session.add(draft)
    session.flush()
    if mapping.active_version_id:
        for rule in rules_of(session, mapping.active_version_id):
            session.add(FieldRule(mapping_id=mapping.id, version_id=draft.id, source_field=rule.source_field,
                                  target_field=rule.target_field, transform=rule.transform, position=rule.position))
    return draft


def save_draft_rules(session: Session, mapping: FieldMapping, rules: list[dict], user: str) -> MappingVersion:
    targets = target_fields(mapping.target_standard)
    seen_sources: set[str] = set()
    seen_targets: dict[str, str] = {}
    clean: list[tuple[str, str, str]] = []
    for index, rule in enumerate(rules):
        source = str(rule.get("source_field") or "").strip()
        target = str(rule.get("target_field") or "").strip()
        transform = str(rule.get("transform") or "").strip()
        if not source:
            raise MappingError(f"rules.{index}.source_field", "Every rule needs a source field")
        if source in seen_sources:
            raise MappingError(f"rules.{index}.source_field", f"Source field {source} appears twice")
        if target and target not in targets:
            raise MappingError(f"rules.{index}.target_field", f"{target} is not a {mapping.target_standard} field")
        if target and target in seen_targets:
            raise MappingError(f"rules.{index}.target_field", f"{target} is already mapped from {seen_targets[target]}")
        if transform not in TRANSFORMS:
            raise MappingError(f"rules.{index}.transform", f"Unknown transform {transform}")
        seen_sources.add(source)
        if target:
            seen_targets[target] = source
        clean.append((source, target, transform))
    draft = ensure_draft(session, mapping, user)
    for old in rules_of(session, draft.id):
        session.delete(old)
    session.flush()
    for position, (source, target, transform) in enumerate(clean):
        session.add(FieldRule(mapping_id=mapping.id, version_id=draft.id, source_field=source,
                              target_field=target, transform=transform, position=position))
    mapping.updated_at = datetime.utcnow()
    session.add(mapping)
    return draft


def publish(session: Session, mapping: FieldMapping, *, user: str, notes: str = "", confirm_unmapped: bool = False) -> MappingVersion:
    """Draft → next major release (v1.0, v2.0, …), which becomes the active
    version the pipeline applies. Unmapped fields need explicit confirmation
    (REQ-MAP-008)."""
    draft = draft_of(session, mapping)
    if not draft:
        raise MappingError("draft", "There are no draft changes to publish")
    rules = rules_of(session, draft.id)
    mapped, total = counts(rules)
    if mapped == 0:
        raise MappingError("rules", "Map at least one field before publishing")
    unmapped = [r.source_field for r in rules if not r.target_field]
    if unmapped and not confirm_unmapped:
        raise MappingError(
            "confirm_unmapped",
            f"{len(unmapped)} of {total} fields are unmapped and will not be loaded: {', '.join(unmapped)}. Confirm to publish anyway.",
            unmapped=unmapped,
        )
    latest = published_versions(session, mapping.id)
    draft.number = (latest[0].number if latest else 0) + 1
    draft.is_draft = False
    draft.notes = notes.strip()
    draft.mapped_count, draft.total_count = mapped, total
    draft.published_by = user
    draft.published_at = datetime.utcnow()
    mapping.active_version_id = draft.id
    mapping.updated_at = datetime.utcnow()
    session.add(draft)
    session.add(mapping)
    return draft


def clone(session: Session, source: FieldMapping, *, name: str, user: str) -> FieldMapping:
    """REQ-MAP-006: a new mapping (its own ID, Draft) seeded with the rules of
    the source's active release — or its draft if never published. The
    caller commits once, so the copy is all-or-nothing."""
    copy = FieldMapping(
        code=next_code(session),
        name=name.strip() or f"{source.name} (copy)",
        source_system=source.source_system,
        participant_id=source.participant_id,
        source_template_id=source.source_template_id,
        target_standard=source.target_standard,
        cloned_from_id=source.id,
        created_by=user,
    )
    session.add(copy)
    session.flush()
    draft = MappingVersion(mapping_id=copy.id, created_by=user, notes=f"Cloned from {source.code}")
    session.add(draft)
    session.flush()
    from_version = source.active_version_id or getattr(draft_of(session, source), "id", None)
    for rule in rules_of(session, from_version) if from_version else []:
        session.add(FieldRule(mapping_id=copy.id, version_id=draft.id, source_field=rule.source_field,
                              target_field=rule.target_field, transform=rule.transform, position=rule.position))
    return copy


# ---- applying a mapping in the pipeline (REQ-MAP-007) ------------------------

def _to_number(value: str) -> str:
    return str(float(value.replace(",", "").replace(" ", "")))


def _apply_transform(value: str, transform: str) -> str:
    if transform == "trim":
        return value.strip()
    if transform == "uppercase":
        return value.upper()
    if transform == "lowercase":
        return value.lower()
    if transform == "number":
        return _to_number(value)
    if transform == "date":
        parsed = parse_date(value)
        if parsed is None:
            raise ValueError("date")
        return parsed.date().isoformat()
    return value


@dataclass
class Plan:
    """How one job turns source rows into canonical rows."""

    label: str  # shown in the log, e.g. "MAP-002 v2.0"
    description: str
    rules: list[tuple[str, str, str, str]]  # (source, target, transform, target type)
    numeric: dict[str, str]  # target field → analytics key
    categorical: dict[str, str]
    weight_field: Optional[str]
    unmapped: list[str]
    mapping_id: Optional[int] = None
    version_id: Optional[int] = None

    def apply(self, rows: list[dict], schema: list[str]) -> tuple[list[dict], list[dict], list[dict]]:
        """(canonical rows, errors, warnings). `schema` is the expected
        schema's column names; drift between it and the mapping is a
        warning, as are unmapped fields (they are not loaded)."""
        from app.services.ingestion import issue

        warnings: list[dict] = []
        if self.mapping_id:
            sources = {r[0] for r in self.rules}
            for name in self.unmapped:
                warnings.append(issue(0, name, "unmapped_field", f"Field is unmapped in {self.label} and was not loaded"))
            for name in schema:
                if name not in sources and name not in self.unmapped:
                    warnings.append(issue(0, name, "no_rule", f"Column has no rule in {self.label} and was not loaded"))
            for source in sources:
                if source not in schema:
                    warnings.append(issue(0, source, "not_in_schema", f"Mapped in {self.label} but not in the expected schema"))

        out: list[dict] = []
        errors: list[dict] = []
        for index, row in enumerate(rows, start=1):
            record: dict = {}
            for source, target, transform, target_type in self.rules:
                value = str(row.get(source, "") or "")
                if value == "":
                    record[target] = ""
                    continue
                try:
                    value = _apply_transform(value, transform)
                    if target_type == "number":
                        value = _to_number(value)
                    elif target_type == "date" and parse_date(value) is None:
                        raise ValueError("date")
                except ValueError:
                    errors.append(issue(index, source, "transform", f"Cannot be converted to a {target_type} for {target}"))
                    continue
                record[target] = value
            out.append(record)
        return out, errors, warnings


class MappingUnavailable(ValueError):
    pass


def resolve_plan(session: Session, mapping_id: Optional[int], columns: list[TemplateColumn]) -> Plan:
    """The active published version of the target mapping — never a draft.
    No mapping assigned: source field names are kept (identity)."""
    if not mapping_id:
        numeric, categorical, weight = identity_fields(columns)
        return Plan(
            label="no target mapping",
            description="No target mapping assigned — fields are loaded under their source names",
            rules=[(c.name, c.name, "", c.type) for c in columns],
            numeric=numeric,
            categorical=categorical,
            weight_field=weight,
            unmapped=[],
        )
    mapping = session.get(FieldMapping, mapping_id)
    if not mapping:
        raise MappingUnavailable("The target mapping assigned to this data source no longer exists")
    if not mapping.active_version_id:
        raise MappingUnavailable(
            f"Target mapping {mapping.code} has no published version — publish it in Standards & Mapping, then reprocess"
        )
    version = session.get(MappingVersion, mapping.active_version_id)
    targets = target_fields(mapping.target_standard)
    rules = rules_of(session, version.id)
    mapped = [r for r in rules if r.target_field and r.target_field in targets]
    numeric = {r.target_field: targets[r.target_field].role for r in mapped if targets[r.target_field].role == "amount"}
    categorical = {r.target_field: targets[r.target_field].role for r in mapped if targets[r.target_field].role == "channel"}
    weight = next((r.target_field for r in mapped if targets[r.target_field].role == "weight"), None)
    label = f"{mapping.code} {version.label}"
    return Plan(
        label=label,
        description=(
            f"Applying {label} '{mapping.name}' → {mapping.target_standard} "
            f"(published by {version.published_by or 'unknown'} on {version.published_at:%Y-%m-%d}): "
            f"{len(mapped)} of {len(rules)} source fields mapped"
        ),
        rules=[(r.source_field, r.target_field, r.transform, targets[r.target_field].type) for r in mapped],
        numeric=numeric,
        categorical=categorical,
        weight_field=weight,
        unmapped=[r.source_field for r in rules if not r.target_field],
        mapping_id=mapping.id,
        version_id=version.id,
    )

"""Compliance document status is always derived, never stored — the one
exception is 'Missing', which is the absence of a row for a required type,
not a stored value either."""

from datetime import date

from app.models.document import ComplianceDocument
from app.models.enums import DocumentStatus

EXPIRING_SOON_WINDOW_DAYS = 60


def document_status(document: ComplianceDocument, today: date | None = None) -> DocumentStatus:
    today = today or date.today()
    if document.expiry_date is None:
        return DocumentStatus.on_file
    days_left = (document.expiry_date - today).days
    if days_left < 0:
        return DocumentStatus.expired
    if days_left <= EXPIRING_SOON_WINDOW_DAYS:
        return DocumentStatus.expiring_soon
    return DocumentStatus.on_file


def roster_status(
    participant_id: int,
    documents: list[ComplianceDocument],
    required_type_ids: list[int],
    today: date | None = None,
) -> list[dict]:
    by_type = {d.doc_type_id: d for d in documents if d.participant_id == participant_id}
    result = []
    for type_id in required_type_ids:
        doc = by_type.get(type_id)
        status = DocumentStatus.missing if doc is None else document_status(doc, today)
        result.append({"doc_type_id": type_id, "document": doc, "status": status})
    return result

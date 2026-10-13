from enum import Enum


class IntegrationStatus(str, Enum):
    """SRS §9.1 / REQ-INTG-003, worded exactly as the SRS. The database
    stores member names (healthy, not_configured, ...)."""

    healthy = "Healthy"  # last transfer succeeded with no errors or warnings
    warning = "Warning"  # last transfer succeeded with validation warnings, or a transfer is late but within grace
    failed = "Failed"  # last transfer failed or was rejected, or long overdue
    pending = "Pending"  # configured, nothing received yet
    not_configured = "Not Configured"  # data source exists but is not set up (e.g. API mode without endpoint)
    running = "Running"  # transfer in progress
    queued = "Queued"  # transfer scheduled but not started
    paused = "Paused"  # transfer manually paused by an admin
    # Pre-SRS names, kept only as aliases so older callers still import;
    # stored rows are converted by db._upgrade_integrations. Do not use.
    connected = "Healthy"
    degraded = "Warning"
    disconnected = "Failed"
    maintenance = "Paused"


class IntegrationSource(str, Enum):
    """What last set Integration.status."""

    manual = "Manual"  # a Technical/Admin user
    schedule_check = "Schedule check"  # the overdue check (scheduler.check_overdue_integrations)
    pipeline = "Pipeline"  # the outcome of a transfer (upload validation or pipeline job)


class SubmissionResult(str, Enum):
    passed = "Passed"
    failed = "Failed"


class DocumentStatus(str, Enum):
    on_file = "On File"
    expiring_soon = "Expiring Soon"
    expired = "Expired"
    missing = "Missing"


class IssueSeverity(str, Enum):
    critical = "Critical"
    high = "High"
    medium = "Medium"
    low = "Low"


class IssueStatus(str, Enum):
    open = "Open"
    in_progress = "In Progress"
    resolved = "Resolved"
    closed = "Closed"


class UserRole(str, Enum):
    compliance = "Compliance"
    business = "Business"
    board = "Board"
    technical = "Technical / Admin"
    # Legacy only — participant logins no longer exist; any such account is
    # deactivated at startup (see app.db.init_db). Never assigned.
    participant = "Participant"


# SRS §10.1 — the four participant categories used for segmentation everywhere.
class InstitutionType(str, Enum):
    commercial_bank = "Commercial Bank"
    e_money_issuer = "E-money Issuer"
    mfi = "MFI"
    sacco = "SACCO"


class ParticipantStatus(str, Enum):
    active = "Active"
    inactive = "Inactive"
    suspended = "Suspended"


# Rwanda's provinces plus Kigali City — the region dimension for inclusion
# reporting and filters (SRS §5.10, REQ-DASH-009).
REGIONS = ["Kigali City", "Northern Province", "Southern Province", "Eastern Province", "Western Province"]


# SRS §9.2 — status of a compliance requirement's current cycle.
class ComplianceStatus(str, Enum):
    pending = "Pending"
    submitted = "Submitted"
    validation_failed = "Validation Failed"
    pending_correction = "Pending Correction"
    under_review = "Under Review"
    approved = "Approved"
    rejected = "Rejected"
    overdue = "Overdue"


class ComplianceFrequency(str, Enum):
    monthly = "Monthly"
    quarterly = "Quarterly"
    annual = "Annual"
    ad_hoc = "Ad hoc"

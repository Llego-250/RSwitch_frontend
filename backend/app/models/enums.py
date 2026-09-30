from enum import Enum


class IntegrationStatus(str, Enum):
    connected = "Connected"
    degraded = "Degraded"
    disconnected = "Disconnected"
    maintenance = "Maintenance"


class IntegrationSource(str, Enum):
    manual = "Manual"
    schedule_check = "Schedule check"


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
    participant = "Participant"

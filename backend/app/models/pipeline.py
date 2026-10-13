"""Pipeline jobs, their step logs, and scheduled pipeline configurations
(SRS §5.4, §17.3). Jobs and logs hold aggregate counts and metadata only —
never row values (REQ-PIPE-010)."""

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class PipelineJobStatus(str, Enum):
    """REQ-PIPE-003, exactly."""

    running = "Running"
    completed = "Completed"
    failed = "Failed"
    queued = "Queued"
    paused = "Paused"  # stopped by a Technical/Admin user; can be reprocessed


ACTIVE_JOB_STATUSES = (PipelineJobStatus.queued.value, PipelineJobStatus.running.value)


class PipelineJob(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    participant_id: int = Field(foreign_key="participant.id", index=True)
    integration_id: Optional[int] = Field(default=None, foreign_key="integration.id", index=True)
    config_id: Optional[int] = Field(default=None, foreign_key="pipelineconfig.id")
    submission_id: Optional[int] = Field(default=None, foreign_key="submission.id", index=True)
    trigger: str = ""  # Upload | Manual sync | Schedule | Reprocess
    triggered_by: str = ""
    status: str = Field(default=PipelineJobStatus.queued.value, index=True)
    progress: int = 0  # 0-100
    current_step: str = ""
    queued_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    # Refreshed while the job runs, so a restarted worker can tell a job that
    # is really running from one orphaned by a crash.
    heartbeat_at: Optional[datetime] = None
    records_processed: int = 0
    error_count: int = 0
    warning_count: int = 0
    # The published mapping version the Transform step applied (REQ-MAP-007).
    mapping_id: Optional[int] = None
    mapping_version_id: Optional[int] = None
    mapping_label: str = ""  # e.g. "MAP-002 v2.0"
    stop_requested: bool = False
    stopped_by: str = ""
    reprocess_of_id: Optional[int] = None
    summary: str = ""  # outcome in one line (metadata only)


class PipelineLog(SQLModel, table=True):
    """One line of a job's step-by-step execution log (REQ-PIPE-004),
    retained per pipelines.log_retention_days (REQ-PIPE-009)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="pipelinejob.id", index=True)
    at: datetime = Field(default_factory=datetime.utcnow, index=True)
    step: str = ""  # Queue | Extract | Validate | Transform | Load
    level: str = "INFO"  # INFO | WARN | ERROR
    message: str = ""


class PipelineConfig(SQLModel, table=True):
    """REQ-PIPE-008: a scheduled pipeline — source, cron schedule, target mapping."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    integration_id: int = Field(foreign_key="integration.id", index=True)
    schedule_cron: str
    mapping_id: Optional[int] = Field(default=None, foreign_key="fieldmapping.id")
    active: bool = True
    # Created from the integration's own schedule_cron and kept in step with it.
    is_default: bool = False
    next_run_at: Optional[datetime] = None  # UTC
    last_enqueued_at: Optional[datetime] = None
    created_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

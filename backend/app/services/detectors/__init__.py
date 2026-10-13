"""Pluggable anomaly detectors (REQ-AI-010).

The engine (app.services.anomaly) never names a detector in code: it imports
whatever import paths are listed in the `anomaly.detectors` setting and calls
`detect(context)` on each. A detector is any object with

    name: str            human name shown in the UI
    method: str          baseline method it implements: "threshold" (R1),
                         "rolling" (R2), "peer" (R3), "*" (all participants,
                         whatever the active method) or a new key of its own
                         (e.g. "ml") selectable as anomaly.baseline_method
    description: str     how it works, shown next to its alerts (REQ-AI-009)
    detect(ctx: DetectionContext) -> list[Finding]

so a statistical or ML model is plugged in by adding a module to this
package and listing it in Settings — no application code changes. Detectors
only *report* findings; persisting, deduplicating, notifying and the alert
lifecycle stay in the engine, and nothing here may change a participant or
an integration (REQ-AI-002)."""

import importlib
import logging
from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

log = logging.getLogger(__name__)

# Only modules under these packages may be loaded from the setting, so a
# settings value can never import arbitrary code.
PLUGIN_PACKAGES: tuple[str, ...] = ("app.services.detectors",)

# REQ-AI-011 phases. A plugin may add its own method key.
METHODS: dict[str, dict[str, str]] = {
    "threshold": {
        "label": "R1 — Configured thresholds",
        "release": "Release 1",
        "description": "Predefined limits set by Technical/Admin users in Settings (e.g. failure rate ≥ 20%).",
    },
    "rolling": {
        "label": "R2 — Rolling historical baseline",
        "release": "Release 2",
        "description": "Each participant compared with its own last 6+ reporting months. Needs at least 6 months of "
        "prior submission history; otherwise the participant falls back to R1 thresholds.",
    },
    "peer": {
        "label": "R3 — Peer-group baseline",
        "release": "Release 3",
        "description": "Each participant compared with the median of institutions of the same type over the same window. "
        "Needs enough same-type peers with data; otherwise falls back to R2, then R1.",
    },
}

SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]


def method_label(key: str) -> str:
    return METHODS.get(key, {}).get("label") or f"Custom — {key}"


@dataclass
class Finding:
    """One unusual pattern for one participant, with everything REQ-AI-004
    requires on the alert card plus its provenance (REQ-AI-008/009)."""

    participant_id: int
    indicator_code: str  # stable family key, e.g. "validation_failure_rate"
    indicator: str  # human label
    # What data the finding rests on (e.g. "sub42"): the same evidence never
    # raises a second alert; new evidence after closure raises a new one.
    evidence_key: str
    baseline_value: str
    observed_value: str
    deviation: str
    deviation_pct: Optional[float]
    severity: str
    recommended_area: str
    baseline_method_key: str
    methodology: str
    data_sources: list[str]
    source_submission_ids: list[int] = field(default_factory=list)
    baseline_method: str = ""  # label; defaults from baseline_method_key
    detector: str = ""  # filled in by the engine with the import path

    def __post_init__(self) -> None:
        if self.severity not in SEVERITIES:
            raise ValueError(f"Unknown severity {self.severity}")
        if not self.baseline_method:
            self.baseline_method = method_label(self.baseline_method_key)


class Detector(Protocol):
    name: str
    method: str
    description: str

    def detect(self, ctx: Any) -> list[Finding]: ...


@dataclass
class LoadedDetector:
    path: str
    detector: Optional[Detector]
    error: str = ""

    def info(self) -> dict:
        d = self.detector
        return {
            "path": self.path,
            "loaded": d is not None,
            "error": self.error,
            "name": getattr(d, "name", ""),
            "method": getattr(d, "method", ""),
            "method_label": "All participants (any method)" if getattr(d, "method", "") == "*" else method_label(getattr(d, "method", "")),
            "description": getattr(d, "description", ""),
        }


def load_detector(path: str) -> LoadedDetector:
    """'package.module:Attribute' (or 'package.module.Attribute'). A class is
    instantiated; any other object just needs a detect() method."""
    path = (path or "").strip()
    module_name, _, attr = path.partition(":") if ":" in path else path.rpartition(".")
    if not module_name or not attr:
        return LoadedDetector(path, None, "Expected 'package.module:Detector'")
    if not any(module_name == p or module_name.startswith(p + ".") for p in PLUGIN_PACKAGES):
        return LoadedDetector(path, None, f"Detectors must live under {', '.join(PLUGIN_PACKAGES)}")
    try:
        obj = getattr(importlib.import_module(module_name), attr)
        detector = obj() if isinstance(obj, type) else obj
    except Exception as exc:  # a broken plugin must never stop the others
        log.warning("Could not load detector %s: %s", path, exc)
        return LoadedDetector(path, None, f"{type(exc).__name__}: {exc}")
    if not callable(getattr(detector, "detect", None)):
        return LoadedDetector(path, None, "Object has no detect(context) method")
    return LoadedDetector(path, detector)


def load_detectors(paths: list[str]) -> list[LoadedDetector]:
    return [load_detector(p) for p in paths]

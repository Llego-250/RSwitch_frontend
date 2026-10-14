"""The services.risk contract other modules read risk through — Reports
(§14.3), the Dashboard (§15.2) and the AI priority list (REQ-AI-005):
latest_scores, participant_risk, distribution. The methodology itself is
tested in test_participant360.

Run against a seeded database, e.g.
    DATABASE_URL=sqlite:////tmp/p360.db ... python -m app.seed_demo && python -m tests.test_risk"""

from datetime import datetime, timedelta
from uuid import uuid4

from sqlmodel import Session

from tests.pipeline_support import BUSINESS, client, h, make_participant, run_module

from app.db import engine
from app.models.enums import SubmissionResult
from app.models.participant import Participant
from app.models.submission import Submission
from app.services import risk as svc

SCORE_KEYS = {"participant_id", "participant_name", "participant_type", "region", "status", "composite", "band",
              "categories", "top_factor", "months_of_history", "computed_at"}


def _with_history(days: int) -> dict:
    p = make_participant()
    with Session(engine) as s:
        s.add(Submission(participant_id=p["id"], period="test", filename="t.csv", storage_key=f"test/{uuid4().hex}",
                         uploaded_at=datetime.utcnow() - timedelta(days=days), result=SubmissionResult.passed))
        s.commit()
        svc.recompute(s, participants=[s.get(Participant, p["id"])])
    return p


def test_latest_scores_contract():
    scored, pending = _with_history(120), _with_history(30)
    with Session(engine) as s:
        rows = svc.latest_scores(s)
    assert all(SCORE_KEYS <= set(r) for r in rows)
    by_id = {r["participant_id"]: r for r in rows}
    assert by_id[scored["id"]]["status"] == "scored" and 0 <= by_id[scored["id"]]["composite"] <= 100
    assert by_id[scored["id"]]["band"] in ("Low", "Medium", "High")
    assert set(by_id[scored["id"]]["categories"]) == {"compliance", "operational", "technical"}
    for cat in by_id[scored["id"]]["categories"].values():
        assert {"score", "weight", "indicators"} <= set(cat)
        assert all({"value", "unit", "score"} <= set(i) for i in cat["indicators"].values())
    p = by_id[pending["id"]]
    assert p["status"] == "insufficient_data" and p["composite"] is None and p["band"] is None
    assert p["message"] == "Insufficient data — score pending."
    # Riskiest first, insufficient-data participants last.
    composites = [r["composite"] for r in rows]
    scored_part = [x for x in composites if x is not None]
    assert composites == scored_part + [None] * (len(composites) - len(scored_part))
    assert scored_part == sorted(scored_part, reverse=True)
    datetime.fromisoformat(rows[0]["computed_at"])


def test_participant_risk_contract():
    p = _with_history(120)
    with Session(engine) as s:
        r = svc.participant_risk(s, p["id"])
        assert svc.participant_risk(s, 999999) is None
    assert SCORE_KEYS <= set(r) and "methodology" in r
    m = r["methodology"]
    assert {"indicators", "categories", "data_sources", "bands", "minimum_history", "recalculation"} <= set(m)


def test_distribution_contract():
    with Session(engine) as s:
        dist = svc.distribution(s)
        rows = svc.latest_scores(s)
    assert set(dist) == {"Low", "Medium", "High", "Insufficient data"}
    assert sum(dist.values()) == len(rows)
    assert dist["Insufficient data"] == sum(1 for r in rows if r["band"] is None)


def test_risk_score_endpoint_requires_auth_and_existing_participant():
    assert client().get("/participants/1/risk-score").status_code == 401
    assert client().get("/participants/999999/risk-score", headers=h(BUSINESS)).status_code == 404


if __name__ == "__main__":
    run_module(globals())

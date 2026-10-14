"""Compliance Monitoring checks (SRS §5.8 REQ-COMP-001..011, §6.1, §6.2, §6.4,
§6.5, §8.4, §9.2, §9.4, §11.4, §13, §14.1, §14.5, §15.1, §19.3).

Run against a seeded database:
    DATABASE_URL=sqlite:////tmp/compliance.db STORAGE_BACKEND=local \
    LOCAL_STORAGE_DIR=/tmp/compliance-storage RATE_LIMIT_ENABLED=false \
    python -m app.seed_demo && python -m tests.test_compliance
(or under pytest). Every test creates its own participant and records, so
the file can be re-run against the same database."""

from datetime import date, datetime, timedelta

from sqlalchemy import text
from sqlmodel import Session, select

from tests.pipeline_support import (
    BUSINESS,
    COMPLIANCE,
    GOOD_ROWS,
    TECHNICAL,
    client,
    csv_bytes,
    h,
    http_fetch_via_app,
    make_participant,
    make_source,
    make_template,
    run_module,
    setup_manual,
    wait_job,
)

from app.db import _upgrade_compliance, engine  # noqa: E402
from app.models.admin import EmailOutbox, Notification  # noqa: E402
from app.models.compliance import ComplianceCycle, ComplianceRequirement  # noqa: E402
from app.models.enums import SubmissionResult  # noqa: E402
from app.models.integration import Integration  # noqa: E402
from app.models.issue import Issue, RemediationAction  # noqa: E402
from app.models.submission import Submission  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import compliance as svc, compliance_jobs, notifications, pipeline_runner  # noqa: E402

COMPLIANCE_LEAD = "compliance.lead@rswitch.rw"
BAD_ROWS = ["TX1,2026-09-01,not-a-number,POS", "TX2,2026-09-02,2500,Mobile"]
REASON = "Totals don't reconcile with the settlement report for the 3rd."


def c():
    cl = client()
    with Session(engine) as s:
        if s.exec(select(User).where(User.email == COMPLIANCE_LEAD)).first() is None:
            from app.seed_demo import main as seed_demo

            seed_demo()
    return cl


def uid(email: str) -> int:
    with Session(engine) as s:
        return s.exec(select(User).where(User.email == email)).one().id


def today() -> date:
    with Session(engine) as s:
        return svc.today_for(s)


def create_requirement(participant_id: int, *, template_id=None, doc_type_id=None, kind="Data Return", frequency="Monthly",
                       due: date | None = None, name: str = "Monthly transaction return", email: str = COMPLIANCE):
    return c().post("/compliance/requirements", headers=h(email), json={
        "participant_id": participant_id, "requirement_name": name, "regulatory_reference": "BNR Directive 07/2024",
        "kind": kind, "template_id": template_id, "doc_type_id": doc_type_id, "frequency": frequency,
        "due_date": (due or today() + timedelta(days=10)).isoformat()})


def data_return(frequency="Monthly", due: date | None = None):
    participant, template, source = setup_manual()
    r = create_requirement(participant["id"], template_id=template["id"], frequency=frequency, due=due)
    assert r.status_code == 201, r.text
    return participant, template, source, r.json()


def upload(participant_id: int, requirement_id: int, rows=GOOD_ROWS, *, email=COMPLIANCE, **form):
    fields = {"participant_id": str(participant_id), "period": "2026-09", "requirement_id": str(requirement_id)}
    fields.update({k: str(v) for k, v in form.items() if v is not None})
    return c().post("/compliance/submissions", data=fields, files={"file": ("r.csv", csv_bytes(rows), "text/csv")}, headers=h(email))


def review(submission_id: int, decision: str, *, email=COMPLIANCE, reason: str = "", notes: str = ""):
    return c().put(f"/compliance/submissions/{submission_id}/review", headers=h(email),
                   json={"decision": decision, "rejection_reason": reason, "notes": notes})


def requirement(requirement_id: int) -> dict:
    r = c().get(f"/compliance/requirements/{requirement_id}", headers=h(BUSINESS))
    assert r.status_code == 200, r.text
    return r.json()


def set_cycle(cycle_id: int, **fields) -> None:
    with Session(engine) as s:
        cycle = s.get(ComplianceCycle, cycle_id)
        for k, v in fields.items():
            setattr(cycle, k, v)
        s.add(cycle)
        s.commit()
        svc.recompute(s, cycle)
        s.commit()


def notified(email: str, key: str) -> int:
    with Session(engine) as s:
        return len(s.exec(select(Notification).where(Notification.user_id == uid(email), Notification.dedupe_key == key)).all())


def emailed(address: str, key: str) -> int:
    with Session(engine) as s:
        return len(s.exec(select(EmailOutbox).where(EmailOutbox.to_address == address, EmailOutbox.dedupe_key == key)).all())


# ---- register (REQ-COMP-001/002, §11.4) ---------------------------------------

def test_due_date_must_be_future_and_manage_is_compliance_only():
    participant, template, _ = setup_manual()
    for due in (today(), today() - timedelta(days=3)):
        r = create_requirement(participant["id"], template_id=template["id"], due=due)
        assert r.status_code == 422 and r.json()["detail"][0]["field"] == "due_date", r.text
    r = c().post("/compliance/requirements", headers=h(COMPLIANCE), json={"participant_id": participant["id"]})
    fields = {p["field"] for p in r.json()["detail"]}
    assert r.status_code == 422 and {"requirement_name", "regulatory_reference", "kind", "frequency", "due_date"} <= fields
    assert create_requirement(participant["id"], template_id=template["id"], email=BUSINESS).status_code == 403
    assert create_requirement(participant["id"], template_id=template["id"], email=TECHNICAL).status_code == 403
    r = create_requirement(participant["id"], template_id=template["id"])
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["submission_status"] == "Pending" and len(body["cycles"]) == 1 and body["regulatory_reference"] == "BNR Directive 07/2024"
    assert create_requirement(participant["id"], template_id=template["id"]).status_code == 409  # same name, still active
    # Business and Technical view the register.
    rows = c().get(f"/compliance/requirements?participant_id={participant['id']}", headers=h(TECHNICAL)).json()
    assert [r["id"] for r in rows] == [body["id"]]
    # Edits: a new due date must be in the future too; deactivate keeps history.
    r = c().put(f"/compliance/requirements/{body['id']}", headers=h(COMPLIANCE), json={"due_date": (today() - timedelta(days=1)).isoformat()})
    assert r.status_code == 422 and r.json()["detail"][0]["field"] == "due_date"
    new_due = today() + timedelta(days=20)
    r = c().put(f"/compliance/requirements/{body['id']}", headers=h(COMPLIANCE), json={"due_date": new_due.isoformat()})
    assert r.status_code == 200 and r.json()["due_date"] == new_due.isoformat() and len(r.json()["cycles"]) == 1
    assert c().put(f"/compliance/requirements/{body['id']}", headers=h(BUSINESS), json={"requirement_name": "x"}).status_code == 403
    r = c().post(f"/compliance/requirements/{body['id']}/deactivate", headers=h(COMPLIANCE))
    assert r.status_code == 200 and r.json()["active"] is False


def test_next_due_date_per_frequency():
    assert svc.next_due_date(date(2026, 1, 31), "Monthly", 31) == date(2026, 2, 28)
    assert svc.next_due_date(date(2026, 2, 28), "Monthly", 31) == date(2026, 3, 31)
    assert svc.next_due_date(date(2026, 10, 10), "Monthly", 10) == date(2026, 11, 10)
    assert svc.next_due_date(date(2026, 11, 30), "Quarterly", 30) == date(2027, 2, 28)
    assert svc.next_due_date(date(2026, 10, 30), "Quarterly", 30) == date(2027, 1, 30)
    assert svc.next_due_date(date(2028, 2, 29), "Annual", 29) == date(2029, 2, 28)
    assert svc.next_due_date(date(2026, 10, 30), "Ad hoc") is None


# ---- lifecycle (§6.1, §6.4, §8.4, §9.2) ------------------------------------------

def test_full_lifecycle_with_illegal_transitions():
    participant, template, source, req = data_return()
    pid, rid = participant["id"], req["id"]
    # Business can't upload; Technical can (compliance.upload).
    assert upload(pid, rid, email=BUSINESS).status_code == 403
    r = c().post("/compliance/submissions", headers=h(COMPLIANCE), data={"participant_id": str(pid), "period": "2026-09"},
                 files={"file": ("r.csv", csv_bytes(GOOD_ROWS), "text/csv")})
    assert r.status_code == 422 and r.json()["detail"][0]["field"] == "requirement_id"

    # §6.1 4a / §6.4 step 2: a failing file → Validation Failed, nothing to review.
    r = upload(pid, rid, BAD_ROWS, email=TECHNICAL)
    assert r.status_code == 422 and r.json()["detail"]["errors"][0]["row"] == 1
    failed = r.json()["detail"]["submission"]
    assert failed["status"] == "Validation Failed"
    assert requirement(rid)["submission_status"] == "Validation Failed"
    assert review(failed["id"], "Under Review").status_code == 422  # only valid files are reviewed
    # §6.4 step 3: follow-up recorded → Pending Correction; a fresh request on a pending cycle is refused.
    cycle_id = requirement(rid)["cycle"]["id"]
    assert c().post(f"/compliance/cycles/{cycle_id}/request-correction", headers=h(BUSINESS), json={}).status_code == 403
    r = c().post(f"/compliance/cycles/{cycle_id}/request-correction", headers=h(COMPLIANCE), json={"note": "Called the bank"})
    assert r.status_code == 200 and r.json()["submission_status"] == "Pending Correction"
    # §6.4 6a: the corrected file fails again → Validation Failed again, chained.
    again = upload(pid, rid, BAD_ROWS).json()["detail"]["submission"]
    assert again["replaces_submission_id"] == failed["id"]
    assert requirement(rid)["submission_status"] == "Validation Failed"
    # §6.4 step 6: a passing correction → Submitted; earlier attempts kept.
    r = upload(pid, rid)
    assert r.status_code == 201, r.text
    good = r.json()["submission"]
    assert good["replaces_submission_id"] == again["id"] and good["status"] == "Submitted"
    detail = requirement(rid)
    assert detail["submission_status"] == "Submitted" and len(detail["cycles"][0]["items"]) == 3
    queue = c().get(f"/compliance/review-queue?participant_id={pid}", headers=h(BUSINESS)).json()
    entry = next(e for e in queue["awaiting_review"] if e["item"]["id"] == good["id"])
    assert [x["id"] for x in entry["chain"]] == [again["id"], failed["id"]] and entry["chain"][0]["errors"]

    # §8.4: Submitted → Under Review → Approved | Rejected, nothing skipped.
    assert review(good["id"], "Approved").status_code == 409
    assert review(good["id"], "Rejected", reason=REASON).status_code == 409
    assert review(good["id"], "Under Review", email=BUSINESS).status_code == 403
    assert review(good["id"], "Under Review", email=TECHNICAL).status_code == 403
    assert review(good["id"], "Maybe").status_code == 422
    r = review(good["id"], "Under Review")
    assert r.status_code == 200 and r.json()["requirement"]["submission_status"] == "Under Review"
    assert review(good["id"], "Under Review").status_code == 409
    # §11.4: the rejection reason is mandatory, at least 20 characters.
    r = review(good["id"], "Rejected", reason="Too short")
    assert r.status_code == 422 and r.json()["detail"][0]["field"] == "rejection_reason"
    assert review(good["id"], "Rejected").status_code == 422
    r = review(good["id"], "Rejected", reason=REASON, notes="Checked against settlement")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["item"]["status"] == "Rejected" and body["item"]["rejection_reason"] == REASON
    assert body["requirement"]["submission_status"] == "Rejected" and body["requirement"]["rejection_reason"] == REASON
    assert review(good["id"], "Approved").status_code == 409  # decided
    # §13: rejected → Compliance users in-app (follow up offline); the participant is not emailed.
    with Session(engine) as s:
        rows = s.exec(select(Notification).where(Notification.user_id == uid(COMPLIANCE),
                                                 Notification.dedupe_key.startswith(f"submission_rejected:SUB-{good['id']}:"))).all()
        assert len(rows) == 1 and REASON in rows[0].message
        assert not s.exec(select(EmailOutbox).where(EmailOutbox.event == "submission_rejected")).first()

    # Correct the rejected file, then approve it.
    fixed = upload(pid, rid, replaces_submission_id=good["id"]).json()["submission"]
    assert fixed["replaces_submission_id"] == good["id"]
    assert review(fixed["id"], "Under Review").status_code == 200
    r = review(fixed["id"], "Approved", notes="Reconciled")
    assert r.status_code == 200, r.text
    detail = r.json()["requirement"]
    first, nxt = detail["cycles"][1], detail["cycles"][0]
    assert first["status"] == "Approved" and first["on_time"] is True and first["approved_submission_id"] == fixed["id"]
    assert len(first["items"]) == 4  # every attempt of the cycle is kept (§6.4)
    assert nxt["status"] == "Pending" and nxt["due_date"] == svc.next_due_date(date.fromisoformat(first["due_date"]), "Monthly").isoformat()
    assert detail["submission_status"] == "Pending" and detail["due_date"] == nxt["due_date"]
    assert notified(COMPLIANCE, f"submission_approved:SUB-{fixed['id']}") == 1
    with Session(engine) as s:
        sub = s.get(Submission, fixed["id"])
        assert sub.reviewed_by == "Compliance Officer" and sub.review_status == "Approved" and sub.review_note == "Reconciled"


def test_approval_rolls_next_cycle_for_each_frequency():
    for frequency, months in (("Monthly", 1), ("Quarterly", 3), ("Annual", 12), ("Ad hoc", None)):
        due = today() + timedelta(days=9)
        participant, _, _, req = data_return(frequency, due)
        sub = upload(participant["id"], req["id"]).json()["submission"]
        review(sub["id"], "Under Review")
        detail = review(sub["id"], "Approved").json()["requirement"]
        if months is None:
            assert len(detail["cycles"]) == 1 and detail["submission_status"] == "Approved"
            # A delivery for a closed Ad hoc obligation opens a new cycle.
            nxt = upload(participant["id"], req["id"]).json()["submission"]
            assert len(requirement(req["id"])["cycles"]) == 2 and nxt["status"] == "Submitted"
        else:
            expected = svc.next_due_date(due, frequency, due.day)
            assert len(detail["cycles"]) == 2 and detail["cycles"][0]["due_date"] == expected.isoformat(), (frequency, detail["cycles"][0])
            assert detail["cycles"][0]["period"] == svc.period_label(expected, frequency)


def test_document_requirement_review():
    participant = make_participant()
    with Session(engine) as s:
        from app.models.document import RequiredDocumentType

        doc_type = s.exec(select(RequiredDocumentType).where(RequiredDocumentType.name == "Operating licence")).one()
    req = create_requirement(participant["id"], kind="Document", doc_type_id=doc_type.id, frequency="Annual",
                             name="Operating licence renewal").json()
    r = c().post("/documents/upload", headers=h(TECHNICAL), files={"file": ("licence.pdf", b"%PDF-1.4 demo", "application/pdf")},
                 data={"participant_id": str(participant["id"]), "doc_type_id": str(doc_type.id), "expiry_date": "2027-12-31"})
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["requirement_id"] == req["id"] and doc["review_status"] == "Submitted"
    assert requirement(req["id"])["submission_status"] == "Submitted"
    url = f"/compliance/documents/{doc['id']}/review"
    assert c().put(url, headers=h(COMPLIANCE), json={"decision": "Approved"}).status_code == 409
    assert c().put(url, headers=h(COMPLIANCE), json={"decision": "Under Review"}).status_code == 200
    r = c().put(url, headers=h(COMPLIANCE), json={"decision": "Approved"})
    assert r.status_code == 200
    detail = r.json()["requirement"]
    assert detail["cycles"][1]["status"] == "Approved" and detail["cycles"][0]["status"] == "Pending"
    rows = c().get(f"/compliance/documents?participant_id={participant['id']}", headers=h(BUSINESS)).json()
    row = next(x for x in rows if x["doc_type_id"] == doc_type.id)
    assert row["document"]["id"] == doc["id"] and row["expiry_status"] == "On File" and row["requirement"]["id"] == req["id"]


# ---- Overdue (§9.2, §8.4, §6.5 step 4) --------------------------------------------

def test_overdue_rules():
    participant, _, _, req = data_return(due=today() + timedelta(days=2))
    rid, pid = req["id"], participant["id"]
    cycle_id = req["cycles"][0]["id"]
    # Nothing sent and the deadline passes → Overdue.
    set_cycle(cycle_id, due_date=today() - timedelta(days=1))
    assert requirement(rid)["submission_status"] == "Overdue"
    # A valid file received in time is not penalised while it awaits review.
    sub = upload(pid, rid).json()["submission"]
    with Session(engine) as s:
        row = s.get(Submission, sub["id"])
        row.uploaded_at = datetime.utcnow() - timedelta(days=3)
        s.add(row)
        s.commit()
    set_cycle(cycle_id)
    assert requirement(rid)["submission_status"] == "Submitted"
    review(sub["id"], "Under Review")
    assert requirement(rid)["submission_status"] == "Under Review"
    # §8.4: rejected after the deadline → Overdue, and it stays Overdue while the
    # late correction waits for review, until a submission is approved.
    review(sub["id"], "Rejected", reason=REASON)
    assert requirement(rid)["submission_status"] == "Overdue"
    late = upload(pid, rid).json()["submission"]
    assert requirement(rid)["submission_status"] == "Overdue" and requirement(rid)["stage"] == "Submitted"
    review(late["id"], "Under Review")
    assert requirement(rid)["submission_status"] == "Overdue"
    detail = review(late["id"], "Approved").json()["requirement"]
    assert detail["cycles"][1]["status"] == "Approved" and detail["cycles"][1]["on_time"] is False
    overdue = c().get("/compliance/calendar", headers=h(BUSINESS)).json()["overdue"]
    assert cycle_id not in [o["cycle_id"] for o in overdue]


# ---- ingestion hook (§6.1, §6.5 step 3) ---------------------------------------------

def test_hook_links_automated_pull():
    from app.routers.integrations import demo_feed_key

    feed_columns = [("period_start", "date", True), ("channel_code", "enum", True), ("txn_count", "number", True),
                    ("txn_value_rwf", "number", True)]
    participant = make_participant(type="E-money Issuer")
    template = make_template(participant["id"], feed_columns, name="Hourly summary")
    source = make_source(participant["id"], template["id"], integration_mode="Automated API",
                         endpoint_url=f"http://testserver/integrations/demo-feed/{participant['code']}",
                         auth_type="API Key", credentials={"api_key": demo_feed_key(participant["code"])})
    req = create_requirement(participant["id"], template_id=template["id"], name="Daily mobile money summary").json()
    original = pipeline_runner.fetch
    pipeline_runner.fetch = http_fetch_via_app()
    try:
        with Session(engine) as s:
            job = pipeline_runner.enqueue(s, integration=s.get(Integration, source["id"]), trigger="Manual sync", triggered_by="test")
            job_id = job.id
        assert wait_job(job_id)["status"] == "Completed"
    finally:
        pipeline_runner.fetch = original
    with Session(engine) as s:
        pulled = s.exec(select(Submission).where(Submission.integration_id == source["id"])).one()
        assert pulled.requirement_id == req["id"] and pulled.uploaded_by == "Automated API sync"
        assert svc.cycle_of(s, pulled).id == req["cycles"][0]["id"]
    detail = requirement(req["id"])
    assert detail["submission_status"] == "Submitted" and detail["cycles"][0]["items"][0]["automated"] is True


# ---- reminders and escalation (§6.5, REQ-COMP-005, §13) ----------------------------

def test_deadline_reminders_to_compliance_and_participant_with_dedupe():
    contact = f"returns-{datetime.utcnow():%H%M%S%f}@example.rw"
    participant, template, _ = setup_manual()
    with Session(engine) as s:
        from app.models.participant import Participant

        p = s.get(Participant, participant["id"])
        p.primary_contact_email = contact
        s.add(p)
        s.commit()
    due = today() + timedelta(days=7)
    req = create_requirement(participant["id"], template_id=template["id"], due=due).json()
    far = create_requirement(participant["id"], template_id=template["id"], due=today() + timedelta(days=40), name="Annual return",
                             frequency="Annual").json()
    cycle = req["cycles"][0]["id"]
    with Session(engine) as s:
        compliance_jobs.run(s, today())
        compliance_jobs.run(s, today())  # the next tick repeats nothing
    key = f"{cycle}:{due.isoformat()}:7"
    assert notified(COMPLIANCE, f"compliance_deadline_reminder:{key}") == 1
    assert notified(COMPLIANCE_LEAD, f"compliance_deadline_reminder:{key}") == 1
    assert emailed(contact, f"participant_deadline_reminder:{key}") == 1
    assert emailed(contact, f"participant_deadline_reminder:{far['cycles'][0]['id']}:{(today() + timedelta(days=40)).isoformat()}:14") == 0
    with Session(engine) as s:
        compliance_jobs.run(s, due - timedelta(days=1))  # the 1-day lead
        compliance_jobs.run(s, today())
    assert emailed(contact, f"participant_deadline_reminder:{cycle}:{due.isoformat()}:1") == 1
    assert emailed(contact, f"participant_deadline_reminder:{cycle}:{due.isoformat()}:14") == 0
    # Once a valid file is in hand there's nothing to remind about, even if the deadline moves.
    upload(participant["id"], req["id"])
    moved = today() + timedelta(days=1)
    set_cycle(cycle, due_date=moved)
    with Session(engine) as s:
        compliance_jobs.run(s, today())
    assert emailed(contact, f"participant_deadline_reminder:{cycle}:{moved.isoformat()}:1") == 0
    assert notified(COMPLIANCE, f"compliance_deadline_reminder:{cycle}:{moved.isoformat()}:1") == 0


def test_overdue_escalates_to_senior_compliance():
    contact = f"overdue-{datetime.utcnow():%H%M%S%f}@example.rw"
    participant = make_participant(primary_contact_email=contact)
    template = make_template(participant["id"])
    make_source(participant["id"], template["id"])
    req = create_requirement(participant["id"], template_id=template["id"], due=today() + timedelta(days=3)).json()
    cycle_id = req["cycles"][0]["id"]
    due = today() - timedelta(days=2)
    with Session(engine) as s:
        cycle = s.get(ComplianceCycle, cycle_id)
        cycle.due_date = due
        s.add(cycle)
        s.commit()
        compliance_jobs.run(s, today())
        compliance_jobs.run(s, today())
        assert s.get(ComplianceRequirement, req["id"]).submission_status == "Overdue"
        assert s.get(ComplianceCycle, cycle_id).overdue_at is not None
    key = f"{cycle_id}:{due.isoformat()}"
    assert notified(COMPLIANCE, f"submission_overdue:{key}") == 1
    assert notified(COMPLIANCE, f"submission_overdue_escalation:{key}") == 0
    assert notified(COMPLIANCE_LEAD, f"submission_overdue_escalation:{key}") == 1
    assert notified(COMPLIANCE_LEAD, f"submission_overdue:{key}") == 0
    assert emailed(contact, f"participant_overdue:{key}:0") == 1
    assert emailed("compliance.lead@rswitch.rw", f"submission_overdue_escalation:{key}") == 1  # email + in-app (§13)
    with Session(engine) as s:
        compliance_jobs.run(s, today() + timedelta(days=7))  # a week later: one more reminder to the institution
        compliance_jobs.run(s, today())  # back to the real date for the other tests
    assert emailed(contact, f"participant_overdue:{key}:1") == 1


# ---- incidents (§6.2, §9.4, REQ-COMP-006/007/010/011) ------------------------------

def test_incident_workflow_and_permissions():
    participant = make_participant()
    body = {"participant_id": participant["id"], "description": "Settlement file delivered after cut-off", "severity": "High",
            "incident_date": today().isoformat(), "owner_id": uid(BUSINESS)}
    assert c().post("/compliance/incidents", headers=h(BUSINESS), json=body).status_code == 403
    assert c().post("/compliance/incidents", headers=h(TECHNICAL), json=body).status_code == 403
    r = c().post("/compliance/incidents", headers=h(COMPLIANCE), json={**body, "severity": "Severe", "incident_date": "2999-01-01"})
    assert r.status_code == 422 and {p["field"] for p in r.json()["detail"]} >= {"incident_date"}
    r = c().post("/compliance/incidents", headers=h(COMPLIANCE), json=body)
    assert r.status_code == 201, r.text
    inc = r.json()
    iid = inc["id"]
    assert inc["status"] == "Open" and inc["owner"]["id"] == uid(BUSINESS) and inc["raised_by"]["id"] == uid(COMPLIANCE)
    assert inc["assignee"] == "Business Analyst" and inc["ref"].startswith("INC-")
    # §13 incident created → assigned owner, email + in-app.
    assert notified(BUSINESS, f"incident_created:{iid}:{uid(BUSINESS)}") == 1
    assert emailed(BUSINESS, f"incident_created:{iid}:{uid(BUSINESS)}") == 1
    url = f"/compliance/incidents/{iid}"
    action = {"description": "Agree a new delivery schedule", "owner_id": uid(TECHNICAL), "due_date": (today() + timedelta(days=3)).isoformat()}
    # Remediation can't start before the owner acknowledges (§6.2 order).
    assert c().post(f"{url}/actions", headers=h(COMPLIANCE), json=action).status_code == 409
    # Only the assigned owner acknowledges; Business can't edit.
    assert c().put(url, headers=h(COMPLIANCE), json={"status": "Under Investigation"}).status_code == 403
    assert c().put(url, headers=h(BUSINESS), json={"description": "changed"}).status_code == 403
    assert c().put(url, headers=h(COMPLIANCE), json={"status": "Resolved"}).status_code == 409
    r = c().put(url, headers=h(BUSINESS), json={"status": "Under Investigation"})
    assert r.status_code == 200 and r.json()["status"] == "Under Investigation" and r.json()["acknowledged_at"]
    # Compliance adds remediation action items → Remediation In Progress.
    assert c().post(f"{url}/actions", headers=h(BUSINESS), json=action).status_code == 403
    r = c().post(f"{url}/actions", headers=h(COMPLIANCE), json={**action, "due_date": (today() - timedelta(days=1)).isoformat()})
    assert r.status_code == 422 and r.json()["detail"][0]["field"] == "due_date"
    r = c().post(f"{url}/actions", headers=h(COMPLIANCE), json=action)
    assert r.status_code == 201 and r.json()["status"] == "Remediation In Progress"
    action_id = r.json()["actions"][0]["id"]
    # Resolving needs every action complete; only the action's owner completes it.
    assert c().put(url, headers=h(COMPLIANCE), json={"status": "Resolved", "resolution_summary": "Fixed"}).status_code == 409
    assert c().post(f"{url}/actions/{action_id}/complete", headers=h(BUSINESS), json={}).status_code == 403
    assert c().post(f"{url}/actions/{action_id}/complete", headers=h(COMPLIANCE), json={}).status_code == 403
    r = c().post(f"{url}/actions/{action_id}/complete", headers=h(TECHNICAL), json={"note": "Schedule agreed"})
    assert r.status_code == 200 and r.json()["actions"][0]["status"] == "Completed"
    r = c().put(url, headers=h(COMPLIANCE), json={"status": "Resolved"})
    assert r.status_code == 422 and r.json()["detail"][0]["field"] == "resolution_summary"
    assert c().put(url, headers=h(COMPLIANCE), json={"status": "Closed"}).status_code == 409  # resolve first
    r = c().put(url, headers=h(COMPLIANCE), json={"status": "Resolved", "resolution_summary": "New schedule agreed and met for two weeks."})
    assert r.status_code == 200 and r.json()["status"] == "Resolved" and r.json()["resolved_at"]
    r = c().put(url, headers=h(COMPLIANCE), json={"status": "Closed"})
    assert r.status_code == 200 and r.json()["status"] == "Closed" and r.json()["closed_at"]
    assert c().put(url, headers=h(COMPLIANCE), json={"severity": "Low"}).status_code == 409  # read-only
    assert c().put(url, headers=h(COMPLIANCE), json={"status": "Open"}).status_code == 409
    rows = c().get(f"/compliance/reports/incidents?participant_id={participant['id']}", headers=h(BUSINESS)).json()
    assert rows[0]["status"] == "Closed" and rows[0]["resolution_summary"].startswith("New schedule")
    assert set(rows[0]) >= {"ref", "participant_name", "severity", "description", "raised_at", "status", "resolved_at", "resolution_summary"}


def test_remediation_overdue_escalates_to_senior_compliance():
    participant = make_participant()
    inc = c().post("/compliance/incidents", headers=h(COMPLIANCE), json={
        "participant_id": participant["id"], "description": "Duplicate IDs", "severity": "Critical",
        "incident_date": today().isoformat(), "owner_id": uid(COMPLIANCE)}).json()
    url = f"/compliance/incidents/{inc['id']}"
    c().put(url, headers=h(COMPLIANCE), json={"status": "Under Investigation"})
    r = c().post(f"{url}/actions", headers=h(COMPLIANCE), json={"description": "Add a duplicate check", "owner_id": uid(TECHNICAL),
                                                                 "due_date": (today() + timedelta(days=1)).isoformat()})
    action_id = r.json()["actions"][0]["id"]
    due = today() - timedelta(days=2)
    with Session(engine) as s:
        action = s.get(RemediationAction, action_id)
        action.due_date = due
        s.add(action)
        s.commit()
        notifications.generate(s)
        notifications.generate(s)
    key = f"incident_remediation_overdue:{action_id}:{due.isoformat()}"
    assert notified(COMPLIANCE_LEAD, key) == 1 and emailed(COMPLIANCE_LEAD, key) == 1
    assert notified(COMPLIANCE, key) == 0  # seniors only
    detail = c().get(url, headers=h(TECHNICAL)).json()
    assert detail["actions"][0]["status"] == "Overdue" and detail["actions"][0]["can_complete"] is True
    assert c().get("/compliance/dashboard", headers=h(BUSINESS)).json()["overdue_action_items"]["incident_remediation"] >= 1


# ---- rates, history, dashboard, reports (REQ-COMP-008/009, §14.1, §15.1) -----------

def test_failure_and_adherence_rates_and_history():
    participant, _, _, req = data_return(due=today() + timedelta(days=5))
    pid, rid = participant["id"], req["id"]
    with Session(engine) as s:
        assert svc.failure_rate(s, pid)["rate_pct"] is None and svc.adherence_rate(s, pid)["rate_pct"] is None
    upload(pid, rid, BAD_ROWS)
    rejected = upload(pid, rid).json()["submission"]
    review(rejected["id"], "Under Review")
    review(rejected["id"], "Rejected", reason=REASON)
    good = upload(pid, rid).json()["submission"]
    review(good["id"], "Under Review")
    detail = review(good["id"], "Approved").json()["requirement"]
    with Session(engine) as s:
        rate = svc.failure_rate(s, pid, 12)
    assert rate["total"] == 3 and rate["failed_or_rejected"] == 2 and rate["validation_failed"] == 1 and rate["rejected"] == 1
    assert rate["rate_pct"] == 66.7
    # Adherence: one cycle approved with an on-time file, one missed.
    first, nxt = detail["cycles"][1]["id"], detail["cycles"][0]["id"]
    with Session(engine) as s:
        sub = s.get(Submission, good["id"])
        sub.uploaded_at = datetime.utcnow() - timedelta(days=12)
        s.add(sub)
        s.commit()
    set_cycle(first, due_date=today() - timedelta(days=10))
    set_cycle(nxt, due_date=today() - timedelta(days=2))
    with Session(engine) as s:
        adherence = svc.adherence_rate(s, pid, 12)
    assert adherence == {**adherence, "on_time": 1, "total": 2, "rate_pct": 50.0}
    out = c().get(f"/compliance/participants/{pid}", headers=h(BUSINESS)).json()
    assert out["failure_rate"]["rate_pct"] == 66.7 and out["adherence"]["rate_pct"] == 50.0
    assert out["summary"]["overdue"] == 1 and out["overdue"][0]["cycle_id"] == nxt
    assert {"requirements", "upcoming_deadlines", "overdue", "documents"} <= set(out)
    events = c().get(f"/compliance/participants/{pid}/history", headers=h(TECHNICAL)).json()
    types = [e["type"] for e in events]
    assert types.count("submission_validation_failed") == 1 and "submission_rejected" in types and "submission_approved" in types
    assert "deadline_missed" in types
    assert [e["at"] for e in events] == sorted(e["at"] for e in events)
    corrections = [e for e in events if e["type"] == "submission_received" and e["replaces_id"]]
    assert corrections  # the correction chain is visible in the history
    rates = c().get("/compliance/failure-rates", headers=h(BUSINESS)).json()
    assert next(r for r in rates if r["participant_id"] == pid)["failure"]["rate_pct"] == 66.7


def test_dashboard_summary_and_report_rows_shape():
    r = c().get("/compliance/dashboard", headers=h(COMPLIANCE))
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d["overdue_submissions"], int)
    assert set(d["open_incidents"]) == {"Critical", "High", "Medium", "Low", "total"}
    assert set(d["compliance_rate_30d"]) >= {"rate_pct", "on_time", "total", "window_start"}
    assert set(d["overdue_action_items"]) == {"governance", "incident_remediation", "total"}
    assert len(d["recent_activity"]) <= 10
    assert [e["at"] for e in d["recent_activity"]] == sorted((e["at"] for e in d["recent_activity"]), reverse=True)
    horizon = (date.fromisoformat(d["as_of"]) + timedelta(days=30)).isoformat()
    assert all(d["as_of"] <= x["due_date"] <= horizon and x["status"] not in ("Approved", "Overdue") for x in d["upcoming_deadlines"])
    cal = c().get("/compliance/calendar", headers=h(TECHNICAL)).json()
    assert (date.fromisoformat(cal["end"]) - date.fromisoformat(cal["start"])).days == 90
    assert all(o["status"] == "Overdue" for o in cal["overdue"])
    rows = c().get("/compliance/reports/summary?status=Overdue", headers=h(BUSINESS)).json()
    assert rows and all(r["status"] == "Overdue" for r in rows)
    assert set(rows[0]) >= {"participant_name", "requirement_name", "due_date", "submission_date", "status", "reviewer", "rejection_reason"}
    with Session(engine) as s:
        assert svc.dashboard_summary(s)["overdue_submissions"] == d["overdue_submissions"]


# ---- /issues backward compatibility and the schema upgrade ---------------------------

def test_issues_api_backward_compatible():
    participant = make_participant()
    old = {"participant_id": participant["id"], "description": "Legacy client issue", "severity": "Medium", "assignee": "Business Analyst"}
    assert c().post("/issues", headers=h(BUSINESS), json=old).status_code == 403
    r = c().post("/issues", headers=h(COMPLIANCE), json=old)
    assert r.status_code == 201, r.text
    issue = r.json()
    assert issue["status"] == "Open" and issue["owner"]["id"] == uid(BUSINESS)
    rows = c().get("/issues", headers=h(TECHNICAL)).json()
    statuses = {"Open", "Under Investigation", "Remediation In Progress", "Resolved", "Closed"}
    for row in rows:
        assert {"id", "participant_id", "description", "severity", "assignee", "status", "due_date", "notes", "created_at"} <= set(row)
        assert row["status"] in statuses
    r = c().patch(f"/issues/{issue['id']}", headers=h(BUSINESS), json={"status": "Under Investigation"})
    assert r.status_code == 200 and r.json()["status"] == "Under Investigation"
    assert issue["id"] in [i["id"] for i in c().get("/issues/mine", headers=h(BUSINESS)).json()]


def test_upgrade_converts_legacy_rows():
    participant = make_participant()
    now = datetime.utcnow().isoformat(sep=" ")
    if engine.dialect.name == "postgresql":  # a database created fresh has no pre-SRS enum label; add it as an old one had
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("ALTER TYPE issuestatus ADD VALUE IF NOT EXISTS 'in_progress'"))
    with engine.begin() as conn:
        for description in ("legacy in progress", "legacy with remediation"):
            conn.execute(text(
                "INSERT INTO issue (participant_id, description, severity, status, assignee, resolution_summary, notes, created_at) "
                "VALUES (:p, :d, 'high', 'in_progress', '', '', '', :t)"), {"p": participant["id"], "d": description, "t": now})
    with engine.connect() as conn:
        ids = dict(conn.execute(text("SELECT description, id FROM issue WHERE participant_id = :p"), {"p": participant["id"]}).all())
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO remediationaction (incident_id, description, owner_id, due_date, status, completed_by, "
                          "completion_note, created_by, created_at) VALUES (:i, 'x', :o, :d, 'Open', '', '', '', :t)"),
                     {"i": ids["legacy with remediation"], "o": uid(TECHNICAL), "d": today().isoformat(), "t": now})
    legacy = []
    with Session(engine) as s:
        for result, review_status, note in ((SubmissionResult.failed, "Pending Review", ""), (SubmissionResult.passed, "Approved", ""),
                                            (SubmissionResult.passed, "Rejected", "Old reason from the review note"),
                                            (SubmissionResult.passed, "Pending Review", "")):
            sub = Submission(participant_id=participant["id"], period="2025-01", filename="old.csv", storage_key="x", result=result,
                             status="Submitted", review_status=review_status, review_note=note)
            s.add(sub)
            s.commit()
            legacy.append(sub.id)
    _upgrade_compliance()
    _upgrade_compliance()  # idempotent
    with Session(engine) as s:
        assert s.get(Issue, ids["legacy in progress"]).status.value == "Under Investigation"
        assert s.get(Issue, ids["legacy with remediation"]).status.value == "Remediation In Progress"
        assert s.get(Issue, ids["legacy in progress"]).incident_date is not None
        subs = [s.get(Submission, i) for i in legacy]
        assert [x.status for x in subs] == ["Validation Failed", "Approved", "Rejected", "Submitted"]
        assert subs[2].rejection_reason == "Old reason from the review note"


if __name__ == "__main__":
    run_module(globals())

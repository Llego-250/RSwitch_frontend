"""Governance module checks (SRS §5.7 REQ-GOV-001..011, §6.3, §9.4, §10.6,
§13, §19.5).

Run against a seeded database:
    DATABASE_URL=sqlite:////tmp/governance.db STORAGE_BACKEND=local \
    LOCAL_STORAGE_DIR=/tmp/governance-storage RATE_LIMIT_ENABLED=false \
    python -m app.seed_demo && python -m tests.test_governance
(or under pytest). Every test creates its own uniquely named records, so the
file can be re-run against the same database."""

import io
import os
import sys
import tempfile
from datetime import datetime, timedelta
from uuid import uuid4

if "DATABASE_URL" not in os.environ:  # self-contained fallback
    _tmp = tempfile.mkdtemp(prefix="rdip-governance-")
    os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/governance.db"
    os.environ.setdefault("STORAGE_BACKEND", "local")
    os.environ.setdefault("LOCAL_STORAGE_DIR", f"{_tmp}/storage")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.core.security import create_access_token  # noqa: E402
from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.admin import AuditEvent, EmailOutbox, Notification  # noqa: E402
from app.models.governance import ActionItem, GovernanceCommittee  # noqa: E402
from app.models.participant import Participant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import governance_jobs  # noqa: E402

COMPLIANCE = "compliance@rswitch.rw"
COMPLIANCE_LEAD = "compliance.lead@rswitch.rw"
BUSINESS = "business@rswitch.rw"
BUSINESS_LEAD = "business.lead@rswitch.rw"
TECHNICAL = "admin@rswitch.rw"

PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_client: TestClient | None = None
_tokens: dict[str, str] = {}


def client() -> TestClient:
    """One app instance for the whole run. The background scheduler is
    stopped so its 15-minute jobs can't race the reminder assertions."""
    global _client
    if _client is None:
        _client = TestClient(app)
        _client.__enter__()
        scheduler = getattr(app.state, "scheduler", None)
        if scheduler is not None:
            scheduler.shutdown(wait=True)
        with Session(engine) as session:
            if session.exec(select(User).where(User.email == COMPLIANCE)).first() is None:
                from app.seed_demo import main as seed_demo

                seed_demo()
    return _client


def auth(email: str) -> dict:
    client()
    if email not in _tokens:
        _tokens[email] = create_access_token(email)
    return {"Authorization": f"Bearer {_tokens[email]}"}


def user_id(email: str) -> int:
    with Session(engine) as session:
        return session.exec(select(User).where(User.email == email)).one().id


def participant(code: str) -> Participant:
    with Session(engine) as session:
        return session.exec(select(Participant).where(Participant.code == code)).one()


def today():
    with Session(engine) as session:
        return governance_jobs.org_today(session)


def new_committee(chair: str = COMPLIANCE_LEAD, kind: str = "Technical Working Group") -> dict:
    r = client().post(
        "/governance/committees",
        json={"name": f"Test {kind} {uuid4().hex[:8]}", "type": kind, "chair_id": user_id(chair)},
        headers=auth(COMPLIANCE),
    )
    assert r.status_code == 201, r.text
    return r.json()


def upload(committee_id: int, *, title="Test paper", category="Working Paper", access="Internal",
           filename="paper.pdf", content=PDF_BYTES, mime="application/pdf", meeting_id=None, as_user=COMPLIANCE,
           version="v1.0"):
    data = {"title": title, "category": category, "committee_id": str(committee_id), "version": version,
            "access_level": access}
    if meeting_id is not None:
        data["meeting_id"] = str(meeting_id)
    return client().post(
        "/governance/documents", data=data, files={"file": (filename, io.BytesIO(content), mime)}, headers=auth(as_user)
    )


def field_error(response) -> dict:
    detail = response.json()["detail"]
    assert isinstance(detail, list) and detail, detail
    return detail[0]


# ---- REQ-GOV-011 permissions ---------------------------------------------------

def test_view_roles_can_read_but_not_manage():
    for email in (COMPLIANCE, BUSINESS, TECHNICAL):
        for path in ("/governance/committees", "/governance/documents", "/governance/meetings",
                     "/governance/action-items", "/governance/action-items/overdue", "/governance/directory"):
            r = client().get(path, headers=auth(email))
            assert r.status_code == 200, (email, path, r.text)
    committee = new_committee()
    for email in (BUSINESS, TECHNICAL):
        r = client().post("/governance/committees", json={"name": f"X {uuid4().hex}", "type": "Board"}, headers=auth(email))
        assert r.status_code == 403
        assert r.json()["detail"] == "You do not have permission to perform this action."
        assert upload(committee["id"], as_user=email).status_code == 403
        r = client().post("/governance/meetings", json={"committee_id": committee["id"], "scheduled_at": "2030-01-01T08:00:00Z",
                                                        "agenda": "x", "attendee_user_ids": [user_id(BUSINESS)]}, headers=auth(email))
        assert r.status_code == 403
        r = client().post("/governance/action-items", json={"description": "x", "committee_id": committee["id"],
                                                            "owner_user_id": user_id(BUSINESS),
                                                            "due_date": str(today() + timedelta(days=3))}, headers=auth(email))
        assert r.status_code == 403


# ---- REQ-GOV-001 / 008 committees & membership ------------------------------------

def test_committee_membership_register():
    committee = new_committee(chair=TECHNICAL)
    cid = committee["id"]
    assert committee["chair"]["email"] == TECHNICAL
    staff = client().post(f"/governance/committees/{cid}/members", json={"user_id": user_id(BUSINESS), "role": "Secretary"},
                          headers=auth(COMPLIANCE))
    assert staff.status_code == 201, staff.text
    rep = client().post(
        f"/governance/committees/{cid}/members",
        json={"participant_id": participant("KVU").id, "name": "Test Rep", "email": "Test.Rep@kivubank.rw", "role": "Member"},
        headers=auth(COMPLIANCE),
    )
    assert rep.status_code == 201, rep.text
    assert rep.json()["kind"] == "representative" and rep.json()["institution"] == "Kivu Commercial Bank"
    # Duplicate, chair-as-member and invalid email are refused.
    dup = client().post(f"/governance/committees/{cid}/members", json={"user_id": user_id(BUSINESS)}, headers=auth(COMPLIANCE))
    assert dup.status_code == 409
    chair = client().post(f"/governance/committees/{cid}/members", json={"user_id": user_id(TECHNICAL)}, headers=auth(COMPLIANCE))
    assert chair.status_code == 409
    bad = client().post(f"/governance/committees/{cid}/members",
                        json={"participant_id": participant("KVU").id, "name": "No Email", "email": "nope"},
                        headers=auth(COMPLIANCE))
    assert bad.status_code == 422 and field_error(bad)["field"] == "email"

    listed = next(c for c in client().get("/governance/committees", headers=auth(BUSINESS)).json() if c["id"] == cid)
    assert listed["staff_count"] == 1 and listed["representative_count"] == 1
    assert listed["is_member"] is True  # business@ sits on it

    r = client().delete(f"/governance/committees/{cid}/members/{rep.json()['id']}", headers=auth(COMPLIANCE))
    assert r.status_code == 200
    r = client().put(f"/governance/committees/{cid}", json={"is_active": False}, headers=auth(COMPLIANCE))
    assert r.status_code == 200 and r.json()["is_active"] is False
    with Session(engine) as session:
        actions = session.exec(select(AuditEvent.action).where(AuditEvent.resource.contains(committee["name"]))).all()
    assert {"GOV_COMMITTEE_CREATE", "GOV_MEMBER_ADD", "GOV_MEMBER_REMOVE", "GOV_COMMITTEE_UPDATE"} <= set(actions)


# ---- REQ-GOV-002 / 003 documents ------------------------------------------------------

def test_document_file_type_rejection():
    cid = new_committee()["id"]
    r = upload(cid, filename="notes.txt", content=b"plain text", mime="text/plain")
    assert r.status_code == 422
    assert field_error(r)["field"] == "file" and field_error(r)["rule"] == "allowed_types"
    assert "PDF, Word" in field_error(r)["message"]
    r = upload(cid, filename="image.png", content=b"\x89PNG\r\n", mime="image/png")
    assert r.status_code == 422
    # A renamed file is caught by its contents.
    r = upload(cid, filename="fake.pdf", content=b"MZ\x90\x00 not a pdf", mime="application/pdf")
    assert r.status_code == 422 and field_error(r)["rule"] == "content_matches_type"
    r = upload(cid, category="Gossip")
    assert r.status_code == 422 and field_error(r)["field"] == "category"
    r = upload(cid, version="latest")
    assert r.status_code == 422 and field_error(r)["field"] == "version"

    ok = upload(cid, filename="matrix.xlsx", content=b"PK\x03\x04rest-of-zip", mime=XLSX_MIME, category="Other", version="2.0")
    assert ok.status_code == 201, ok.text
    doc = ok.json()
    assert doc["version"] == "v2.0" and doc["uploaded_by"] == "Compliance Officer" and doc["committee_id"] == cid
    assert doc["content_type"] == XLSX_MIME and doc["access_level"] == "Internal"


def test_document_versions_keep_old_downloadable():
    cid = new_committee()["id"]
    first = upload(cid, title="Charter", category="Policy").json()
    second = client().post(
        f"/governance/documents/{first['id']}/versions", data={"version": "v1.1"},
        files={"file": ("charter-v1.1.pdf", io.BytesIO(PDF_BYTES + b"v1.1"), "application/pdf")}, headers=auth(COMPLIANCE),
    )
    assert second.status_code == 201, second.text
    dup = client().post(
        f"/governance/documents/{first['id']}/versions", data={"version": "v1.1"},
        files={"file": ("again.pdf", io.BytesIO(PDF_BYTES), "application/pdf")}, headers=auth(COMPLIANCE),
    )
    assert dup.status_code == 409
    listed = [d for d in client().get(f"/governance/documents?committee_id={cid}", headers=auth(BUSINESS)).json()]
    assert len(listed) == 1
    assert listed[0]["version"] == "v1.1" and [v["version"] for v in listed[0]["versions"]] == ["v1.0"]
    old = client().get(f"/governance/documents/{first['id']}/download", headers=auth(BUSINESS))
    assert old.status_code == 200 and old.content == PDF_BYTES


def test_restricted_document_visibility():
    committee = new_committee(chair=BUSINESS_LEAD, kind="Board")
    cid = committee["id"]
    r = client().post(f"/governance/committees/{cid}/members", json={"user_id": user_id(TECHNICAL)}, headers=auth(COMPLIANCE))
    assert r.status_code == 201
    secret = upload(cid, title=f"Restricted {uuid4().hex[:6]}", category="Decision", access="Restricted").json()
    public = upload(cid, title=f"Internal {uuid4().hex[:6]}", category="Policy").json()

    def ids(email):
        return {d["id"] for d in client().get("/governance/documents", headers=auth(email)).json()}

    # Non-member (business@): the restricted document does not exist for them.
    assert secret["id"] not in ids(BUSINESS) and public["id"] in ids(BUSINESS)
    assert client().get(f"/governance/documents/{secret['id']}/download", headers=auth(BUSINESS)).status_code == 404
    # Member (admin@), chair (business.lead@) and governance manager (compliance@) see it.
    for email in (TECHNICAL, BUSINESS_LEAD, COMPLIANCE):
        assert secret["id"] in ids(email), email
        assert client().get(f"/governance/documents/{secret['id']}/download", headers=auth(email)).status_code == 200
    # Committee document count reflects only what the viewer may see.
    count = {e: next(c for c in client().get("/governance/committees", headers=auth(e)).json() if c["id"] == cid)["document_count"]
             for e in (BUSINESS, TECHNICAL)}
    assert count == {BUSINESS: 1, TECHNICAL: 2}
    # Making a document Restricted later hides every version of it.
    r = client().patch(f"/governance/documents/{public['id']}", json={"access_level": "Restricted"}, headers=auth(COMPLIANCE))
    assert r.status_code == 200
    assert public["id"] not in ids(BUSINESS)


# ---- REQ-GOV-004 / 005, §6.3 meetings -----------------------------------------------------

def test_meeting_invites_minutes_and_decisions():
    committee = new_committee(chair=COMPLIANCE_LEAD, kind="Steering Committee")
    cid = committee["id"]
    rep_email = f"rep-{uuid4().hex[:6]}@akagera-sc.rw"
    rep = client().post(f"/governance/committees/{cid}/members",
                        json={"participant_id": participant("AKS").id, "name": "Akagera Rep", "email": rep_email},
                        headers=auth(COMPLIANCE)).json()
    when = (datetime.utcnow() + timedelta(days=10)).replace(microsecond=0)
    missing = client().post("/governance/meetings", json={"committee_id": cid, "scheduled_at": when.isoformat() + "Z", "agenda": "",
                                                          "attendee_user_ids": [user_id(BUSINESS)]}, headers=auth(COMPLIANCE))
    assert missing.status_code == 422 and field_error(missing)["field"] == "agenda"
    created = client().post(
        "/governance/meetings",
        json={"title": "Test steering session", "committee_id": cid, "scheduled_at": when.isoformat() + "Z",
              "agenda": "1. Scorecard\n2. AOB", "attendee_user_ids": [user_id(BUSINESS)], "attendee_member_ids": [rep["id"]]},
        headers=auth(COMPLIANCE),
    )
    assert created.status_code == 201, created.text
    meeting = created.json()
    assert meeting["status"] == "Upcoming" and len(meeting["attendees"]) == 2
    key = f"gov-meeting:{meeting['id']}:invite:{when.isoformat()}"
    with Session(engine) as session:
        assert session.exec(select(Notification).where(Notification.dedupe_key == key,
                                                       Notification.user_id == user_id(BUSINESS))).first()
        assert session.exec(select(EmailOutbox).where(EmailOutbox.dedupe_key == key, EmailOutbox.to_address == rep_email)).first()
    # Re-saving the same attendees doesn't re-invite anyone.
    r = client().put(f"/governance/meetings/{meeting['id']}",
                     json={"attendee_user_ids": [user_id(BUSINESS)], "attendee_member_ids": [rep["id"]]}, headers=auth(COMPLIANCE))
    assert r.status_code == 200
    with Session(engine) as session:
        assert len(session.exec(select(Notification).where(Notification.dedupe_key == key)).all()) == 1
        assert len(session.exec(select(EmailOutbox).where(EmailOutbox.dedupe_key == key)).all()) == 2

    # After the meeting: minutes uploaded and linked (§6.3 step 2) ...
    minutes = upload(cid, title="Minutes — test session", category="Minutes", meeting_id=meeting["id"])
    assert minutes.status_code == 201, minutes.text
    detail = client().get(f"/governance/meetings/{meeting['id']}", headers=auth(BUSINESS)).json()
    assert detail["minutes"]["id"] == minutes.json()["id"]
    assert [d["id"] for d in detail["documents"]] == [minutes.json()["id"]]
    # ... decisions recorded via PUT (§19.5) ...
    r = client().put(f"/governance/meetings/{meeting['id']}", json={"decisions": ["Adopt the scorecard", " ", "Meet monthly"]},
                     headers=auth(COMPLIANCE))
    assert r.status_code == 200 and r.json()["decisions"] == ["Adopt the scorecard", "Meet monthly"]
    # ... and action items linked to the meeting (§6.3 step 3).
    item = client().post("/governance/action-items", json={
        "description": "Circulate the scorecard", "committee_id": cid, "meeting_id": meeting["id"],
        "owner_participant_id": participant("AKS").id, "due_date": str(today() + timedelta(days=14))}, headers=auth(COMPLIANCE))
    assert item.status_code == 201, item.text
    detail = client().get(f"/governance/meetings/{meeting['id']}", headers=auth(TECHNICAL)).json()
    assert [a["id"] for a in detail["action_item_list"]] == [item.json()["id"]]
    assert detail["action_items"]["open"] == 1
    # A new minutes version keeps the meeting pointed at the newest one.
    v2 = client().post(f"/governance/documents/{minutes.json()['id']}/versions", data={"version": "v1.1"},
                       files={"file": ("minutes-v1.1.pdf", io.BytesIO(PDF_BYTES), "application/pdf")}, headers=auth(COMPLIANCE))
    assert v2.status_code == 201
    detail = client().get(f"/governance/meetings/{meeting['id']}", headers=auth(BUSINESS)).json()
    assert detail["minutes"]["id"] == v2.json()["id"] and detail["minutes"]["version"] == "v1.1"
    # Business users can't edit meetings.
    assert client().put(f"/governance/meetings/{meeting['id']}", json={"agenda": "x"}, headers=auth(BUSINESS)).status_code == 403
    # Rescheduling notifies the invitees again.
    later = when + timedelta(days=1)
    client().put(f"/governance/meetings/{meeting['id']}", json={"scheduled_at": later.isoformat() + "Z"}, headers=auth(COMPLIANCE))
    with Session(engine) as session:
        assert session.exec(select(Notification).where(
            Notification.dedupe_key == f"gov-meeting:{meeting['id']}:invite:{later.isoformat()}")).first()
    # A representative who has since left the committee stays on the record.
    client().delete(f"/governance/committees/{cid}/members/{rep['id']}", headers=auth(COMPLIANCE))
    r = client().put(f"/governance/meetings/{meeting['id']}",
                     json={"attendee_user_ids": [user_id(BUSINESS)], "attendee_member_ids": [rep["id"]]}, headers=auth(COMPLIANCE))
    assert r.status_code == 200, r.text
    assert sorted(a["name"] for a in r.json()["attendees"]) == ["Akagera Rep", "Business Analyst"]


def test_meeting_calendar_range():
    cid = new_committee()["id"]
    when = datetime(2031, 3, 14, 8, 0)
    r = client().post("/governance/meetings", json={"committee_id": cid, "scheduled_at": when.isoformat() + "Z",
                                                    "agenda": "Calendar check", "attendee_user_ids": [user_id(COMPLIANCE)]},
                      headers=auth(COMPLIANCE))
    assert r.status_code == 201
    march = client().get("/governance/meetings?start=2031-03-01&end=2031-03-31", headers=auth(BUSINESS)).json()
    assert r.json()["id"] in [m["id"] for m in march]
    april = client().get("/governance/meetings?start=2031-04-01&end=2031-04-30", headers=auth(BUSINESS)).json()
    assert r.json()["id"] not in [m["id"] for m in april]


# ---- REQ-GOV-006, §9.4, §6.3 step 6 action items ------------------------------------------

def test_action_item_status_rules():
    cid = new_committee()["id"]
    due = str(today() + timedelta(days=10))
    past = client().post("/governance/action-items", json={"description": "x", "committee_id": cid,
                                                           "owner_user_id": user_id(BUSINESS), "due_date": str(today() - timedelta(days=1))},
                         headers=auth(COMPLIANCE))
    assert past.status_code == 422 and field_error(past)["field"] == "due_date"
    both = client().post("/governance/action-items", json={"description": "x", "committee_id": cid, "owner_user_id": user_id(BUSINESS),
                                                           "owner_participant_id": participant("KVU").id, "due_date": due},
                         headers=auth(COMPLIANCE))
    assert both.status_code == 422 and field_error(both)["field"] == "owner"

    mine = client().post("/governance/action-items", json={"description": "Business-owned", "committee_id": cid,
                                                           "owner_user_id": user_id(BUSINESS), "due_date": due},
                         headers=auth(COMPLIANCE)).json()
    theirs = client().post("/governance/action-items", json={"description": "Institution-owned", "committee_id": cid,
                                                             "owner_participant_id": participant("KVU").id, "due_date": due},
                           headers=auth(COMPLIANCE)).json()
    assert mine["status"] == "Open" and mine["owner"]["type"] == "user"
    assert theirs["owner"] == {"type": "institution", "id": participant("KVU").id, "name": "Kivu Commercial Bank",
                               "email": participant("KVU").primary_contact_email}

    # The owner sees they can update it; other viewers can't.
    listed = {a["id"]: a for a in client().get(f"/governance/action-items?committee_id={cid}", headers=auth(BUSINESS)).json()}
    assert listed[mine["id"]]["can_update_status"] is True and listed[theirs["id"]]["can_update_status"] is False
    # Owner: In Progress, then Completed (§6.3 step 6).
    r = client().put(f"/governance/action-items/{mine['id']}", json={"status": "In Progress"}, headers=auth(BUSINESS))
    assert r.status_code == 200 and r.json()["status"] == "In Progress"
    r = client().put(f"/governance/action-items/{mine['id']}", json={"status": "Completed"}, headers=auth(BUSINESS))
    assert r.status_code == 200 and r.json()["status"] == "Completed" and r.json()["completed_by"] == "Business Analyst"
    # Owner may not edit anything but status.
    r = client().put(f"/governance/action-items/{mine['id']}", json={"status": "Open", "due_date": due}, headers=auth(BUSINESS))
    assert r.status_code == 403
    # Business / Technical users who don't own it: read-only.
    assert client().put(f"/governance/action-items/{theirs['id']}", json={"status": "Completed"}, headers=auth(BUSINESS)).status_code == 403
    assert client().put(f"/governance/action-items/{mine['id']}", json={"status": "Open"}, headers=auth(TECHNICAL)).status_code == 403
    # Overdue is system-managed.
    r = client().put(f"/governance/action-items/{theirs['id']}", json={"status": "Overdue"}, headers=auth(COMPLIANCE))
    assert r.status_code == 422 and field_error(r)["rule"] == "system_managed"
    # Compliance can manage anything (complete on behalf of an institution, reopen).
    r = client().put(f"/governance/action-items/{theirs['id']}", json={"status": "Completed"}, headers=auth(COMPLIANCE))
    assert r.status_code == 200 and r.json()["status"] == "Completed"
    r = client().put(f"/governance/action-items/{mine['id']}", json={"status": "Open"}, headers=auth(COMPLIANCE))
    assert r.status_code == 200 and r.json()["status"] == "Open"
    with Session(engine) as session:
        actions = set(session.exec(select(AuditEvent.action).where(AuditEvent.resource.contains("Business-owned"))).all())
    assert {"GOV_ACTION_ITEM_CREATE", "GOV_ACTION_ITEM_STATUS"} <= actions


def _insert_item(committee_id: int, due_in: int, *, owner_email=None, owner_code=None, status="Open", created_days_ago=30) -> int:
    with Session(engine) as session:
        committee = session.get(GovernanceCommittee, committee_id)
        owner_user = session.exec(select(User).where(User.email == owner_email)).one() if owner_email else None
        institution = session.exec(select(Participant).where(Participant.code == owner_code)).one() if owner_code else None
        item = ActionItem(
            description=f"Scheduled-check item {uuid4().hex[:6]}", committee=committee.name, committee_id=committee.id,
            owner=owner_user.full_name if owner_user else institution.name,
            owner_user_id=owner_user.id if owner_user else None, owner_participant_id=institution.id if institution else None,
            due_date=governance_jobs.org_today(session) + timedelta(days=due_in), status=status,
            created_at=datetime.utcnow() - timedelta(days=created_days_ago),
        )
        session.add(item)
        session.commit()
        return item.id


def test_overdue_dashboard_grouped_by_committee():
    a = new_committee()
    b = new_committee(kind="Operational Working Group")
    late = [_insert_item(a["id"], -3, owner_email=BUSINESS), _insert_item(a["id"], -9, owner_code="NYM"),
            _insert_item(b["id"], -1, owner_email=COMPLIANCE, status="In Progress")]
    _insert_item(a["id"], 4, owner_email=BUSINESS)  # not overdue
    groups = {g["committee_id"]: g for g in client().get("/governance/action-items/overdue", headers=auth(TECHNICAL)).json()}
    assert groups[a["id"]]["count"] == 2 and groups[b["id"]]["count"] == 1
    assert [i["id"] for i in groups[a["id"]]["items"]] == [late[1], late[0]]  # most overdue first
    assert groups[a["id"]]["max_days_overdue"] == 9
    assert all(i["status"] == "Overdue" for g in groups.values() for i in g["items"])
    assert groups[a["id"]]["chair"]["email"] == COMPLIANCE_LEAD


# ---- REQ-GOV-009 / 010, §13 scheduled reminders & escalation -------------------------------

def _deliveries(key_prefix: str) -> tuple[list[Notification], list[EmailOutbox]]:
    with Session(engine) as session:
        notes = session.exec(select(Notification).where(Notification.dedupe_key.startswith(key_prefix))).all()
        mails = session.exec(select(EmailOutbox).where(EmailOutbox.dedupe_key.startswith(key_prefix))).all()
        return list(notes), list(mails)


def test_reminders_and_overdue_escalation_with_dedupe():
    cid = new_committee(chair=COMPLIANCE_LEAD)["id"]
    seven = _insert_item(cid, 7, owner_email=BUSINESS)
    one = _insert_item(cid, 1, owner_code="KVU")
    late = _insert_item(cid, -1, owner_email=TECHNICAL)
    fresh = _insert_item(cid, 5, owner_email=BUSINESS, created_days_ago=0)  # created after its 7-day mark

    for _ in range(2):  # the second tick must not repeat anything
        with Session(engine) as session:
            governance_jobs.run(session)

        notes, mails = _deliveries(f"gov-action:{seven}:")
        assert [(n.event, n.user_id) for n in notes] == [("action_item_due_7d", user_id(BUSINESS))]
        assert [(m.event, m.to_address) for m in mails] == [("action_item_due_7d", BUSINESS)]
        assert notes[0].title == "Action item due in 7 days"

        notes, mails = _deliveries(f"gov-action:{one}:")
        assert notes == []  # institution owners have no login: email only
        assert [(m.event, m.to_address) for m in mails] == [("action_item_due_1d", participant("KVU").primary_contact_email)]

        notes, mails = _deliveries(f"gov-action:{late}:")
        assert sorted((n.event, n.user_id) for n in notes) == sorted(
            [("action_item_overdue", user_id(COMPLIANCE_LEAD)), ("action_item_overdue", user_id(TECHNICAL))])
        assert sorted(m.to_address for m in mails) == sorted([COMPLIANCE_LEAD, TECHNICAL])  # chair + owner

        assert _deliveries(f"gov-action:{fresh}:") == ([], [])

    with Session(engine) as session:
        assert session.get(ActionItem, late).status == "Overdue"
        assert session.get(ActionItem, seven).status == "Open"
        assert session.exec(select(AuditEvent).where(AuditEvent.action == "GOV_ACTION_ITEM_OVERDUE",
                                                     AuditEvent.resource.startswith(f"#{late} "))).first()


def test_overdue_reverts_when_due_date_extended():
    cid = new_committee()["id"]
    item_id = _insert_item(cid, -2, owner_email=BUSINESS, status="In Progress")
    with Session(engine) as session:
        governance_jobs.run(session)
        assert session.get(ActionItem, item_id).status == "Overdue"
    r = client().put(f"/governance/action-items/{item_id}", json={"due_date": str(today() + timedelta(days=5))},
                     headers=auth(COMPLIANCE))
    assert r.status_code == 200 and r.json()["status"] == "Open"


def test_legacy_rows_are_linked():
    with Session(engine) as session:
        legacy = ActionItem(description=f"Legacy {uuid4().hex[:6]}", owner="Business Analyst", committee="Board",
                            due_date=governance_jobs.org_today(session) + timedelta(days=30), completed=True)
        session.add(legacy)
        session.commit()
        governance_jobs.backfill_legacy(session)
        session.refresh(legacy)
        board = session.get(GovernanceCommittee, legacy.committee_id)
        assert board.name == "Board of Directors"
        assert legacy.owner_user_id == session.exec(select(User).where(User.email == BUSINESS)).one().id
        assert legacy.status == "Completed"


if __name__ == "__main__":
    failures = 0
    for name, fn in [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]:
        try:
            fn()
            print(f"PASS {name}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            import traceback

            traceback.print_exc()
            print(f"FAIL {name}: {exc!r}")
    print(f"{'FAILED' if failures else 'OK'}: {failures} failure(s)")
    sys.exit(1 if failures else 0)

"""Financial inclusion checks (SRS §5.10 REQ-FIN-001..008, §14.4, §2.7).

Run against a seeded database:
    DATABASE_URL=sqlite:////tmp/ai.db STORAGE_BACKEND=local \
    LOCAL_STORAGE_DIR=/tmp/ai-storage RATE_LIMIT_ENABLED=false \
    python -m app.seed_demo && python -m tests.test_inclusion
(or under pytest). Each test reports its own synthetic returns for a unique
year nothing else uses and filters to it, so the demo data never affects the
numbers asserted."""

import io
import os
import random
import sys
import tempfile
from datetime import datetime
from uuid import uuid4

if "DATABASE_URL" not in os.environ:  # self-contained fallback
    _tmp = tempfile.mkdtemp(prefix="rdip-fin-")
    os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/fin.db"
    os.environ.setdefault("STORAGE_BACKEND", "local")
    os.environ.setdefault("LOCAL_STORAGE_DIR", f"{_tmp}/storage")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

from fastapi.testclient import TestClient  # noqa: E402
from openpyxl import load_workbook  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.admin import ReportRun  # noqa: E402
from app.models.enums import SubmissionResult, UserRole  # noqa: E402
from app.models.participant import Participant  # noqa: E402
from app.models.submission import Submission  # noqa: E402
from app.models.template import TemplateColumn  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import inclusion, reporting  # noqa: E402
from app.services.ingestion import aggregate, identity_fields, read_rows, validate_rows  # noqa: E402
from app.storage import put_file  # noqa: E402

_client: TestClient | None = None
_users: dict[str, User] = {}
NUMBERS = ("accounts", "active_users", "transaction_count", "transaction_value")


def client() -> TestClient:
    global _client
    if _client is None:
        _client = TestClient(app, raise_server_exceptions=False)
        _client.__enter__()
        scheduler = getattr(app.state, "scheduler", None)
        if scheduler is not None:
            scheduler.shutdown(wait=True)
    return _client


def auth(kind: str) -> dict:
    client()
    if kind not in _users:
        role = {"compliance": UserRole.compliance, "business": UserRole.business, "technical": UserRole.technical}[kind]
        with Session(engine) as s:
            u = User(email=f"fin-{kind}-{uuid4().hex[:8]}@rswitch.rw", full_name=f"FIN test {kind}", role=role,
                     hashed_password=hash_password("Strong-Pass-2026!"))
            s.add(u)
            s.commit()
            s.refresh(u)
            _users[kind] = u
    return {"Authorization": f"Bearer {create_access_token(_users[kind].email)}"}


_taken: set[int] = set()


def unique_year() -> int:
    """A reporting year no submission in the database uses yet."""
    client()  # app startup creates the tables on a fresh database
    with Session(engine) as s:
        used = {int(p[-4:]) for p in s.exec(select(Submission.period)).all() if p and p[-4:].isdigit()}
    year = random.choice([y for y in range(1900, 2000) if y not in used | _taken])
    _taken.add(year)
    return year


def institution(kind: str, region: str) -> Participant:
    code = f"FIN{uuid4().hex[:6].upper()}"
    with Session(engine) as s:
        p = Participant(name=f"FIN-{code}", code=code, short_name=code, type=kind, region=region)
        s.add(p)
        s.commit()
        s.refresh(p)
        return p


def report_return(p: Participant, period: str, rows: list[dict], *, review_status: str = "Approved",
                  extra_columns: tuple = ()) -> Submission:
    """Upload an aggregate return through the shared ingestion functions."""
    with_region = "region" in rows[0]
    names = (["region"] if with_region else []) + [*NUMBERS, *extra_columns]
    columns = [TemplateColumn(template_id=0, name=n, type="enum" if n == "region" else "number", position=i)
               for i, n in enumerate(names)]
    data = "\n".join([",".join(names)] + [",".join(str(r[n]) for n in names) for r in rows]).encode()
    table = read_rows("return.csv", data)
    errors, _ = validate_rows(table, columns)
    assert not errors, errors
    transactions, totals, breakdowns = aggregate(table.rows, *identity_fields(columns))
    key = f"tests/inclusion/{uuid4().hex}.csv"
    put_file(key, data, "text/csv")
    with Session(engine) as s:
        sub = Submission(participant_id=p.id, period=datetime.strptime(period, "%Y-%m").strftime("%B %Y"),
                         filename=f"{p.code}_FIN.csv", storage_key=key, uploaded_at=datetime(2026, 1, 15, 9),
                         uploaded_by="test", result=SubmissionResult.passed, row_count=transactions,
                         numeric_totals=totals, breakdowns=breakdowns, review_status=review_status,
                         status="Rejected" if review_status == "Rejected" else "Approved", loaded_at=datetime.utcnow())
        s.add(sub)
        s.commit()
        s.refresh(sub)
        return sub


def row(region=None, accounts=0, active=0, count=0, value=0, **extra) -> dict:
    r = {"accounts": accounts, "active_users": active, "transaction_count": count, "transaction_value": value, **extra}
    return {"region": region, **r} if region else r


def dash(kind: str = "business", **params) -> dict:
    r = client().get("/inclusion/dashboard", params=params, headers=auth(kind))
    assert r.status_code == 200, r.text
    return r.json()


def metric(d: dict, key: str) -> dict:
    return next(m for m in d["metrics"] if m["key"] == key)


def scenario() -> tuple[str, str, Participant, Participant]:
    """An MFI reporting two regions over two months and a SACCO whose return
    has no region column, in a year nothing else uses."""
    year = unique_year()
    jan, feb = f"{year}-01", f"{year}-02"
    mfi = institution("MFI", "Northern Province")
    sacco = institution("SACCO", "Western Province")
    report_return(mfi, jan, [row("Northern Province", 90, 30, 200, 20000), row("Eastern Province", 40, 8, 80, 4000)])
    report_return(mfi, feb, [row("Northern Province", 100, 40, 300, 30000), row("Eastern Province", 50, 10, 100, 5000)])
    report_return(sacco, feb, [row(None, 70, 35, 140, 7000)])
    return jan, feb, mfi, sacco


# ---- REQ-FIN-001..006 --------------------------------------------------------------

def test_metrics_segmented_by_type_and_region():
    jan, feb, _, _ = scenario()
    d = dash(period_from=jan, period_to=feb)
    assert d["indicative"] and d["indicative_label"] == "Indicative — metrics to be confirmed with RSwitch"
    # Stock metrics: latest reported period per institution; flows: summed.
    assert metric(d, "accounts")["value"] == 100 + 50 + 70
    assert metric(d, "active_users")["value"] == 40 + 10 + 35
    assert metric(d, "transaction_count")["value"] == 200 + 80 + 300 + 100 + 140
    assert metric(d, "transaction_value")["value"] == 20000 + 4000 + 30000 + 5000 + 7000
    assert metric(d, "activity_rate")["value"] == round(85 / 220 * 100, 1)
    by_type = {r["institution_type"]: r for r in d["by_institution_type"]}
    assert [t for t in by_type if t in inclusion.INSTITUTION_TYPES] == inclusion.INSTITUTION_TYPES  # all four shown
    assert by_type["MFI"]["values"]["accounts"] == 150 and by_type["SACCO"]["values"]["accounts"] == 70
    assert by_type["Commercial Bank"]["values"]["accounts"] is None  # no data ≠ zero
    by_region = {r["region"]: r for r in d["by_region"]}
    assert by_region["Northern Province"]["values"]["accounts"] == 100
    assert by_region["Northern Province"]["region_basis"] == "reported"
    assert by_region["Eastern Province"]["values"]["accounts"] == 50
    assert by_region["Western Province"]["values"]["accounts"] == 70
    assert by_region["Western Province"]["region_basis"] == "registered"
    assert [t["period"] for t in d["trend"]] == [jan, feb]
    assert {(m["institution_type"], m["region"]) for m in d["matrix"]} == {
        ("MFI", "Northern Province"), ("MFI", "Eastern Province"), ("SACCO", "Western Province")}
    # REQ-FIN-006: source and last-updated on every metric with data.
    for m in d["metrics"]:
        assert m["data_source"]
        assert bool(m["last_updated"]) == m["available"]


def test_filters_by_type_region_and_period():
    jan, feb, _, _ = scenario()
    assert metric(dash(period_from=jan, period_to=feb, institution_type="MFI"), "accounts")["value"] == 150
    assert metric(dash(period_from=jan, period_to=feb, region="Eastern Province"), "accounts")["value"] == 50
    only_jan = dash(period_from=jan, period_to=jan)
    assert metric(only_jan, "accounts")["value"] == 90 + 40
    assert metric(only_jan, "transaction_count")["value"] == 280
    # Every role with inclusion.view can view and filter (§12.1).
    for kind in ("compliance", "technical"):
        assert metric(dash(kind, period_from=jan, period_to=feb, institution_type="SACCO"), "accounts")["value"] == 70
    for params, field in (({"period_from": "2026-13"}, "period_from"), ({"institution_type": "Bank"}, "institution_type"),
                          ({"region": "Atlantis"}, "region"), ({"period_from": "2020-05", "period_to": "2020-01"}, "period_from")):
        r = client().get("/inclusion/dashboard", params=params, headers=auth("business"))
        assert r.status_code == 422 and r.json()["detail"][0]["field"] == field, r.text


def test_unavailable_metric_is_labelled_not_invented():
    jan, feb, _, _ = scenario()
    access = metric(dash(period_from=jan, period_to=feb), "access_rate")
    assert access["value"] is None and not access["available"]
    assert access["status"] == "Not available — awaiting data"
    assert "population" in access["data_source"]
    empty = dash(period_from="1980-01", period_to="1980-12")
    assert all(m["value"] is None and m["status"] == "Not available — awaiting data" for m in empty["metrics"])


def test_rejected_returns_are_excluded():
    year = unique_year()
    p = institution("E-money Issuer", "Kigali City")
    report_return(p, f"{year}-03", [row("Kigali City", 10, 5, 20, 200)])
    report_return(p, f"{year}-04", [row("Kigali City", 999, 999, 999, 999)], review_status="Rejected")
    d = dash(period_from=f"{year}-03", period_to=f"{year}-04", institution_type="E-money Issuer")
    assert metric(d, "accounts")["value"] == 10 and metric(d, "transaction_count")["value"] == 20


# ---- REQ-FIN-007 metric registry ----------------------------------------------------

def test_metric_registry_drives_the_dashboard():
    r = client().get("/inclusion/metrics", headers=auth("compliance"))
    assert r.status_code == 200
    keys = [m["key"] for m in r.json()["metrics"]]
    assert keys == [m.key for m in inclusion.REGISTRY]
    assert {"accounts", "active_users", "transaction_count", "transaction_value", "access_rate"} <= set(keys)
    # A new metric is one registry entry — no other change.
    extra = inclusion.Metric("women_accounts", "Accounts held by women", "accounts", "Test metric", "stock",
                             (inclusion.Source("women_accounts", "Test return"),))
    inclusion.REGISTRY.append(extra)
    inclusion.METRICS[extra.key] = extra
    try:
        year = unique_year()
        before = metric(dash(period_from=f"{year}-05", period_to=f"{year}-05"), "women_accounts")
        assert before["status"] == "Not available — awaiting data"
        p = institution("SACCO", "Southern Province")
        report_return(p, f"{year}-05", [row("Southern Province", 30, 10, 20, 100, women_accounts=12)],
                      extra_columns=("women_accounts",))
        after = metric(dash(period_from=f"{year}-05", period_to=f"{year}-05"), "women_accounts")
        assert after["value"] == 12 and after["data_source"].startswith("Test return")
    finally:
        inclusion.REGISTRY.remove(extra)
        inclusion.METRICS.pop(extra.key)


# ---- REQ-FIN-008 / §14.4 export ------------------------------------------------------

def test_export_excel_and_pdf_business_only():
    jan, feb, _, _ = scenario()
    params = {"period_from": jan, "period_to": feb}
    for kind in ("compliance", "technical"):
        r = client().get("/inclusion/export", params={**params, "format": "xlsx"}, headers=auth(kind))
        assert r.status_code == 403
    r = client().get("/inclusion/export", params={**params, "format": "xlsx"}, headers=auth("business"))
    assert r.status_code == 200, r.text
    sheet = load_workbook(io.BytesIO(r.content))["Financial inclusion"]
    rows = list(sheet.iter_rows(values_only=True))
    assert list(rows[0]) == ["Institution type", "Region", "Metric", "Value", "Data source", "Last updated"]
    body = rows[1:]
    assert ("All institution types", "All regions", "Number of accounts", 220) == body[0][:4]
    assert any(r[0] == "MFI" and r[1] == "Eastern Province" and r[2].startswith("Number of accounts") and r[3] == 50
               for r in body)
    assert any(r[:2] == ("MFI", "All regions") and r[2] == "Number of accounts" and r[3] == 150 for r in body)
    assert any(r[:2] == ("All institution types", "Western Province") and r[2] == "Number of accounts" and r[3] == 70
               for r in body)
    assert any(r[2].startswith("Access rate") and r[3] == "Not available — awaiting data" for r in body)
    assert all(r[4] for r in body)
    pdf = client().get("/inclusion/export", params={**params, "format": "pdf"}, headers=auth("business"))
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    run_id = int(pdf.headers["X-Report-Run-Id"])
    with Session(engine) as s:
        run = s.get(ReportRun, run_id)
        assert run.report == "inclusion" and run.format == "pdf" and run.date_from == jan
    r = client().get("/inclusion/export", params={"format": "csv"}, headers=auth("business"))
    assert r.status_code == 422


def test_reports_module_uses_the_14_4_columns():
    with Session(engine) as s:
        rows, columns = reporting.report_rows(s, "inclusion")
    assert columns == inclusion.REPORT_COLUMNS
    assert all(set(r) == set(columns) for r in rows)


def test_no_customer_level_data_in_responses():
    jan, feb, _, _ = scenario()
    d = dash(period_from=jan, period_to=feb)
    allowed = {"institution_type", "region", "values", "last_updated", "reporting", "institutions", "region_basis"}
    for section in ("by_institution_type", "by_region", "matrix"):
        for r in d[section]:
            assert set(r) <= allowed, set(r) - allowed
    assert not any(k.startswith("_") for k in d)


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

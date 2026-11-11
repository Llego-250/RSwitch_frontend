"""OpenAPI / Swagger documentation for the RDIP API.

FastAPI generates the OpenAPI document from the routers; this module adds what
it can't infer: the API overview shown at the top of /docs, a description for
every endpoint group (tag), Swagger UI settings, and two adjustments to the
generated spec (see _post_process). Endpoint summaries and descriptions live
next to each endpoint, in its decorator and docstring.

tests/test_openapi.py keeps this complete: every operation must have a summary,
a description and exactly one tag declared in TAGS_METADATA."""

from fastapi import FastAPI

API_VERSION = "1.0.0"

API_DESCRIPTION = """
The REST API behind the **RSwitch Data Intelligence Platform (RDIP)**: integration
monitoring, data ingestion, compliance tracking, governance, AI decision support,
financial-inclusion analytics and reporting for RSwitch staff. The RDIP web app uses
this API for everything it shows.

## Signing in from this page

Every endpoint except sign-in, password reset, invitation acceptance, the public
logo and the health check needs a signed-in RSwitch staff user (endpoints with a
padlock). Click **Authorize** and use one of these:

| Method | Use it when |
|---|---|
| **OAuth2PasswordBearer**: email and password | The account has no two-step sign-in and the security policy doesn't require it. |
| **BearerToken**: paste a session token | The account uses two-step sign-in. Call `POST /auth/login` with your email and password, then `POST /auth/mfa/verify` with the returned `mfa_token` and your 6-digit code. Paste the `access_token` it returns. |
| **APIKeyHeader**: `X-API-Key` | Scripts and system integrations. Create a key under *Settings → API keys*; it acts as the user who created it. |

Sessions end after the configured period of inactivity (30 minutes by default).

## Roles and permissions

RSwitch staff have one of three roles: **Compliance**, **Business** or
**Technical / Admin**. Each role has its own set of capabilities, and the API
enforces them: a request outside the caller's role is refused with `403`.
Participant institutions never sign in.

## Errors

| Status | Meaning | Body |
|---|---|---|
| `401` | Not signed in, or the session expired | `{"detail": "...", "code": "..."}` |
| `403` | Signed in, but the role doesn't allow this action | `{"detail": "..."}` |
| `404` | The record doesn't exist, or the caller may not see it | `{"detail": "..."}` |
| `400` / `409` / `422` | The input was rejected: invalid, conflicting with existing data, or a failed check | `{"detail": [{"field", "rule", "message"}]}`, one entry per problem |
| `429` | Rate limit reached: 100 requests a minute per user, 1,000 per IP address | `{"detail": "..."}` with a `Retry-After` header |
| `500` | Unexpected server error; details go to the server log, never to the client | `{"detail": "..."}` |

## Data scope

RDIP holds institution-level data only: no customer names, phone numbers or
account numbers.
"""

# Order here is the order of the groups on the Swagger page.
TAGS_METADATA = [
    {"name": "Authentication",
     "description": "Sign-in (password, then a two-step code when enabled), session keep-alive and sign-out, "
                    "password change and reset, invitation acceptance, two-step sign-in enrolment and trusted devices. "
                    "Sign-in, reset and invitation endpoints are public."},
    {"name": "Users & Audit Log",
     "description": "Technical/Admin user management: invite users, change roles, deactivate and reactivate accounts, "
                    "unlock them, send reset links and reset two-step sign-in. Also the audit log of security-relevant "
                    "actions, with CSV export."},
    {"name": "Dashboard",
     "description": "The signed-in user's role-specific home page: its widgets, their filters and the common sections."},
    {"name": "Participants",
     "description": "The institutions connected to RSwitch (commercial banks, e-money issuers, MFIs and SACCOs): "
                    "registration, the Participant 360 profile, submission and incident history, notes, and the "
                    "composite risk score with its methodology."},
    {"name": "Integrations",
     "description": "Each participant's data sources: manual uploads or automated API pulls, connection settings "
                    "(credentials are encrypted at rest and never returned in plain text), health status and an "
                    "on-demand sync."},
    {"name": "Standards & Mapping",
     "description": "Versioned field mappings from a participant's file layout to a canonical target standard: "
                    "draft, publish, version history and clone. Technical/Admin only."},
    {"name": "Ingestion Templates",
     "description": "The expected file schema for each participant: the columns, types and rules every uploaded file "
                    "is validated against. Supporting a new file layout is a data change, not a deployment."},
    {"name": "Submissions",
     "description": "Data files received from participants: manual upload on a participant's behalf, validation "
                    "results with row-and-column error reports, submission history and download of the original file."},
    {"name": "Pipelines",
     "description": "Ingestion jobs and their step-by-step logs, stopping and reprocessing jobs, scheduled pipeline "
                    "configurations (cron) and pipeline settings."},
    {"name": "Compliance",
     "description": "The compliance register of each participant's regulatory obligations, deadline cycles and "
                    "calendar, the review queue for submitted files and documents, incidents with remediation actions, "
                    "failure rates and the rows behind the compliance reports."},
    {"name": "Compliance Documents",
     "description": "Required document types (for example an operating licence) and the documents on file for each "
                    "participant, with their expiry status."},
    {"name": "Incidents (legacy)",
     "description": "The original incident endpoints, kept for pages that still use them. New clients should use the "
                    "incident endpoints under Compliance; writes here follow the same workflow rules."},
    {"name": "Governance",
     "description": "Board, committee and working-group records: committees and their members, versioned governance "
                    "documents with access levels, meetings (agenda, minutes, decisions) and action items with due dates."},
    {"name": "AI Decision Support",
     "description": "Advisory anomaly alerts. Detectors compare each participant with a configured threshold, its own "
                    "rolling history or its peer group, and alerts move through an investigation lifecycle. Nothing "
                    "here changes a participant or an integration."},
    {"name": "Financial Inclusion",
     "description": "Aggregated inclusion metrics by institution type and region, the metric definitions, and PDF or "
                    "Excel export. Institution-level data only."},
    {"name": "Reports",
     "description": "Report types, on-demand generation (PDF, Excel or CSV), report history and download, scheduled "
                    "reports delivered by email, saved report templates, and summary series."},
    {"name": "Notifications",
     "description": "The signed-in user's in-app notifications: the bell, the 90-day history, the unread count, and "
                    "marking notices read or unread."},
    {"name": "Settings",
     "description": "System settings (organisation details and logo, security policy, reminders, risk and anomaly "
                    "thresholds), notification events, API keys and the outbound email log."},
    {"name": "Demo",
     "description": "Demo-only endpoint that imitates a participant's own API so the automated-pull path can be shown "
                    "end to end. It returns synthetic data, not RSwitch data."},
    {"name": "System",
     "description": "Service health check."},
]

LICENSE_INFO = {"name": "Apache 2.0", "identifier": "Apache-2.0"}

SWAGGER_UI_PARAMETERS = {
    "persistAuthorization": True,  # keep the Authorize credentials across page reloads
    "docExpansion": "none",  # start with every group collapsed: there are about 200 operations
    "filter": True,  # search box that filters groups by name
    "displayRequestDuration": True,
}

BEARER_SCHEME = {
    "type": "http",
    "scheme": "bearer",
    "bearerFormat": "JWT",
    "description": "A session token. Get one from POST /auth/login, followed by POST /auth/mfa/verify when the "
                   "account uses two-step sign-in, and paste its access_token here.",
}


def _post_process(schema: dict) -> None:
    """Adjust the generated spec in place.

    1. Offer BearerToken wherever the password flow is accepted. The API
       already accepts any bearer session token there; this only lets Swagger
       users paste one, which is the only way to sign in with two-step codes.
    2. One tag per operation. Routes from a sub-router (Standards & Mapping
       inside Integrations, the demo feed) inherit the parent's tag as well,
       which would list them twice; the last tag is the specific one."""
    schema.setdefault("components", {}).setdefault("securitySchemes", {})["BearerToken"] = BEARER_SCHEME
    for path_item in schema.get("paths", {}).values():
        for operation in path_item.values():
            security = operation.get("security")
            if security and any("OAuth2PasswordBearer" in req for req in security):
                if not any("BearerToken" in req for req in security):
                    security.append({"BearerToken": []})
            tags = operation.get("tags")
            if tags and len(tags) > 1:
                operation["tags"] = [tags[-1]]


def install_openapi(app: FastAPI) -> None:
    """Wrap app.openapi so /openapi.json and /docs serve the adjusted spec."""
    generate = app.openapi

    def openapi() -> dict:
        if app.openapi_schema:
            return app.openapi_schema
        schema = generate()  # builds and caches app.openapi_schema
        _post_process(schema)
        return schema

    app.openapi = openapi

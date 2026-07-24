# Software Requirements Specification
# RSwitch Data Intelligence Platform (RDIP)

---

## 1. Document Information

| Field              | Details                                              |
|--------------------|------------------------------------------------------|
| **Project Name**   | RSwitch Data Intelligence Platform (RDIP)            |
| **Document Version** | v1.1                                               |
| **Date**           | 2026-07-24                                           |
| **Status**         | Draft — Updated per Stakeholder Feedback             |
| **Authors**        | Project Team                                         |
| **Stakeholders**   | RSwitch Board, Compliance Division, Operations Team, Participating Financial Institutions |

### Revision History

| Version | Date       | Author       | Description                        |
|---------|------------|--------------|------------------------------------|
| v0.1    | 2026-07-10 | Project Team | Initial draft                      |
| v1.0    | 2026-07-22 | Project Team | Updated based on RSwitch feedback — reframed from customer to participant model; removed participant portal |
| v1.1    | 2026-07-24 | Project Team | Updated per Raica Kwizera feedback — clarified S&M scope, email integration, AI baseline, risk categories, data flexibility, dynamic filtering, resubmission workflow, alert lifecycle rules (skip-prevention, auto-escalation, closure requirements) |

---

## 2. Introduction

### 2.1 Purpose

This document defines all functional and non-functional requirements of the RSwitch Data Intelligence Platform (RDIP) so that designers, developers, testers, and stakeholders have one authoritative source of truth. It captures requirements derived from stakeholder feedback and governs the design, development, and acceptance of the system.

### 2.2 Scope

RDIP is an internal operational platform designed for RSwitch and its participating financial institutions. It consolidates data integration monitoring, participant compliance tracking, governance coordination, AI-assisted operational insights, and financial inclusion reporting into a single unified system.

The platform serves RSwitch staff across compliance, business, and technical functions. It does not serve individual end-customers of financial institutions directly.

### 2.3 Intended Audience

| Audience                     | Purpose                                            |
|------------------------------|----------------------------------------------------|
| RSwitch Board & Management   | Review governance modules and strategic reports    |
| Compliance Division          | Monitor participant compliance and deadlines       |
| Business / Operations Team   | Track integration status, financial inclusion data |
| Technical / IT Team          | Manage integrations, pipelines, and data mappings  |
| Developers                   | Implement features from this specification         |
| QA / Testers                 | Validate system against these requirements         |
| Participating Institutions   | Submit data, view their own compliance status      |

### 2.4 Business Objectives

1. Give RSwitch a single operational view of all participating financial institutions.
2. Replace manual, fragmented data collection with structured submission workflows that can progressively automate over time.
3. Enable proactive compliance monitoring with automated deadline tracking and escalation.
4. Provide a central governance repository for the board, committees, and working groups.
5. Support AI-assisted identification of unusual patterns and operational risks across participants.
6. Produce financial inclusion reports segmented by institution type and region.

### 2.5 Project Vision

RSwitch operates as Rwanda's national payment switch, connecting commercial banks, e-money issuers, microfinance institutions, and SACCOs. Currently, operational data about participants is scattered across spreadsheets, emails, and disconnected systems. RDIP becomes the authoritative hub where RSwitch staff can monitor every participant's integration health, compliance standing, and operational risk — with a clear path from manual data submissions today to fully automated data exchange in the future.

### 2.6 Assumptions

- Participating institutions will initially submit data manually (uploads/forms); automation is introduced progressively.
- RSwitch will provide sample data for the development team to generate realistic synthetic datasets.
- The platform is a web application accessible via modern browsers; no mobile app is in scope for v1.
- RSwitch controls all user accounts; participant institutions do not self-register.
- AI features will use historical operational data provided by RSwitch; no specific external ML model has been mandated.

### 2.7 Constraints

- The platform must comply with Rwanda's data protection regulations and any applicable financial sector regulatory requirements.
- The system must not store or display individual customer-level transaction data unless specifically approved by RSwitch.
- Initial deployment is on RSwitch's internal infrastructure; cloud migration is out of scope for v1.
- Sample data for development must be provided by the RSwitch team before dashboard finalization.

### 2.8 Out of Scope

- Public-facing portals for individual banking customers.
- Core payment switching or transaction processing (RDIP monitors and reports; it does not process payments).
- Mobile applications (iOS / Android).
- Direct integration with external international payment networks in v1.
- Automated credit scoring or lending decisions for individual customers.

---

## 3. System Overview

### 3.1 What the System Is

RDIP is a web-based operational intelligence and governance platform for RSwitch. It centralizes information from all participating financial institutions — their integration health, data submissions, compliance status, governance documents, and operational metrics — into one secure, role-based interface.

### 3.2 What Problem It Solves

| Problem Today                                    | How RDIP Solves It                                          |
|--------------------------------------------------|-------------------------------------------------------------|
| Participant data spread across emails/spreadsheets | Central submission and monitoring hub                      |
| No visibility into integration failures in real time | Pipeline Monitor with live status per institution          |
| Compliance deadlines tracked manually             | Automated deadline tracking, reminders, and escalation      |
| Governance documents stored in scattered folders  | Central document repository with calendar and action items  |
| No structured way to identify unusual participant behavior | AI-assisted pattern detection and prioritization        |
| Financial inclusion metrics require manual aggregation | Automated reporting by institution type and region       |

### 3.3 Who Uses It

- **RSwitch Compliance Team** — Monitor regulatory deadlines, incidents, participant compliance history.
- **RSwitch Business / Operations Team** — Track financial inclusion metrics, review AI insights, generate reports.
- **RSwitch Technical / Admin Team** — Configure integrations, manage pipelines, define data mappings, manage users.

### 3.4 High-Level Workflow

```
Participant Institution
        │
        │  submits data (manual upload or automated API)
        ▼
  Integrations / Pipeline Monitor
        │
        │  data validated and ingested
        ▼
  Standards & Mapping (normalization)
        │
        │  normalized data stored
        ▼
┌───────────────────────────────────────────┐
│              RDIP Core                    │
│  Participant 360 │ Compliance │ Governance│
│  AI Support      │ Inclusion  │ Reports   │
└───────────────────────────────────────────┘
        │
        │  insights and alerts delivered to
        ▼
   RSwitch Staff (Compliance / Business / Technical)
```

---

## 4. User Types / Roles

### 4.1 Role Definitions

RDIP uses **three primary user groups** as agreed with stakeholders. Access is dynamic and permission-based.

| Role | Label | Description |
|------|-------|-------------|
| `compliance` | Compliance User | Monitors participant compliance, deadlines, incidents, and remediation actions |
| `business` | Business User | Reviews reports, financial inclusion analytics, governance records, and AI insights |
| `technical` | Technical / Admin User | Manages integrations, pipelines, data mappings, system settings, and user accounts |

### 4.2 Permission Overview

| Module                  | Compliance | Business | Technical |
|-------------------------|:----------:|:--------:|:---------:|
| Dashboard               | View       | View     | View      |
| Integrations            | View       | View     | Manage    |
| Pipeline Monitor        | View       | View     | Manage    |
| Standards & Mapping     | View       | —        | Manage    |
| Participant 360         | View       | View     | View      |
| Governance              | Manage     | View     | View      |
| Compliance Monitoring   | Manage     | View     | View      |
| AI Decision Support     | View       | Manage   | View      |
| Financial Inclusion     | View       | Manage   | View      |
| Reports                 | Manage     | Manage   | View      |
| Notifications           | View       | View     | Manage    |
| Users & Security        | —          | —        | Manage    |
| Settings                | —          | View     | Manage    |
| Audit Log               | View       | —        | Manage    |

*Manage = read + write + create + delete. View = read-only.*

---

## 5. Functional Requirements

### 5.1 Authentication & Access Control (AUTH)

| ID | Requirement |
|----|-------------|
| REQ-AUTH-001 | The system SHALL allow users to log in using an email address and password. |
| REQ-AUTH-002 | The system SHALL enforce Multi-Factor Authentication (MFA) via a 6-digit TOTP code for all users. |
| REQ-AUTH-003 | The system SHALL lock an account after 5 consecutive failed login attempts for 30 minutes. |
| REQ-AUTH-004 | The system SHALL allow users to reset their password via a time-limited link sent to their registered email (link expires in 60 minutes). |
| REQ-AUTH-005 | The system SHALL maintain a session timeout of 30 minutes of inactivity, after which the user must re-authenticate. |
| REQ-AUTH-006 | The system SHALL support a "Trust this device for 30 days" option on MFA step. |
| REQ-AUTH-007 | The system SHALL log every login attempt (success and failure) with timestamp, IP address, and user agent. |
| REQ-AUTH-008 | The system SHALL enforce role-based access control (RBAC) so that each user can only access modules permitted by their role. |
| REQ-AUTH-009 | The system SHALL allow Technical/Admin users to assign and modify user roles. |
| REQ-AUTH-010 | The system SHALL display an access-denied message when a user attempts to access a module outside their permissions, without revealing that the module exists. |

### 5.2 Dashboard (DASH)

| ID | Requirement |
|----|-------------|
| REQ-DASH-001 | The system SHALL display a role-aware dashboard as the default landing page after login. |
| REQ-DASH-002 | The dashboard SHALL display KPI widgets relevant to the logged-in user's role (see Section 15). |
| REQ-DASH-003 | The dashboard SHALL display an Attention Queue listing the top unresolved alerts across compliance, integrations, and incidents. |
| REQ-DASH-004 | The dashboard SHALL display a summary of integration health across all participants (healthy / warning / failed count). |
| REQ-DASH-005 | The dashboard SHALL display upcoming compliance deadlines within the next 30 days. |
| REQ-DASH-006 | The dashboard SHALL refresh KPI data automatically every 5 minutes when auto-refresh is enabled. |
| REQ-DASH-007 | The dashboard SHALL allow users to dismiss individual attention queue items for their current session. |
| REQ-DASH-008 | The dashboard SHALL display a Recent Activity log showing the last 10 system events relevant to the user's role. |
| REQ-DASH-009 | Dashboard widgets SHALL support dynamic filtering by: institution name, participant type (Commercial Bank / E-money Issuer / MFI / SACCO), region, status, date range, and risk category. Filters SHALL persist within a user session. |
| REQ-DASH-010 | The dashboard SHALL NOT rely solely on fixed, pre-built views. Users SHALL be able to adjust the period and scope of each widget without navigating away from the dashboard. |

### 5.3 Integrations (INTG)

| ID | Requirement |
|----|-------------|
| REQ-INTG-001 | The system SHALL maintain a catalog of all participating financial institutions and their configured data sources. |
| REQ-INTG-002 | The system SHALL support two integration modes: (a) Manual Upload — institution submits files via the platform; (b) Automated API — system pulls data from institution's endpoint on a schedule. |
| REQ-INTG-003 | The system SHALL display the current status of each integration: Healthy, Warning, Failed, Pending, or Not Configured. |
| REQ-INTG-004 | The system SHALL display the last successful data transfer date/time for each integration. |
| REQ-INTG-005 | The system SHALL allow Technical/Admin users to add new participant integrations, specifying: institution name, integration type, endpoint URL (for API mode), authentication credentials (stored encrypted), and expected submission schedule. |
| REQ-INTG-006 | The system SHALL allow Technical/Admin users to trigger a manual sync for any configured automated integration. |
| REQ-INTG-007 | The system SHALL allow Technical/Admin and Compliance users to upload data files (CSV, Excel, XML) on behalf of a participant institution when in Manual Upload mode. |
| REQ-INTG-008 | The system SHALL validate uploaded files against the expected schema before accepting them, and return a structured error report if validation fails. |
| REQ-INTG-009 | The system SHALL display, for each integration, the volume of records transferred in the last submission and the number of validation errors. |
| REQ-INTG-010 | The system SHALL send an automated notification to the Technical/Admin team when an integration fails or a submission is overdue. |
| REQ-INTG-011 | The system SHALL maintain a submission history log per participant showing all past transfers, their status, record counts, and error counts. |

### 5.4 Pipeline Monitor (PIPE)

| ID | Requirement |
|----|-------------|
| REQ-PIPE-001 | The system SHALL display all active and recent data ingestion pipeline jobs in a table view. |
| REQ-PIPE-002 | The system SHALL show for each pipeline job: job name, source institution, status, progress percentage, start time, duration, records processed, and error count. |
| REQ-PIPE-003 | Pipeline job statuses SHALL be: Running, Completed, Failed, Queued, Paused. |
| REQ-PIPE-004 | The system SHALL allow users to expand a pipeline job to view its step-by-step execution log. |
| REQ-PIPE-005 | The system SHALL allow Technical/Admin users to trigger a Reprocess action on failed pipeline jobs. |
| REQ-PIPE-006 | The system SHALL allow Technical/Admin users to stop a currently running pipeline job. |
| REQ-PIPE-007 | The system SHALL allow filtering of pipeline jobs by status and by source institution. |
| REQ-PIPE-008 | The system SHALL allow Technical/Admin users to create new pipeline configurations specifying: source, schedule (cron expression), and target mapping. |
| REQ-PIPE-009 | The system SHALL retain pipeline execution logs for a minimum of 90 days. |
| REQ-PIPE-010 | The system SHALL NOT display individual customer-level transaction records in the pipeline monitor; only aggregate counts and metadata SHALL be shown. |

### 5.5 Standards & Mapping (MAP)

> **Scope clarification (per stakeholder feedback):** Standards & Mapping is primarily a **backend / data integration function**. It does not need to be a prominent standalone module for business or compliance users. It is exposed as a **Technical/Admin-only configuration interface** — accessible under Settings or as a supporting tool within Integrations — allowing the technical team to define and version how incoming data is normalized. Business and Compliance users have no need to interact with this module directly.

| ID | Requirement |
|----|-------------|
| REQ-MAP-001 | The system SHALL allow Technical/Admin users to create field-level mapping definitions that translate source data fields to a canonical target format (e.g. ISO 20022, JSON Canonical). |
| REQ-MAP-002 | Each mapping SHALL have: a unique mapping ID, name, source system, target standard, version number, status, and a count of mapped vs total fields. |
| REQ-MAP-003 | Mapping statuses SHALL be: Healthy (all fields mapped), Warning (some fields unmapped), Draft (not yet published). |
| REQ-MAP-004 | The system SHALL allow Technical/Admin users to publish a mapping as a versioned release (e.g. v1.0, v2.0). |
| REQ-MAP-005 | The system SHALL maintain version history for each mapping, showing who published each version and when. |
| REQ-MAP-006 | The system SHALL allow Technical/Admin users to clone an existing mapping as the starting point for a new one. |
| REQ-MAP-007 | The system SHALL apply the active published mapping version during pipeline ingestion automatically. |
| REQ-MAP-008 | The system SHALL display a warning when a mapping has unmapped fields before allowing it to be published. |
| REQ-MAP-009 | The Standards & Mapping interface SHALL be accessible only to Technical/Admin users and SHALL be positioned as a configuration tool within the Integrations or Settings area, not as a primary navigation module. |

### 5.6 Participant 360 (P360)

| ID | Requirement |
|----|-------------|
| REQ-P360-001 | The system SHALL provide a unified participant profile page for each registered financial institution. |
| REQ-P360-002 | The participant profile SHALL display: institution name, type (commercial bank / e-money issuer / MFI / SACCO), registration date, assigned contact, and current overall status. |
| REQ-P360-003 | The participant profile SHALL display Integration Status: current health of each connected data source for that institution. |
| REQ-P360-004 | The participant profile SHALL display Data Submission History: a chronological log of all data submissions, their status, record counts, and error counts. |
| REQ-P360-005 | The participant profile SHALL display Compliance Status: a summary of required compliance documents, their submission status, and upcoming or overdue deadlines. |
| REQ-P360-006 | The participant profile SHALL display Incidents: a list of all open and resolved incidents associated with this institution. |
| REQ-P360-007 | The participant profile SHALL display Technical Performance: failure rates, uptime percentage, and average data submission latency over the last 30 days. |
| REQ-P360-008 | The participant profile SHALL display Outstanding Actions: a list of pending items assigned to either RSwitch or the institution. |
| REQ-P360-009 | The participant profile SHALL display a Participant Risk Assessment with clearly defined inputs and scoring methodology visible to authorized users. |
| REQ-P360-010 | The Participant Risk Assessment SHALL be broken into three distinct risk categories: (a) **Compliance Risk** — submission adherence rate, overdue deadlines, rejection history; (b) **Operational Risk** — incident frequency, severity, and resolution time; (c) **Technical Risk** — integration uptime, pipeline failure rate, average submission latency. An overall composite score SHALL also be displayed for quick reference. |
| REQ-P360-011 | The risk scoring weights, thresholds, and indicators SHALL be configurable by Technical/Admin users through the Settings module, allowing the methodology to evolve as data and business understanding matures. The SRS does not mandate fixed weights; these SHALL be determined during the design phase. |
| REQ-P360-012 | A risk score SHALL only be displayed when a minimum of 3 months of submission history is available for the participant. Where insufficient history exists, the system SHALL display "Insufficient data — score pending." |
| REQ-P360-013 | The system SHALL NOT display individual customer-level indicators (e.g. probability of default per customer) in the Participant 360 view. |
| REQ-P360-014 | The system SHALL allow Compliance users to add notes or annotations to a participant's profile. |

### 5.7 Governance (GOV)

| ID | Requirement |
|----|-------------|
| REQ-GOV-001 | The system SHALL provide a central Governance module serving the Board, Steering Committees, and Technical/Operational Working Groups. |
| REQ-GOV-002 | The system SHALL allow authorized users to upload governance documents (PDF, Word, Excel) and tag them by category (policy, minutes, decision, working paper). |
| REQ-GOV-003 | Uploaded documents SHALL have: title, category, upload date, uploader, version, associated committee/group, and access level. |
| REQ-GOV-004 | The system SHALL maintain a Meeting Calendar displaying scheduled meetings for all committees and working groups. |
| REQ-GOV-005 | The system SHALL allow authorized users to create meeting records containing: date, attendees, agenda, minutes document, and a list of decisions and action items. |
| REQ-GOV-006 | Each action item SHALL have: description, assigned owner (RSwitch user or institution), due date, and status (Open / In Progress / Completed / Overdue). |
| REQ-GOV-007 | The system SHALL display a dashboard of overdue action items grouped by committee or working group. |
| REQ-GOV-008 | The system SHALL maintain a register of working-group membership, showing which RSwitch staff and participant representatives belong to each group. |
| REQ-GOV-009 | The system SHALL send automated reminders to action item owners 7 days and 1 day before the due date. |
| REQ-GOV-010 | The system SHALL send an escalation notification to the committee chair when an action item becomes overdue. |
| REQ-GOV-011 | Governance module access SHALL be restricted: Business users view only; Compliance users manage; Technical users view only. |

### 5.8 Compliance Monitoring (COMP)

| ID | Requirement |
|----|-------------|
| REQ-COMP-001 | The system SHALL maintain a Compliance Register listing all required compliance documents per participant institution. |
| REQ-COMP-002 | Each compliance requirement entry SHALL have: requirement name, regulatory reference, frequency (monthly / quarterly / annual), responsible participant, due date, and submission status. |
| REQ-COMP-003 | Compliance submission statuses SHALL be: Pending, Submitted, Under Review, Approved, Rejected, Overdue. |
| REQ-COMP-004 | The system SHALL display a compliance calendar showing all upcoming deadlines within the next 90 days. |
| REQ-COMP-005 | The system SHALL highlight overdue compliance submissions in red and send automated reminders to the responsible participant. |
| REQ-COMP-006 | The system SHALL allow Compliance users to record incidents per participant, including: incident date, description, severity (Low / Medium / High / Critical), and assigned remediation owner. |
| REQ-COMP-007 | Incident statuses SHALL be: Open, Under Investigation, Remediation In Progress, Resolved, Closed. |
| REQ-COMP-008 | The system SHALL track failure rates per participant: percentage of submissions that were rejected or contained errors over a rolling 12-month period. |
| REQ-COMP-009 | The system SHALL maintain a full compliance history per participant, showing all past submissions, their outcomes, and any associated incidents. |
| REQ-COMP-010 | The system SHALL allow Compliance users to define remediation action items for unresolved incidents, including owner and due date. |
| REQ-COMP-011 | The system SHALL send escalation notifications to senior Compliance users when an incident remains unresolved past its remediation due date. |

### 5.9 AI Decision Support (AI)

| ID | Requirement |
|----|-------------|
| REQ-AI-001 | The system SHALL provide an AI-assisted Decision Support module that helps RSwitch staff identify unusual operational patterns across participant institutions. |
| REQ-AI-002 | AI outputs SHALL be advisory and explainable; the system SHALL NOT make automated final decisions or automated enforcement actions. |
| REQ-AI-003 | The system SHALL display AI-generated alerts identifying participants exhibiting unusual behavior (e.g. sudden spike in submission errors, unexplained failure rate change). |
| REQ-AI-004 | Each AI alert SHALL include: the participant name, the indicator that triggered the alert, the baseline value used, the current observed value, the deviation, and a recommended area for investigation. |
| REQ-AI-005 | The system SHALL provide an AI-generated priority list of participants requiring attention, ranked by composite risk signal strength. |
| REQ-AI-006 | The system SHALL allow Business and Compliance users to manage AI alerts through a defined lifecycle: Generated → Acknowledged → Under Investigation → Resolved / Escalated → Closed. Each status transition SHALL require a mandatory note from the acting user. |
| REQ-AI-006a | The system SHALL enforce that an alert CANNOT be moved directly from Generated to Under Investigation. It MUST pass through Acknowledged first, ensuring no alert is silently acted upon without a logged awareness note. |
| REQ-AI-006b | The system SHALL automatically escalate an alert to Escalated status and notify a senior Compliance or Business user if the alert remains at Acknowledged status without progressing for a configurable number of days (default: 3 days). Technical/Admin users SHALL be able to adjust this escalation threshold in Settings. |
| REQ-AI-006c | The system SHALL require a written resolution summary (minimum 20 characters) before an alert can be moved to Closed status. A closed alert SHALL be read-only and cannot be reopened. If the same issue recurs, a new alert SHALL be generated. |
| REQ-AI-007 | The system SHALL display compliance and operational trend summaries, covering the last 3 months across all participants. |
| REQ-AI-008 | All AI outputs SHALL be linked to the underlying data indicators so users can drill down to the source data. |
| REQ-AI-009 | The system SHALL document and display the data sources and baseline methodology used to produce each AI output. |
| REQ-AI-010 | The platform architecture SHALL be model-agnostic: the analytical approach (threshold-based, statistical, or ML-based) SHALL NOT be hardcoded and SHALL be replaceable without requiring application code changes. The specific model or approach SHALL be selected during the design phase based on available historical data and finalized business requirements. |
| REQ-AI-011 | Baseline establishment SHALL follow a phased approach: (a) **Release 1** — configurable predefined thresholds set by Technical/Admin users; (b) **Release 2** — rolling historical baselines calculated from accumulated submission data (minimum 6 months); (c) **Release 3** — peer-group comparison baselines across institutions of the same type. The system SHALL display which baseline method is active for each alert. |
| REQ-AI-012 | Technical/Admin users SHALL be able to configure alert sensitivity thresholds (e.g. deviation percentage that triggers an alert) through the Settings module without requiring a code change. |

### 5.10 Financial Inclusion (FIN)

| ID | Requirement |
|----|-------------|
| REQ-FIN-001 | The system SHALL provide financial inclusion reporting dashboards based on data submitted by participant institutions. |
| REQ-FIN-002 | Financial inclusion reports SHALL support segmentation by institution type: E-money Issuers, Commercial Banks, Microfinance Institutions (MFIs), SACCOs. |
| REQ-FIN-003 | Financial inclusion reports SHALL support segmentation by region where demographic data is available. |
| REQ-FIN-004 | The system SHALL display aggregated metrics per participant category including, where data permits: number of accounts, active users, transaction volumes, and access rates. |
| REQ-FIN-005 | The system SHALL allow Business users to filter reports by institution type, region, and time period. |
| REQ-FIN-006 | The system SHALL clearly label each metric with its data source and the date it was last updated. |
| REQ-FIN-007 | Dashboard metrics and visualizations SHALL be treated as indicative at this stage. Final data fields, metrics, and visualizations SHALL be confirmed once RSwitch has validated data availability with participating institutions. The module structure SHALL be designed to accommodate new metrics without requiring architectural changes. |
| REQ-FIN-008 | The system SHALL allow Business users to export financial inclusion reports in PDF and Excel formats. |

### 5.11 Reports (RPT)

| ID | Requirement |
|----|-------------|
| REQ-RPT-001 | The system SHALL allow authorized users to generate reports across the following categories: Compliance Summary, Integration Health, Participant Performance, Financial Inclusion, Incident Report, Governance Action Items. |
| REQ-RPT-002 | Each report type SHALL have configurable filters (see Section 14). |
| REQ-RPT-003 | The system SHALL allow reports to be exported in PDF and Excel (XLSX) formats. |
| REQ-RPT-004 | The system SHALL maintain a report history showing all generated reports with the name, type, date, generated by, and download link. |
| REQ-RPT-005 | The system SHALL allow Compliance and Business users to schedule recurring reports (daily / weekly / monthly) with automatic email delivery. |
| REQ-RPT-006 | All reports SHALL support dynamic filtering by: institution, participant type, region, status, date range, and risk level. Filter combinations SHALL be saveable as named report templates. |

### 5.12 Notifications (NOTIF)

| ID | Requirement |
|----|-------------|
| REQ-NOTIF-001 | The system SHALL support in-app notifications displayed in a notification bell in the top navigation bar. |
| REQ-NOTIF-002 | The system SHALL support email notifications for time-sensitive events as defined in Section 13. |
| REQ-NOTIF-003 | The system SHALL allow Technical/Admin users to configure which notification events are active. |
| REQ-NOTIF-004 | The system SHALL display a notification history for the last 90 days. |
| REQ-NOTIF-005 | The system SHALL allow users to mark individual notifications as read or mark all as read. |

### 5.13 Users & Security (USR)

| ID | Requirement |
|----|-------------|
| REQ-USR-001 | The system SHALL allow Technical/Admin users to invite new users by email, specifying their role. |
| REQ-USR-002 | The system SHALL send an invitation email with a time-limited registration link (expires in 48 hours). |
| REQ-USR-003 | The system SHALL allow Technical/Admin users to deactivate user accounts without deleting them, preserving audit history. |
| REQ-USR-004 | The system SHALL allow Technical/Admin users to change a user's role. |
| REQ-USR-005 | The system SHALL display a user management table showing: name, email, role, status (active/inactive), and last login date. |
| REQ-USR-006 | The system SHALL maintain an audit log of all user management actions (invite, role change, deactivation). |

### 5.14 Settings (SET)

| ID | Requirement |
|----|-------------|
| REQ-SET-001 | The system SHALL allow Technical/Admin users to configure organization-level settings: organization name, logo, default timezone, and default date format. |
| REQ-SET-002 | The system SHALL allow Technical/Admin users to manage API keys for external integrations (create, view masked, revoke). |
| REQ-SET-003 | The system SHALL allow Technical/Admin users to configure security policies: MFA enforcement toggle, session timeout duration, and password policy. |
| REQ-SET-004 | The system SHALL allow Technical/Admin users to configure compliance deadline reminder lead times (e.g. remind 14 days before, 7 days before, 1 day before). |
| REQ-SET-005 | The system SHALL allow Technical/Admin users to export the full audit log for a selected date range in CSV format. |

---

## 6. Business Workflows

### 6.1 Manual Data Submission Workflow

| Step | Actor | Action | System Response |
|------|-------|--------|-----------------|
| 1 | Participant Institution | Sends data file to RSwitch via agreed channel (email / secure transfer) | — |
| 2 | Compliance / Technical User | Logs in to RDIP and navigates to Compliance → Upload Submission | Upload form displayed with participant and requirement fields |
| 3 | Compliance / Technical User | Selects participant, requirement type, and uploads the received file | System validates file against expected schema |
| 4 | System | Schema validation passes | Submission recorded as "Submitted"; pipeline queued |
| 4a | System | Schema validation fails | Error report returned; submission status = "Validation Failed"; Compliance user notified |
| 5 | Pipeline | Processes submitted file | Records ingested; counts and errors logged |
| 6 | Compliance User | Reviews submission | Status updated to "Under Review" |
| 7 | Compliance User | Approves or rejects | Status updated to "Approved" or "Rejected" |

### 6.2 Incident Management Workflow

| Step | Actor | Action | System Response |
|------|-------|--------|-----------------|
| 1 | Compliance User | Creates incident record for a participant | Incident logged as "Open"; assigned owner notified |
| 2 | Assigned Owner | Acknowledges incident | Status → "Under Investigation" |
| 3 | Compliance User | Adds remediation action items | Action items created with due dates |
| 4 | Assigned Owner | Completes remediation | Marks action items as "Completed" |
| 5 | Compliance User | Reviews and closes | Status → "Resolved" then "Closed" |
| 5a | System | Remediation due date passes without completion | Escalation notification sent to senior Compliance user |

### 6.3 Governance Meeting Workflow

| Step | Actor | Action | System Response |
|------|-------|--------|-----------------|
| 1 | Compliance User | Creates meeting record | Meeting added to calendar; invites notified |
| 2 | Compliance User | Uploads minutes after meeting | Document stored; linked to meeting record |
| 3 | Compliance User | Records decisions and action items | Action items created with owners and due dates |
| 4 | System | 7 days before due date | Reminder notification sent to action item owner |
| 5 | System | Due date passes without completion | Status → "Overdue"; escalation sent to committee chair |
| 6 | Owner | Marks action item complete | Status → "Completed" |

### 6.4 Data Quality — Correction and Resubmission Workflow

| Step | Actor | Action | System Response |
|------|-------|--------|-----------------|
| 1 | Compliance / Technical User | Uploads file on behalf of participant | System runs schema and quality validation |
| 2 | System | Validation fails (missing fields, invalid format, inconsistent data) | Submission status → "Validation Failed"; structured error report generated listing each issue by row/field |
| 3 | Compliance User | Reviews error report | Contacts institution offline to request corrected data |
| 4 | Institution | Provides corrected file via agreed channel | — |
| 5 | Compliance / Technical User | Re-uploads corrected file | System re-validates against schema |
| 6 | System | Validation passes | Submission status → "Submitted"; original failed attempt retained in history for audit |
| 6a | System | Validation fails again | New error report generated; process repeats from Step 3 |
| 7 | Compliance User | Reviews and approves | Status → "Approved"; correction history preserved |

> **Data quality rule:** The system SHALL never partially ingest a submission. A file either passes full validation and is ingested completely, or it is rejected entirely. Partial ingestion is not permitted.

### 6.5 Compliance Deadline Workflow

| Step | Actor | Action | System Response |
|------|-------|--------|-----------------|
| 1 | System | Compliance deadline configured | Entry appears in compliance calendar |
| 2 | System | Lead time reached (e.g. 14 days before) | Reminder notification sent to Compliance user |
| 3 | Compliance / Technical User | Receives data from institution and uploads on their behalf | Submission status → "Submitted" |
| 4 | System | Deadline passes without submission | Status → "Overdue"; escalation notification sent to senior Compliance user |
| 5 | Compliance User | Reviews and approves submission | Status → "Approved" |

---

## 7. Module Breakdown

| Module | Purpose | Primary Users |
|--------|---------|---------------|
| Authentication | Login, MFA, session management | All |
| Dashboard | Role-aware operational overview | All |
| Integrations | Catalog and manage participant data connections | Technical, Compliance |
| Pipeline Monitor | Real-time ingestion job tracking | Technical, Compliance |
| Standards & Mapping | Define field translation rules between formats | Technical |
| Participant 360 | Unified institutional profile | Compliance, Business, Technical |
| Governance | Document repository, meeting management, action tracking | Compliance, Business |
| Compliance Monitoring | Deadline tracking, incidents, remediation | Compliance, Participants |
| AI Decision Support | Pattern detection, prioritization, trend summaries | Business, Compliance |
| Financial Inclusion | Inclusion metrics by institution type and region | Business |
| Reports | Generate, schedule, and export structured reports | Compliance, Business |
| Notifications | In-app and email event alerts | All |
| Users & Security | User accounts, roles, and audit log | Technical |
| Settings | System configuration and security policies | Technical |

---

## 8. Feature Details

### 8.1 Participant 360 — Profile View

| Attribute       | Detail |
|-----------------|--------|
| **What is it?** | A single-screen view of everything RSwitch knows about one participant institution |
| **Who uses it** | Compliance users (view), Business users (view), Technical users (view) |
| **Inputs**      | Participant ID or name (search) |
| **Outputs**     | Consolidated profile: integration status, submission history, compliance status, incidents, technical performance, outstanding actions, risk indicator |
| **Validation**  | Only RSwitch internal users can access participant profiles |
| **Exceptions**  | If a participant has no submissions yet, display "No data submitted yet" with expected due date |

### 8.2 Manual Data Upload

| Attribute       | Detail |
|-----------------|--------|
| **What is it?** | Allows RSwitch staff to upload data files received from participant institutions |
| **Who uses it** | Compliance User, Technical / Admin User |
| **Inputs**      | Requirement type (dropdown), reporting period, file (CSV / Excel / XML, max 50 MB) |
| **Outputs**     | Submission record created; file stored; validation report displayed |
| **Validation**  | File must match expected schema; file size ≤ 50 MB; file type must be CSV, XLSX, or XML |
| **Exceptions**  | If validation fails, return a line-by-line error report; do not ingest partial data |

### 8.3 AI Alert — Unusual Pattern

| Attribute       | Detail |
|-----------------|--------|
| **What is it?** | An AI-generated flag indicating that a participant's metrics deviate from expected patterns |
| **Who uses it** | Business users, Compliance users |
| **Inputs**      | Historical submission data, failure rates, incident history |
| **Outputs**     | Alert card with: participant name, triggered indicator, baseline value, current value, deviation %, recommended investigation area |
| **Validation**  | Output must link to the source data driving the alert |
| **Exceptions**  | If historical data is insufficient (< 3 months), alert should be suppressed and a "Insufficient history" label shown |

### 8.4 Compliance Submission Review

| Attribute       | Detail |
|-----------------|--------|
| **What is it?** | Compliance users review and approve or reject a participant's submission |
| **Who uses it** | Compliance User |
| **Inputs**      | Submission record, reviewer notes (optional), approval/rejection decision |
| **Outputs**     | Submission status updated; participant notified; compliance history updated |
| **Validation**  | Rejection requires a non-empty reason note |
| **Exceptions**  | If a submission is rejected, the compliance deadline status remains "Overdue" until a new submission is approved |

---

## 9. Status Definitions

### 9.1 Integration / Pipeline Status

| Status | Meaning |
|--------|---------|
| Healthy | Last transfer succeeded with no errors |
| Warning | Transfer succeeded but with validation warnings |
| Failed | Last transfer failed or was rejected |
| Running | Transfer currently in progress |
| Queued | Transfer scheduled but not yet started |
| Paused | Transfer manually paused by admin |
| Not Configured | No integration set up for this data source yet |

### 9.2 Compliance Submission Status

| Status | Meaning |
|--------|---------|
| Pending | Deadline not yet reached; submission not yet made |
| Submitted | File uploaded; awaiting review |
| Validation Failed | Uploaded file did not pass schema or data quality checks; error report generated |
| Pending Correction | Submission rejected or failed validation; corrected resubmission required |
| Under Review | Compliance user is reviewing a valid submission |
| Approved | Submission accepted |
| Rejected | Submission rejected by Compliance user after review; resubmission required |
| Overdue | Deadline passed without an approved submission |

### 9.3 AI Alert Status

| Status | Meaning |
|--------|---------|
| Generated | Alert created by the system; not yet seen by a user |
| Acknowledged | User has read the alert and logged an awareness note — **required before any further action** |
| Under Investigation | Assigned to a specific user who is actively investigating — cannot be reached without passing through Acknowledged |
| Resolved | Investigation complete; outcome documented |
| Escalated | Alert sat at Acknowledged beyond the configured threshold (default 3 days) without progress, or severity increased; senior user notified |
| Closed | Formally closed with a mandatory written resolution summary; read-only — cannot be reopened |

**Lifecycle rules:**
- An alert MUST pass through **Acknowledged** before moving to **Under Investigation** — skipping is not permitted
- **Auto-escalation** triggers if an alert remains at Acknowledged for more than the configured number of days without progressing (default: 3 days)
- **Closure** always requires a resolution summary of at least 20 characters
- A **closed alert cannot be reopened** — if the issue recurs, a new alert is generated

### 9.4 Incident Status

| Status | Meaning |
|--------|---------|
| Open | Incident raised; not yet assigned |
| Under Investigation | Assigned owner acknowledged |
| Remediation In Progress | Remediation actions are active |
| Resolved | Remediation complete; pending closure |
| Closed | Incident formally closed by Compliance user |

### 9.4 Governance Action Item Status

| Status | Meaning |
|--------|---------|
| Open | Action item created; not started |
| In Progress | Owner is working on it |
| Completed | Owner marked done |
| Overdue | Due date passed without completion |

---

## 10. Data Requirements

> **Flexibility note (per stakeholder feedback):** All data fields, entities, and configurations defined in this section are **indicative**. The actual fields required will be confirmed and refined during the first phase of working with participating institutions. The data model SHALL be designed to accommodate new fields and entities without requiring architectural changes. Fields marked as required may become optional and vice versa as real data availability is understood.

### 10.1 Participant Institution

| Field | Type | Notes |
|-------|------|-------|
| participant_id | UUID | System-generated |
| name | String | Full legal name |
| short_name | String | Display abbreviation |
| institution_type | Enum | Commercial Bank / E-money Issuer / MFI / SACCO |
| country | String | |
| region | String | |
| registration_date | Date | Date joined RSwitch network |
| primary_contact_name | String | |
| primary_contact_email | String | |
| status | Enum | Active / Inactive / Suspended |
| risk_score | Float | Calculated composite score 0–100 |

### 10.2 Integration Configuration

| Field | Type | Notes |
|-------|------|-------|
| integration_id | UUID | |
| participant_id | FK → Participant | |
| source_name | String | e.g. "Core Banking", "Mobile Money" |
| integration_mode | Enum | Manual / Automated API |
| endpoint_url | String | Encrypted at rest (API mode only) |
| credentials | Encrypted | Stored encrypted; never displayed in plain text |
| schedule_cron | String | e.g. "0 0 * * *" (API mode) |
| status | Enum | Healthy / Warning / Failed / Not Configured |
| last_sync_at | DateTime | |
| last_sync_records | Integer | |
| last_sync_errors | Integer | |

### 10.3 Compliance Requirement

| Field | Type | Notes |
|-------|------|-------|
| requirement_id | UUID | |
| participant_id | FK → Participant | |
| requirement_name | String | |
| regulatory_reference | String | e.g. "BNR Directive 07/2024" |
| frequency | Enum | Monthly / Quarterly / Annual / Ad hoc |
| due_date | Date | |
| submission_status | Enum | See Section 9.2 |
| submitted_at | DateTime | Nullable |
| reviewed_by | FK → User | Nullable |
| approved_at | DateTime | Nullable |
| rejection_reason | Text | Nullable |

### 10.4 Incident

| Field | Type | Notes |
|-------|------|-------|
| incident_id | UUID | |
| participant_id | FK → Participant | |
| raised_by | FK → User | |
| raised_at | DateTime | |
| description | Text | |
| severity | Enum | Low / Medium / High / Critical |
| status | Enum | See Section 9.3 |
| assigned_owner | FK → User | |
| resolved_at | DateTime | Nullable |
| closed_at | DateTime | Nullable |

### 10.5 User

| Field | Type | Notes |
|-------|------|-------|
| user_id | UUID | |
| full_name | String | |
| email | String | Unique |
| role | Enum | compliance / business / technical / participant |
| participant_id | — | Not applicable; all users are RSwitch internal staff |
| status | Enum | Active / Inactive / Invited |
| mfa_enabled | Boolean | |
| last_login_at | DateTime | |
| created_at | DateTime | |

### 10.6 Governance Document

| Field | Type | Notes |
|-------|------|-------|
| document_id | UUID | |
| title | String | |
| category | Enum | Policy / Minutes / Decision / Working Paper / Other |
| committee | String | e.g. "Board", "Steering Committee" |
| version | String | e.g. "v2.0" |
| uploaded_by | FK → User | |
| uploaded_at | DateTime | |
| file_url | String | Stored internally; access controlled |
| access_level | Enum | Internal / Restricted |

---

## 11. Validation Rules

### 11.1 User Password

| Rule | Requirement |
|------|-------------|
| Minimum length | 12 characters |
| Uppercase | At least 1 uppercase letter |
| Lowercase | At least 1 lowercase letter |
| Number | At least 1 digit |
| Special character | At least 1 special character (!@#$%^&*) |
| Not reused | Cannot match last 5 passwords |

### 11.2 Email Address

| Rule | Requirement |
|------|-------------|
| Format | Must match RFC 5322 email format |
| Uniqueness | Must be unique across all user accounts |
| Domain | No validation on domain (any work email accepted) |

### 11.3 File Upload (Compliance Submission)

| Rule | Requirement |
|------|-------------|
| Allowed types | CSV, XLSX, XML |
| Maximum size | 50 MB |
| Schema validation | File columns must match the expected schema for the selected requirement type |
| Encoding | UTF-8 required for CSV files |

### 11.4 Compliance Deadline

| Rule | Requirement |
|------|-------------|
| Due date | Must be a future date when creating a new requirement |
| Frequency | If recurring, next due date auto-calculated after approval of current cycle |
| Rejection reason | Mandatory text field (minimum 20 characters) when rejecting a submission |

### 11.5 Participant Risk Score

| Rule | Requirement |
|------|-------------|
| Range | 0 (lowest risk) to 100 (highest risk) |
| Components | Weighted average of: integration reliability (30%), compliance adherence rate (30%), incident frequency (20%), overdue submission rate (20%) |
| Minimum data | Score only displayed when at least 3 months of history is available |
| Recalculation | Score recalculated nightly |

---

## 12. User Permissions Matrix

### 12.1 Module-Level Permissions

| Module | Compliance | Business | Technical |
|--------|:----------:|:--------:|:---------:|
| Dashboard — View | ✓ | ✓ | ✓ |
| Integrations — View | ✓ | ✓ | ✓ |
| Integrations — Manage | ✗ | ✗ | ✓ |
| Integrations — Upload on behalf | ✓ | ✗ | ✓ |
| Pipeline Monitor — View | ✓ | ✓ | ✓ |
| Pipeline Monitor — Manage | ✗ | ✗ | ✓ |
| Standards & Mapping — View | ✓ | ✗ | ✓ |
| Standards & Mapping — Manage | ✗ | ✗ | ✓ |
| Participant 360 — View | ✓ | ✓ | ✓ |
| Governance — View | ✓ | ✓ | ✓ |
| Governance — Manage | ✓ | ✗ | ✗ |
| Compliance — View | ✓ | ✓ | ✓ |
| Compliance — Manage | ✓ | ✗ | ✗ |
| Compliance — Upload Submission | ✓ | ✗ | ✓ |
| AI Decision Support — View | ✓ | ✓ | ✓ |
| AI Decision Support — Manage | ✗ | ✓ | ✗ |
| Financial Inclusion — View | ✓ | ✓ | ✓ |
| Financial Inclusion — Manage | ✗ | ✓ | ✗ |
| Reports — View | ✓ | ✓ | ✓ |
| Reports — Generate | ✓ | ✓ | ✗ |
| Reports — Schedule | ✓ | ✓ | ✗ |
| Users & Security — Manage | ✗ | ✗ | ✓ |
| Settings — View | ✗ | ✓ | ✓ |
| Settings — Manage | ✗ | ✗ | ✓ |
| Audit Log — View | ✓ | ✗ | ✓ |

---

## 13. Notifications

| Trigger | Recipient | Method |
|---------|-----------|--------|
| Integration fails | Technical/Admin team | Email + In-app |
| Participant submission overdue | Compliance user | Email + In-app |
| Compliance submission rejected | Compliance user (to follow up with institution offline) | In-app |
| Compliance submission approved | Compliance user | In-app |
| Incident created | Assigned owner | Email + In-app |
| Incident remediation overdue | Senior Compliance user | Email + In-app |
| Governance action item due in 7 days | Action item owner | Email + In-app |
| Governance action item due in 1 day | Action item owner | Email + In-app |
| Governance action item overdue | Committee chair + Action item owner | Email + In-app |
| New user invited | Invited user | Email (with registration link) |
| User role changed | Affected user | Email + In-app |
| AI alert generated | Business users + Compliance users | In-app |
| Scheduled report generated | Requesting user | Email (with attachment) |
| Password reset requested | Requesting user | Email (with reset link) |

---

## 14. Reports

### 14.1 Compliance Summary Report

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Overview of compliance status across all or selected participants |
| **Filters** | Participant, institution type, date range, status (Pending / Overdue / Approved / Rejected) |
| **Columns** | Participant name, requirement name, due date, submission date, status, reviewer, rejection reason |
| **Export formats** | PDF, Excel |
| **Permissions** | Compliance (generate), Business (view) |

### 14.2 Integration Health Report

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Summary of all integration statuses and recent pipeline runs |
| **Filters** | Participant, integration type, date range, status |
| **Columns** | Participant, source, status, last sync date, records transferred, error count, uptime % |
| **Export formats** | PDF, Excel |
| **Permissions** | Compliance (view), Business (view), Technical (generate) |

### 14.3 Participant Performance Report

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Ranked view of all participants by operational performance |
| **Filters** | Institution type, region, date range |
| **Columns** | Participant, risk score, compliance rate, failure rate, open incidents, overdue submissions |
| **Export formats** | PDF, Excel |
| **Permissions** | Compliance (generate), Business (generate) |

### 14.4 Financial Inclusion Report

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Aggregated inclusion metrics by institution type and region |
| **Filters** | Institution type, region, period |
| **Columns** | Institution type, region, metric name, value, data source, last updated |
| **Export formats** | PDF, Excel |
| **Permissions** | Business (generate), Compliance (view) |

### 14.5 Incident Report

| Attribute | Detail |
|-----------|--------|
| **Purpose** | List of all incidents within a period |
| **Filters** | Participant, severity, status, date range |
| **Columns** | Incident ID, participant, severity, description, raised date, status, resolved date, resolution summary |
| **Export formats** | PDF, Excel |
| **Permissions** | Compliance (generate) |

---

## 15. Dashboard Widgets

### 15.1 Compliance User Dashboard

| Widget | Description |
|--------|-------------|
| Overdue Submissions | Count of compliance submissions past due date |
| Upcoming Deadlines | List of deadlines in next 30 days |
| Open Incidents | Count by severity (Critical / High / Medium / Low) |
| Compliance Rate (30d) | % of submissions approved on time across all participants |
| Overdue Action Items | Count of governance and incident action items past due |
| Recent Activity | Last 10 compliance events |

### 15.2 Business User Dashboard

| Widget | Description |
|--------|-------------|
| Integration Health Summary | Count of Healthy / Warning / Failed integrations |
| AI Alerts (Unacknowledged) | Count of pending AI alerts |
| Financial Inclusion Snapshot | Key inclusion metrics for current period |
| Participant Risk Overview | Distribution of participant risk scores |
| Recent Reports | Last 5 generated reports with download links |
| Compliance Overview | Aggregate compliance rate across all participants |

### 15.3 Technical / Admin User Dashboard

| Widget | Description |
|--------|-------------|
| Active Pipelines | Count running + count failed today |
| Failed Integrations | List of integrations currently in Failed state |
| Data Freshness | Last sync time per data source |
| System Health | Uptime, error rate, queue depth |
| Pending Mappings | Count of mappings in Draft status |
| Recent Pipeline Runs | Last 10 pipeline jobs with status |

---

## 16. External Integrations

> **Email scope clarification (per stakeholder feedback):** Email integration is **outbound only**. RDIP sends automated notifications and scheduled reports via email. The system does NOT ingest incoming emails, parse email replies, or process calendar invite acceptances. Any response from participants to email notifications is handled offline by RSwitch staff.

| System | Purpose | Direction | Authentication |
|--------|---------|-----------|----------------|
| Participant Core Banking System | Pull transaction summary data (automated mode) | Inbound to RDIP | API Key / OAuth 2.0 |
| Participant Mobile Money Platform | Pull mobile money submission data (automated mode) | Inbound to RDIP | API Key |
| Email Service (SMTP / SendGrid) | Deliver automated notification and report emails — outbound only; no email ingestion | Outbound from RDIP only | SMTP credentials / API key |
| File Storage (Internal) | Store uploaded documents and generated reports | Internal | IAM role-based |
| AI/ML Analytical Engine | Process operational data and generate alerts; model-agnostic — engine is replaceable without code changes | Internal | Internal service token |
| National Regulatory Reporting System | Submit required regulatory reports (future) | Outbound from RDIP | TBD by regulator |

---

## 17. Non-Functional Requirements

### 17.1 Performance

| Requirement | Target |
|-------------|--------|
| Page load time | < 2 seconds for 95% of requests under normal load |
| API response time | < 500 ms for standard queries |
| File upload processing | < 60 seconds for files up to 50 MB |
| Dashboard data refresh | < 3 seconds |
| Concurrent users | System must support at least 100 concurrent users without degradation |
| Report generation | Standard reports generated in < 30 seconds |

### 17.2 Security

| Requirement | Detail |
|-------------|--------|
| Transport encryption | All communications over HTTPS / TLS 1.3 |
| Data encryption at rest | All stored data encrypted using AES-256 |
| Authentication | JWT-based session tokens with expiry |
| MFA | TOTP-based MFA mandatory for all users |
| RBAC | Role-based access control enforced server-side on every API endpoint |
| API security | Rate limiting: 100 requests/minute per user; 1000/minute per IP |
| Secrets storage | API keys and credentials stored encrypted; never logged or displayed in plain text |
| Audit logging | All data-modifying actions logged with user, timestamp, and IP |
| OWASP protection | Protection against SQL injection, XSS, CSRF, and the OWASP Top 10 |
| Penetration testing | System must pass a penetration test before go-live |

### 17.3 Scalability

| Requirement | Detail |
|-------------|--------|
| Horizontal scaling | Application tier must support horizontal scaling |
| Database | Read replicas supported for reporting queries |
| Caching | Frequently accessed reference data cached with a max 5-minute TTL |
| Queue system | Asynchronous job queue for pipeline execution and report generation |

### 17.4 Reliability

| Requirement | Target |
|-------------|--------|
| Uptime | 99.5% monthly uptime (excluding scheduled maintenance) |
| Scheduled maintenance | Maximum 4 hours/month; communicated 48 hours in advance |
| Backup frequency | Full database backup daily; transaction logs backed up every hour |
| Recovery Point Objective (RPO) | Maximum 1 hour of data loss in worst-case failure |
| Recovery Time Objective (RTO) | System restored within 4 hours of major failure |
| Monitoring | Real-time system health monitoring with alerting to Technical team |

### 17.5 Accessibility

| Requirement | Detail |
|-------------|--------|
| Standard | WCAG 2.1 Level AA compliance |
| Keyboard navigation | All core workflows navigable by keyboard |
| Color contrast | Minimum 4.5:1 contrast ratio for all text |
| Browser support | Chrome 110+, Firefox 110+, Edge 110+, Safari 16+ |
| Responsive design | Functional on screen widths ≥ 1024px (desktop-first) |

### 17.6 DevOps & Deployment

#### 17.6.1 Environments

| Environment | Purpose |
|-------------|---------|
| Development | Used by developers for active feature work; connected to mock data |
| Staging | Mirror of production used for QA, UAT, and pre-release testing |
| Production | Live system used by RSwitch staff; requires change approval before deployment |

All three environments SHALL be isolated from each other. Staging SHALL use anonymized/synthetic data only — never real participant data.

#### 17.6.2 CI/CD Pipeline

| Requirement | Detail |
|-------------|--------|
| Source control | All code SHALL be managed in a version control system (e.g. Git) with a defined branching strategy |
| Automated builds | Every code push to a main branch SHALL trigger an automated build |
| Automated testing | Unit and integration tests SHALL run automatically on every build; a failing test SHALL block deployment |
| Deployment to staging | Successful builds on the main branch SHALL be automatically deployed to the staging environment |
| Deployment to production | Production deployments SHALL require a manual approval step from the Technical Lead |
| Rollback | Every production deployment SHALL support one-click rollback to the previous stable version |
| Deployment downtime | Deployments SHALL be designed to achieve zero downtime using rolling or blue-green deployment strategies |

#### 17.6.3 Infrastructure & Hosting

| Requirement | Detail |
|-------------|--------|
| Initial hosting | Platform SHALL be deployed on RSwitch's internal server infrastructure for v1 |
| Web server | A production-grade web server (e.g. Nginx) SHALL be configured as a reverse proxy |
| Process management | Application processes SHALL be managed by a process manager (e.g. PM2, systemd) to auto-restart on failure |
| Job queue | Background jobs (pipeline execution, report generation, notifications) SHALL run via an asynchronous queue system separate from the web server process |
| Scheduler | Recurring pipeline and report jobs SHALL be managed by a cron-based scheduler |
| SSL / TLS | All environments SHALL use HTTPS with valid TLS certificates; certificates SHALL be auto-renewed before expiry |
| Firewall | Production server SHALL allow only ports 80, 443 (web) and a restricted SSH port; all other ports SHALL be closed |
| Secrets management | All secrets (database passwords, API keys, JWT secrets) SHALL be stored in environment variables or a secrets manager — never hardcoded in source code |

#### 17.6.4 Monitoring & Logging

| Requirement | Detail |
|-------------|--------|
| Uptime monitoring | An external uptime monitor SHALL check the platform every 60 seconds and alert the Technical team if the platform is unreachable for more than 2 minutes |
| Error tracking | Application errors SHALL be captured and reported to an error tracking tool (e.g. Sentry) in real time |
| Performance monitoring | Server CPU, memory, and disk usage SHALL be monitored continuously; alerts triggered when CPU > 85% or disk > 80% |
| Pipeline failure alerts | Failed pipeline jobs SHALL trigger an immediate in-app and email notification to the Technical team |
| Centralized logging | All application logs (requests, errors, background jobs) SHALL be written to a centralized log store with a minimum 90-day retention |
| Audit log | All user actions that modify data SHALL be written to a tamper-evident audit log (see REQ-SET-005) |
| Log access | Logs SHALL be accessible to Technical/Admin users through the Settings module or directly on the server |

#### 17.6.5 Backup & Recovery

| Requirement | Detail |
|-------------|--------|
| Database backups | Full database backup SHALL run automatically every 24 hours |
| Transaction log backups | Database transaction logs SHALL be backed up every hour to support point-in-time recovery |
| Backup storage | Backups SHALL be stored in a separate location from the primary server (offsite or separate storage volume) |
| Backup retention | Daily backups SHALL be retained for 30 days; weekly backups for 6 months |
| Backup testing | Backup restore SHALL be tested at least once per quarter; results documented |
| Disaster recovery | A documented disaster recovery runbook SHALL exist before go-live, covering: server failure, data corruption, and full environment loss |
| RPO | Recovery Point Objective: maximum 1 hour of data loss |
| RTO | Recovery Time Objective: system restored within 4 hours of a major failure |

---

## 18. Database Models

### Key Entities

```
Participant
  ├── Integration[]
  │     └── PipelineJob[]
  ├── ComplianceRequirement[]
  │     └── Submission[]
  ├── Incident[]
  │     └── RemediationAction[]
  ├── ParticipantRiskScore (calculated)

GovernanceCommittee
  ├── Member[]
  ├── Meeting[]
  │     ├── Document[]
  │     └── ActionItem[]
  └── Document[]

FieldMapping
  ├── MappingVersion[]
  └── FieldRule[]

User
  ├── AuditLog[]
  └── Notification[]

Report
  └── ReportSchedule[]
```

---

## 19. API Requirements

### 19.1 Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate user, return JWT |
| POST | `/api/auth/mfa/verify` | Verify TOTP code, complete login |
| POST | `/api/auth/logout` | Invalidate session token |
| POST | `/api/auth/password/reset-request` | Send password reset email |
| POST | `/api/auth/password/reset` | Complete password reset with token |

### 19.2 Participants

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/participants` | List all participants (with filters) |
| GET | `/api/participants/:id` | Get participant profile (Participant 360) |
| POST | `/api/participants` | Create new participant |
| PUT | `/api/participants/:id` | Update participant details |
| GET | `/api/participants/:id/submissions` | List submission history |
| GET | `/api/participants/:id/incidents` | List incidents |
| GET | `/api/participants/:id/risk-score` | Get current risk score with breakdown |

### 19.3 Compliance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/compliance/requirements` | List all compliance requirements |
| POST | `/api/compliance/requirements` | Create new requirement |
| POST | `/api/compliance/submissions` | Upload new submission |
| PUT | `/api/compliance/submissions/:id/review` | Approve or reject submission |
| GET | `/api/compliance/incidents` | List all incidents |
| POST | `/api/compliance/incidents` | Create new incident |
| PUT | `/api/compliance/incidents/:id` | Update incident status |

### 19.4 Integrations & Pipelines

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/integrations` | List all integrations |
| POST | `/api/integrations` | Create new integration |
| PUT | `/api/integrations/:id` | Update integration config |
| POST | `/api/integrations/:id/sync` | Trigger manual sync |
| GET | `/api/pipelines/jobs` | List pipeline jobs (with filters) |
| POST | `/api/pipelines/jobs/:id/reprocess` | Reprocess failed job |
| POST | `/api/pipelines/jobs/:id/stop` | Stop running job |
| GET | `/api/pipelines/jobs/:id/logs` | Get execution log |

### 19.5 Governance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/governance/documents` | List governance documents |
| POST | `/api/governance/documents` | Upload new document |
| GET | `/api/governance/meetings` | List meetings |
| POST | `/api/governance/meetings` | Create meeting record |
| PUT | `/api/governance/meetings/:id` | Update meeting (add minutes, decisions) |
| GET | `/api/governance/action-items` | List action items |
| PUT | `/api/governance/action-items/:id` | Update action item status |

### 19.6 Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports` | List generated reports |
| POST | `/api/reports/generate` | Generate new report |
| GET | `/api/reports/:id/download` | Download report file |
| POST | `/api/reports/schedules` | Create recurring report schedule |
| DELETE | `/api/reports/schedules/:id` | Cancel recurring schedule |

### 19.7 Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| POST | `/api/users/invite` | Send invitation to new user |
| PUT | `/api/users/:id/role` | Change user role |
| PUT | `/api/users/:id/deactivate` | Deactivate user account |
| GET | `/api/audit-log` | Retrieve audit log entries |

---

## 20. Error Handling

### 20.1 HTTP Error Codes

| Code | Status | User-Facing Message |
|------|--------|---------------------|
| 400 | Bad Request | "The request could not be understood. Please check your input and try again." |
| 401 | Unauthorized | "You must be logged in to access this page." |
| 403 | Forbidden | "You do not have permission to perform this action." |
| 404 | Not Found | "The requested record could not be found." |
| 409 | Conflict | "This record already exists or conflicts with an existing entry." |
| 413 | Payload Too Large | "The uploaded file exceeds the 50 MB maximum size." |
| 422 | Unprocessable Entity | "The file did not pass validation. See the error report below." |
| 429 | Too Many Requests | "Too many requests. Please wait a moment before trying again." |
| 500 | Internal Server Error | "Something went wrong on our end. The technical team has been notified." |
| 503 | Service Unavailable | "The service is temporarily unavailable. Please try again in a few minutes." |

### 20.2 Validation Errors

- Validation errors SHALL be returned as a structured JSON array identifying the failing field and the specific rule violated.
- The UI SHALL display field-level inline error messages next to the relevant input, not just a top-level banner.
- File validation errors SHALL include the row number, column name, and description of the violation.

---

## 21. Release Plan

### Release 1 — Core Foundation (MVP)

| Area | Features |
|------|----------|
| Authentication | Login, MFA, password reset, RBAC |
| Dashboard | Role-aware KPI dashboard with attention queue |
| Integrations | Participant catalog, manual upload, integration status display |
| Pipeline Monitor | Job list, logs, status, reprocess |
| Participant 360 | Basic profile with integration status and submission history |
| Compliance Monitoring | Compliance register, deadline tracking, submission upload and review |
| Users & Security | User invitation, role management, audit log |
| Notifications | Email + in-app for compliance deadlines and integration failures |

### Release 2 — Governance & Intelligence

| Area | Features |
|------|----------|
| Governance | Document repository, meeting calendar, action items |
| Standards & Mapping | Field mapping management, versioning |
| AI Decision Support | Unusual pattern alerts, participant priority list |
| Reports | All report types, PDF/Excel export, scheduling |
| Participant 360 | Full profile including risk score, incidents, technical performance |
| Notifications | Full notification matrix including governance reminders |

### Release 3 — Advanced Analytics & Automation

| Area | Features |
|------|----------|
| Financial Inclusion | Dashboards segmented by institution type and region |
| Automated API Integrations | Scheduled pull from participant endpoints |
| AI Trend Summaries | Compliance and operational trend reports |
| Settings | Security policy configuration, API key management |
| Regulatory Reporting | Export to national regulatory systems (where defined) |

---

## 22. Testing Requirements

| Test Type | Scope | Acceptance Criteria |
|-----------|-------|---------------------|
| Unit Testing | All service-layer functions and validation rules | ≥ 80% code coverage |
| Integration Testing | API endpoints, database operations, file processing | All endpoints return expected responses for valid and invalid inputs |
| API Testing | Every endpoint in Section 19 | All request/response contracts validated; error codes correct |
| UI Testing | All screens across all 3 roles | Core workflows pass without errors in Chrome, Firefox, Edge |
| Security Testing | Authentication, RBAC, file upload, API rate limiting | Penetration test passes; no Critical or High findings unresolved |
| Load Testing | 100 concurrent users performing dashboard load and report generation | Response time < 2 seconds at 95th percentile |
| User Acceptance Testing (UAT) | End-to-end workflows with RSwitch Compliance and Technical teams | All agreed UAT scenarios signed off by stakeholder |
| Data Validation Testing | File upload validation rules | All invalid file formats and schema violations rejected correctly |
| Infrastructure Testing | CI/CD pipeline, environment parity (staging vs production), SSL, firewall rules | Deployment pipeline runs end-to-end without manual steps; staging mirrors production config |
| Backup & Recovery Testing | Database restore from backup in staging environment | Full restore completes within RTO; restored data matches RPO window |
| Smoke Testing | Core user journeys (login, upload, report generation) run automatically after every production deployment | All smoke tests pass within 5 minutes of deployment; automatic rollback triggered on failure |

---

## 23. Go-Live Checklist

| Item | Responsible | Status |
|------|-------------|--------|
| All Release 1 features complete and tested | Development Team | — |
| UAT sign-off received from RSwitch | Stakeholders | — |
| Security penetration test passed | Security Team | — |
| All Critical and High findings resolved | Development Team | — |
| **DevOps** | | |
| Production environment provisioned and hardened | DevOps / Technical Team | — |
| Staging environment verified to match production config | DevOps / Technical Team | — |
| CI/CD pipeline fully operational (build → test → deploy) | DevOps / Technical Team | — |
| SSL certificate installed, valid, and auto-renewal configured | DevOps / Technical Team | — |
| Firewall rules configured; only ports 80 and 443 open | DevOps / Technical Team | — |
| Secrets moved out of source code into environment variables | DevOps / Technical Team | — |
| Uptime monitoring configured and alerting verified | DevOps / Technical Team | — |
| Error tracking (e.g. Sentry) active in production | DevOps / Technical Team | — |
| Server resource monitoring (CPU, memory, disk) enabled | DevOps / Technical Team | — |
| Database backups configured, automated, and tested restore verified | DevOps / Technical Team | — |
| Disaster recovery runbook documented and reviewed | DevOps / Technical Team | — |
| Background job queue and scheduler running and verified | DevOps / Technical Team | — |
| Smoke tests passing after production deployment | DevOps / Technical Team | — |
| Rollback procedure tested and documented | DevOps / Technical Team | — |
| **Operations** | | |
| User accounts created for all RSwitch staff | Admin | — |
| System documentation complete | Project Team | — |
| User training delivered to all user groups | Project Team | — |
| Rollback plan documented and tested | Technical Team | — |
| Sample/synthetic data replaced with real data | RSwitch Team | — |
| Go-live approval from project sponsor | Stakeholders | — |

---

## 24. Appendices

### 24.1 Glossary

| Term | Definition |
|------|------------|
| RDIP | RSwitch Data Intelligence Platform — the system described in this document |
| RSwitch | Rwanda's national payment switch operator |
| Participant | A financial institution connected to the RSwitch network (bank, e-money issuer, MFI, SACCO) |
| ETL | Extract, Transform, Load — the three-step process of moving and normalizing data |
| Pipeline | An automated ETL job that ingests data from a participant source into RDIP |
| Mapping | A defined set of rules that translate source data fields to a canonical target format |
| MFI | Microfinance Institution |
| SACCO | Savings and Credit Cooperative Organization |
| TOTP | Time-based One-Time Password — the standard behind authenticator app MFA codes |
| PAR | Portfolio at Risk — a financial metric measuring the proportion of a loan portfolio at risk of default |
| ISO 20022 | International standard for electronic data interchange between financial institutions |
| RBAC | Role-Based Access Control |
| JWT | JSON Web Token — a standard for secure session tokens |
| KPI | Key Performance Indicator |
| UAT | User Acceptance Testing |
| WCAG | Web Content Accessibility Guidelines |

### 24.2 Acronyms

| Acronym | Expansion |
|---------|-----------|
| API | Application Programming Interface |
| CSV | Comma-Separated Values |
| XLSX | Microsoft Excel Open XML Spreadsheet |
| XML | Extensible Markup Language |
| PDF | Portable Document Format |
| HTTPS | Hypertext Transfer Protocol Secure |
| TLS | Transport Layer Security |
| AES | Advanced Encryption Standard |
| MFA | Multi-Factor Authentication |
| RBAC | Role-Based Access Control |
| RPO | Recovery Point Objective |
| RTO | Recovery Time Objective |
| SRS | Software Requirements Specification |
| OWASP | Open Web Application Security Project |

### 24.3 References

- RSwitch feedback document — RSwitch project review, July 2026
- ISO 20022 financial messaging standard — iso20022.org
- OWASP Top 10 Web Application Security Risks — owasp.org
- WCAG 2.1 Accessibility Guidelines — w3.org/WAI
- Rwanda Data Protection Law — RISA / NCSA

### 24.4 Architecture Diagram (Conceptual)

```
┌─────────────────────────────────────────────────────────┐
│                  Participant Institutions                 │
│  Commercial Banks │ E-money Issuers │ MFIs │ SACCOs     │
└──────────┬────────────────┬─────────────────────────────┘
           │ Manual Upload  │ Automated API
           ▼                ▼
┌─────────────────────────────────────────────────────────┐
│              RDIP Ingestion Layer                         │
│   File Validation │ Pipeline Jobs │ Standards & Mapping  │
└─────────────────────────┬───────────────────────────────┘
                          │ Normalized Data
                          ▼
┌─────────────────────────────────────────────────────────┐
│              RDIP Application Layer                       │
│  Participant 360 │ Compliance │ Governance │ AI Support  │
│  Financial Inclusion │ Reports │ Dashboard                │
└─────────────────────────┬───────────────────────────────┘
                          │ RBAC API
                          ▼
┌─────────────────────────────────────────────────────────┐
│              RSwitch Internal Users                       │
│  Compliance Users │ Business Users │ Technical/Admin     │
└─────────────────────────────────────────────────────────┘
```

### 24.5 Key Open Items (Action Required)

| Item | Owner | Notes |
|------|-------|-------|
| Confirm available data fields for Financial Inclusion dashboards | RSwitch Team | Required before finalizing FIN module metrics |
| Provide sample data for synthetic dataset generation | RSwitch Team | Required for development and testing |
| Confirm AI model or analytical approach | RSwitch Team + Project Team | Required before implementing AI Decision Support |
| Define regulatory reporting system API for Release 3 | RSwitch + Regulator | Out of scope for v1; needs definition for Release 3 |
| Confirm list of participant institutions for initial onboarding | RSwitch Compliance Team | Needed for UAT planning |

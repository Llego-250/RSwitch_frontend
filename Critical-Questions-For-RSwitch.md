# RSwitch Data Intelligence Platform (RDIP) - Critical Questions for Stakeholder Approval

This document outlines the critical questions, clarifications, and missing information required from the RSwitch stakeholders to proceed with the technical design and implementation of the RSwitch Data Intelligence Platform (RDIP). 

## 1. Compliance Documents & Reporting specifics
*   **Compliance Documents:** What exactly do the required "compliance documents" look like? What specific types of documents (e.g., audit reports, policy acknowledgments, SLA reports) are you expecting participants to submit?
*   **Document Templates:** Is there a standard template or strict format for these compliance documents, or do they vary by institution? 
*   **Current Reporting:** What specific reports do RSwitch teams (Business and Compliance) currently generate manually? What are their exact formats (columns, aggregations) and how often are they generated (daily, weekly, monthly)?

## 2. Integrations & Data Exchange
*   **Core Banking Systems:** What specific core banking systems or mobile money platforms do the participating institutions currently use? Are there any standard APIs already available?
*   **Manual Data Formats:** Since initial data exchange will be manual, what exact file formats (CSV, Excel, XML) will participants use? We need the exact schemas (headers and data types) they will follow.
*   **Transition to Automation:** What is the anticipated timeline or roadmap for transitioning institutions from manual uploads to automated API data transfers?
*   **Integration Visibility:** What exact data points does RSwitch expect to see immediately once an institution is fully integrated?

## 3. Data Availability & Sample Data
*   **Synthetic Data Generation:** When will the RSwitch team provide the promised sample data? *This is a blocker for the project team to generate realistic synthetic datasets for development and testing.*
*   **Financial Inclusion Metrics:** What data fields are realistically available from participants for the Financial Inclusion reporting? We need to confirm this before finalizing the dashboards and metrics (e.g., active users, transaction volumes, demographic indicators).

## 4. AI Decision Support & Risk Assessment
*   **Historical Data for AI:** What specific historical data will be used to establish baselines and support the AI capability for detecting unusual patterns? How many months/years of this data currently exist?
*   **AI Model Selection:** Has RSwitch identified a specific analytical approach or ML model, or is the technical team expected to propose one based on the provided historical data?
*   **Risk Score Calculation:** Section 5.6 suggests weights for the Participant Risk Score (Integration 30%, Compliance 30%, Incidents 20%, Overdue 20%). Are these weights confirmed, or do they need to be redefined based on business priorities?

## 5. Governance & General Implementation
*   **Initial Rollout:** Which specific participant institutions are targeted for the initial onboarding and User Acceptance Testing (UAT)?
*   **Governance Structure:** What are the exact names and structures of the current board, steering committees, and working groups that need to be modeled in the Governance module?
*   **Regulatory API (Release 3):** For future phases, are there existing API documentations for the National Regulatory Reporting System?

## 6. Ambiguities from the SRS to Clarify
*   **AI Alert Auto-Escalation:** The SRS specifies a default of 3 days before an acknowledged alert is escalated. Is 3 days the correct business SLA for this?
*   **Incident Severities:** The SRS mentions Low/Medium/High/Critical incidents. What are the specific definitions or examples of what constitutes a "Critical" versus a "High" incident in the context of RSwitch?

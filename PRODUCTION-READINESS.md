# Meridian production-readiness plan

## Current assessment

The current `index.html` application is a useful single-browser training demonstration. It is not ready for production assessment or multi-user operations. The UI stores review decisions, ticket work, corrections, and QA history in browser storage. The catalog and bundled reference answers are delivered to the browser, so a trainee can inspect the expected labels and seeded issue notes. A user profile in the UI is a fixed demo identity rather than an authenticated account.

The `supabase/` directory contains a backend foundation and browser adapter, but the main workbench does not load that adapter. The SQL/backend model also predates some of the latest demo ticket workflow fields and statuses. This plan treats the backend as a starting point for design review, not as a production-ready service.

## Scope for the next iteration

The requested target is a **single-browser training demonstration** with work-like flow. Keep browser-local persistence and the simulated trainee/reviewer handoffs. Do not make authentication, multi-tenant hosting, or shared server records prerequisites for this iteration. Continue to label all data, QA runs, scores, reviewer actions, and handoff exports as simulated/local.

For this scope, production readiness means the demo opens reliably, preserves a trainee's local work, enforces realistic workflow steps, supports a credible handoff, and explains which actions are simulated. It does not mean that the demo becomes an authoritative assessment or shared operations system.

## Recommended release order

### Gate 0 - Confirm the operating model

For future expansion, decide whether a later version will support:

- private trainee and reviewer accounts, or a public practice demo;
- one organization or multiple organizations;
- one active assignment or multiple concurrent assignments;
- a blind assessment, a practice tool, or both as separate modes;
- transcript retention period, data export, and deletion expectations;
- who can assign, edit, review, reopen, and report on tickets and decisions.

Keep the current demo available as a separate, clearly labeled mode. Do not present demo scores as verified trainee performance.

### Gate 1 - Protect assessment integrity (only if using for scored work)

Before using the tool for scored work:

1. Remove reference labels, correctness flags, seeded supplier answers, and immediate answer reveals from every browser-delivered file.
2. Load assignment reference labels only into a private server schema. Verify anon and authenticated roles cannot read the schema, tables, exports, logs, or reports containing answers.
3. Make server-side submissions authoritative. Derive trainee identity from the verified session; never accept it from a request body.
4. Define correction, escalation, skipped-item, and resubmission rules, then calculate coverage and accuracy consistently on the server.
5. Create an assessment mode without training hints and a practice mode with clearly marked feedback.

**Release gate:** a trainee with browser developer tools can inspect only the data and feedback intended for their role. Add automated negative tests proving reference data is inaccessible.

### Gate 2 - Authentication, authorization, and tenant boundaries

1. Replace the hard-coded trainee identity with invited-user authentication and account recovery.
2. Enforce role and assignment membership in database policies and server-side functions. UI visibility alone is not authorization.
3. If more than one customer or team will use the product, add an organization identifier to every relevant record and enforce tenant isolation in row-level security.
4. Review every `SECURITY DEFINER` function, grant, policy, and report path against trainee, reviewer, and administrator roles.
5. Define account deactivation, reviewer provisioning, audit access, and incident response.

**Release gate:** automated tests show that users cannot read or mutate another trainee's records, assignments, tickets, reports, or organization data.

### Gate 3 - Durable workflows and data migration

1. Connect the workbench to the backend adapter and make the server the source of truth for reviews, tickets, corrections, and workflow events.
2. Reconcile the SQL ticket schema with the current UI lifecycle: `new`, `triaged`, `in_progress`, `blocked`, `in_review`, `closed`, and `cancelled`, along with evidence references, affected field, proposed correction, due date, blocker notes, reviewer decision, and correction verification.
3. Add assignment membership checks, server timestamps, optimistic concurrency or version checks, and idempotency for retryable submissions.
4. Provide a safe export/import or migration path for any local demo data users need to keep. Do not silently treat browser local storage as official records.
5. Define retention, deletion, backup, restoration, and audit-log policies before collecting real trainee data.

**Release gate:** the same user can sign in on a second browser and see the same authorized state; concurrent changes and retry behavior are handled predictably.

### Gate 4 - Application security and privacy

1. Set a deployment-specific Content Security Policy and security headers. First remove or account for inline scripts, inline styles, and the embedded QA fixture so the policy is enforceable.
2. Keep output encoding at every HTML insertion point; prefer `textContent` and DOM construction for user-controlled text. Review ticket, interview, and imported-data rendering for stored cross-site scripting.
3. Pin and review dependency versions, including Deno/npm imports and browser-loaded libraries. Add a dependency update and vulnerability review process.
4. Apply request-size limits, field limits, strict schemas, and per-account rate limits to every Edge Function. Validate body shape before using fields and reject oversized transcripts before truncation.
5. Restrict CORS to documented deployment origins where appropriate. CORS is not authorization; keep verified identity and database policy checks on every endpoint.
6. Decide whether interview answers may be sent to the external model provider, provide an appropriate notice, minimize retained data, and implement deletion/retention controls. Keep server keys in managed secrets only.

**Release gate:** security review covers browser bundles, network requests, server functions, storage, access policies, and sensitive-data lifecycle.

### Gate 5 - Reliability, accessibility, and operations

1. Add structured error reporting with request IDs and useful user recovery actions. Keep secrets, tokens, and full interview answers out of logs.
2. Add service health checks, alerting for model/API failures and database errors, and documented backup/restore procedures.
3. Make loading, retry, offline, empty, expired-session, and storage-failure states explicit. Preserve unsent work safely and show when a save is confirmed by the server.
4. Review keyboard navigation, focus management, screen-reader announcements, contrast, zoom, and mobile layouts across each workflow.
5. Add automated unit tests, database/RLS tests, Edge Function tests, and end-to-end browser checks for the primary trainee and reviewer journeys. Run them in CI on every change.
6. Add a staging deployment, migration review, rollback steps, and a release checklist before production changes.

**Release gate:** a staging release can be deployed, monitored, backed up, restored, and rolled back by someone other than the original developer.

## First implementation milestone: realistic local workday

Keep the simple single-browser model and build a convincing, recoverable work cycle:

1. Preserve per-product review drafts while navigating and reloading; clearly show which items have drafts and which are submitted.
2. Keep a small local event log for review, ticket, QA, shift start, reset, and handoff actions.
3. Provide a downloadable shift handoff with completed, outstanding, skipped, and drafted work; active/blocked/overdue tickets; recent QA results; and next owners.
4. Make ticket triage, assignment, investigation, blockers, correction, review, return, approval, and closure transitions visible and require the right evidence at each gate.
5. Make reset behavior clear and reliable; allow review progress to reset without deleting tickets or QA history.
6. Label the mock reviewer, shared team names, supplier data, and QA fixture as simulated so the trainee understands the practice boundary.

The current workbench iteration has begun these steps with local review draft saving, a persistent event feed, review evidence attestation, and a shift handoff export. The simulated workflow remains local to this browser.

### Local continuity update - 23 November 2026

This dated demo copy adds a validated local workspace backup/restore path and autosaves an in-progress written interview so the trainee can resume after a reload. The backup uses an allowlist of PT-100 practice data, checks its format and size, excludes authentication tokens and secrets, confirms before replacing local workspace state, and attempts rollback on a storage write failure. The interview offers an explicit resume/discard choice. These changes improve local recovery but do not add server persistence, cross-device synchronization, a shared reviewer queue, or authoritative records. The backup file may contain trainee-written responses and should be handled as private practice data.

Do not point a production domain at the current static demo and call it production. The server-side assessment foundation should be reviewed and tested before it becomes authoritative.

## Findings to resolve during implementation

- `README.md` describes GitHub Pages as a deployment option, while the same repository ships reference labels and immediate practice feedback. That deployment is suitable only for the explicitly labeled demo.
- The workbench uses local storage as the source of truth and has no cross-device synchronization or reviewer visibility.
- `supabase/browser-client.js` is an optional adapter and is not loaded by `index.html`.
- The current backend migration's ticket fields and lifecycle do not match the latest local ticket UI and shared `ticketing.js` rules.
- The interview function sends answer transcripts to an external model service. Its privacy, retention, request-size, rate-limit, and failure behavior need a deliberate production policy.
- Automated tests currently cover catalog data and ticket-domain rules, but there are no evident browser journey, backend authorization, database policy, or deployment pipeline checks.

## Definition of production ready

Meridian is ready for a controlled production pilot only when all release gates above have owners and acceptance evidence, the blind-assessment data path is verified, trainee and reviewer permissions pass negative tests, server persistence is authoritative, sensitive-data handling is documented, and the pilot has monitoring, backup, rollback, and support procedures.

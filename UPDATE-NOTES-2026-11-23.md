# Meridian Workbench update · 23 November 2026

## Delivered in this copy

- Added Overview controls to check local browser-storage availability and download or restore a PT-100 workspace backup.
- Added a versioned, application- and assignment-scoped backup envelope with a file-size limit, key allowlist, JSON parsing, and structure checks before any restore is accepted.
- Made restore an explicit replacement action, with a confirmation that explains the scope and a best-effort rollback if browser storage fails while writing.
- Excluded authentication tokens and server credentials from backup data. The feature only reads a fixed allowlist of practice-work keys.
- Added responsive styling and screen-reader status feedback for the workspace controls.
- Added recoverable in-progress mock interviews: answers and the current response draft save locally, the trainee can resume or deliberately discard an attempt, and a failed final grading request can be retried with all 30 answers intact.
- Included the recoverable interview attempt in workspace backups, and updated the interview notice to explain device-local answer recovery and final transcript submission.
- Hardened the locally saved QA run history and interview history displays to render stored text as text, and made QA history ignore malformed run records.
- Updated the project guide to explain what data is carried, how restore behaves, and the fact that local backups are not shared or authoritative records.

## Why

The application already supports a realistic local work cycle, but browser-only storage made a trainee’s work difficult to preserve or move to another device. Portable, validated backups improve continuity while keeping this release a single-browser demonstration.

## Still simulated / not production-connected

Product reviews, tickets, corrections, QA fixtures, reviewer activity, and handoffs remain local to the browser. Restoring a backup does not sync it to a team or validate it as an official record. The interview scoring service remains separately configuration-dependent. The application still exposes practice references and is unsuitable for blind assessment or live commerce operations.

## Next production-spec work

1. Authenticated trainee/reviewer roles and server-authoritative records.
2. Private reference answers and a protected assessment mode.
3. Shared ticket routing, notifications, and immutable audit history.
4. Staging/CI integration for checkout tests, with monitored release and rollback.
5. Privacy and retention controls for written interview transcripts and model scoring.
6. End-to-end accessibility, security, data migration, and recovery review before any pilot.

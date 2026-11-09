# Isensix Calibration Dashboard

This repository contains the Isensix calibration dashboard and its supporting Cloudflare Worker/D1 application. The tools help Field Operations technicians plan, schedule, perform, and review Isensix calibration work.

## Canonical repositories

Dashboard:

https://github.com/LeightonSolo/isensix-calibration-visualizer

Chrome extension:

https://github.com/LeightonSolo/IsensixScripts

The Chrome extension repository is separate. Do not assume that extension changes belong in this repository.

## System data flow

1. Tampermonkey Chrome extension scripts run in technicians' browsers.
2. The scripts read relevant data from Isensix customer servers.
3. The scripts send normalized data to Cloudflare Workers.
4. Cloudflare Workers store and serve data through the `calibration-db` Cloudflare D1 database.
5. This repository presents calibration history, server inventory, Job Information, analytics, calendar scheduling, travel planning, and reports.

## Repository responsibilities

This repository owns:

- Dashboard pages and browser-side UI
- Cloudflare Worker routes and API contracts
- Cloudflare D1 schemas, migrations, and queries
- Calibration history and server inventory views
- Job Information records, analytics, and cleanup workflows
- Calendar scheduling, technician assignments, and travel details
- Reports and summary views

The `IsensixScripts` repository owns:

- Tampermonkey/Chrome extension scripts
- Customer-server page integration
- Browser-side data extraction and normalization
- Requests that send collected data to the Worker

## Working rules

- Identify the active repository before editing. Use the Git remote and repository contents rather than assuming a local filesystem path.
- Treat Worker endpoints, request payloads, D1 schemas, and field names as shared interfaces between the two repositories.
- When changing a field sent by the Chrome extension, inspect the corresponding Worker consumer, D1 schema, and dashboard usage.
- When changing an API response or database field, check whether the Chrome extension depends on it before removing or renaming it.
- Distinguish raw database rows, canonical/de-duplicated records, active records, and historical records. Analytics must state which population it represents.
- Preserve existing user data and avoid destructive database operations unless explicitly requested and the exact target is verified.
- Prefer small, reviewable changes and run the relevant tests or type checks after edits.
- If code and this document disagree, inspect the current implementation, report the conflict, and follow the user's explicit request.

## Application location

The primary Worker application is currently under `flat-tree-380f/`. Cloudflare-specific instructions and commands are in `flat-tree-380f/AGENTS.md`; follow both files when working there.

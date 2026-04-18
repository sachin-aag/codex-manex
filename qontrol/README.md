# Qontrol

`Qontrol` is a hackathon MVP for QM ticket triage, routing, follow-up, and verification.

## What is implemented

- Light-mode QM kanban board
- Ticket detail workspace
- Story match / routing rationale
- Story-aware triage visualizations
- Similar tickets panel
- Editable assignment email draft
- GitHub issue creation during approve-and-route
- GitHub webhook sync for issue / comment / project status updates
- QM verification close / reroute flow
- Learnings capture in the case history

## Data mode

- Kanban reads real defects/claims from PostgREST (`v_defect_detail`, `v_field_claim_detail`).
- Case state is persisted in `qontrol_case_state` (see migration `supabase/migrations/00003_qontrol_case_state.sql`).
- Assignment and close actions write back to `product_action`; close also writes to `rework` when a `defect_id` is available.

## What is still mocked

- Email delivery
- Call scheduling / escalation workflows

The UI now creates a GitHub issue when QM approves and routes a case. GitHub Project board sync is limited to `R&D` cases, while other team handoff tools remain mocked in the UI. Email delivery and call scheduling also remain simulated.

## Environment

Create `qontrol/.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Required values:

- `MANEX_API_URL` - your team PostgREST base URL (for example `http://<vm>:8001`)
- `MANEX_API_KEY` - your team anon API key
- `QONTROL_PUBLIC_BASE_URL` - public URL for backlinking into a case from GitHub
- `GITHUB_TOKEN` - PAT with issue/project write access to the public repo
- `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` - public repo used for external ticket handoff
- `GITHUB_PROJECT_OWNER` / `GITHUB_PROJECT_OWNER_TYPE` / `GITHUB_PROJECT_NUMBER` - optional GitHub Project v2 board target
- `GITHUB_WEBHOOK_SECRET` - shared secret used to verify GitHub webhook deliveries

## Run locally

```bash
cd qontrol
npm install
npm run dev -- --hostname 127.0.0.1 --port 3005
```

Open [http://127.0.0.1:3005](http://127.0.0.1:3005).

## Build check

```bash
cd qontrol
npm run build
```

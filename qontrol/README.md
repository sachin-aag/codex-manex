# Qontrol

`Qontrol` is a hackathon MVP for QM ticket triage, routing, follow-up, and verification.

## What is implemented

- Light-mode QM kanban board
- Ticket detail workspace
- Story match / routing rationale
- Similar tickets panel
- Editable assignment email draft
- Mock external ticket creation
- Mock inbound team update from Jira-style system
- QM verification close / reroute flow
- Learnings capture in the case history

## Data mode

- Kanban reads real defects/claims from PostgREST (`v_defect_detail`, `v_field_claim_detail`).
- Case state is persisted in `qontrol_case_state` (see migration `supabase/migrations/00003_qontrol_case_state.sql`).
- Assignment and close actions write back to `product_action`; close also writes to `rework` when a `defect_id` is available.

## What is still mocked

- External ticketing integrations
- Two-way sync from systems like Jira
- Email delivery
- Call scheduling / escalation workflows

The UI shows where those actions live in the product and simulates the workflow locally.

## Environment

Create `qontrol/.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Required values:

- `MANEX_API_URL` - your team PostgREST base URL (for example `http://<vm>:8001`)
- `MANEX_API_KEY` - your team anon API key

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

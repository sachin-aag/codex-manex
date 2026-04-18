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

## What is mocked

- External ticketing integrations
- Two-way sync from systems like Jira
- Email delivery
- Call scheduling / escalation workflows

The UI shows where those actions live in the product and simulates the workflow locally.

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

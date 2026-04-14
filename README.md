# Manex Hackathon — Quality Report Module

Build the next-generation Quality Report: replace static 8D/FMEA Excel
documents with an interactive LLM-powered copilot. Three pillars:

1. **Intelligent generation** — LLM drafts problem descriptions, root-cause
   hypotheses, and report content from structured factory data.
2. **Innovative visualization** — interactive fault trees, timelines, Pareto
   analyses, BOM traceability views — whatever best exposes the story in
   the data.
3. **Closed-loop workflow** — write initiatives back to the database, assign
   ownership, and track progress.

## What we provide

- A PostgreSQL database matching Manex production (19 tables, strict subset).
- Synthetic but realistic data (~7,000 rows) with **four explicit root-cause
  stories** documented in [docs/DATA_PATTERNS.md](docs/DATA_PATTERNS.md).
- Three ways to access the data (REST, SQL editor, direct psql).
- A per-team isolated Supabase-lite stack so teams cannot interfere.
- Shared AI-generated defect images served as static files.

## Docs

- [docs/QUICKSTART.md](docs/QUICKSTART.md) — connect in < 5 minutes.
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) — endpoints, examples in curl / JS / Python.
- [docs/SCHEMA.md](docs/SCHEMA.md) — entities, fields, ER diagram.
- [docs/DATA_PATTERNS.md](docs/DATA_PATTERNS.md) — the four stories in the dataset.

## Running locally (one team, local)

```bash
./scripts/deploy-team.sh local 1
cat handouts/team-local.txt
```

Adds a stack on ports 8001 / 8401 / 5431 with a unique API key.

## Running on the VM (operators only)

```bash
# populate teams.txt with one slug per line, then:
./scripts/deploy-all.sh
```

Each team gets their own isolated stack + credentials. Hand out the
generated `handouts/team-<slug>.txt`.

## Regenerating seed data

```bash
cd data-generation
pip install -r requirements.txt
# (optional) refresh LLM texts — requires ANTHROPIC_API_KEY
python generate_texts.py
python generate.py
# seed.sql now refreshed; redeploy or run reset-team.sh
```

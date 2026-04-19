BEGIN;

CREATE TABLE IF NOT EXISTS qontrol_initiative (
  initiative_id   TEXT PRIMARY KEY CHECK (initiative_id ~ '^INI-[0-9]{5}$'),
  title           TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN (
                    'supplier_switch', 'recalibration', 'design_change',
                    'training', 'process_control', 'other'
                  )),
  status          TEXT NOT NULL CHECK (status IN (
                    'proposed', 'in_review', 'approved', 'in_progress',
                    'completed', 'rejected'
                  )),
  decided_at      TIMESTAMPTZ,
  effective_from  TIMESTAMPTZ,
  owner           TEXT,
  target_scope    JSONB,
  expected_impact JSONB,
  reasoning       TEXT,
  estimated_cost  NUMERIC,
  source          TEXT NOT NULL CHECK (source IN (
                    'agent_proposed', 'seeded', 'manual'
                  )),
  linked_case_ids TEXT[],
  deck_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qontrol_initiative_status
  ON qontrol_initiative(status);

CREATE INDEX IF NOT EXISTS idx_qontrol_initiative_effective_from
  ON qontrol_initiative(effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_qontrol_initiative_kind
  ON qontrol_initiative(kind);

GRANT SELECT ON qontrol_initiative TO seed_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON qontrol_initiative TO team_writer;

COMMIT;

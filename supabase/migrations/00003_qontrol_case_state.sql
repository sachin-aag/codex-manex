BEGIN;

CREATE TABLE IF NOT EXISTS qontrol_case_state (
  case_id TEXT PRIMARY KEY CHECK (case_id ~ '^(DEF|FC)-[0-9]{5}$'),
  source_type TEXT NOT NULL CHECK (source_type IN ('defect', 'claim')),
  source_row_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES product(product_id) ON DELETE RESTRICT,
  defect_id TEXT REFERENCES defect(defect_id) ON DELETE RESTRICT,
  current_state TEXT NOT NULL CHECK (
    current_state IN ('unassigned', 'assigned', 'returned_to_qm_for_verification', 'closed')
  ),
  assignee TEXT,
  owner_team TEXT,
  qm_owner TEXT,
  state_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_row_id)
);

CREATE INDEX IF NOT EXISTS idx_qontrol_case_state_source
  ON qontrol_case_state(source_type, source_row_id);

CREATE INDEX IF NOT EXISTS idx_qontrol_case_state_current_state
  ON qontrol_case_state(current_state);

CREATE INDEX IF NOT EXISTS idx_qontrol_case_state_product
  ON qontrol_case_state(product_id);

GRANT SELECT ON qontrol_case_state TO seed_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON qontrol_case_state TO team_writer;

COMMIT;

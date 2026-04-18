BEGIN;

ALTER TABLE qontrol_case_state
  ADD COLUMN IF NOT EXISTS external_ticket JSONB;

COMMIT;

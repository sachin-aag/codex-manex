BEGIN;

-- Claim-to-claim similarity now runs at request time via embeddings in the app layer.
-- This migration is intentionally a no-op so schema history stays aligned with the
-- current runtime approach.

COMMIT;

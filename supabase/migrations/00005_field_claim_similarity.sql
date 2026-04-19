BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE field_claim
  ADD COLUMN IF NOT EXISTS similar_to TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE OR REPLACE FUNCTION refresh_field_claim_similarity() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE field_claim
  SET similar_to = ARRAY[]::TEXT[];

  WITH normalized_claims AS (
    SELECT
      fc.field_claim_id,
      fc.claim_ts,
      NULLIF(
        trim(
          regexp_replace(
            lower(COALESCE(fc.complaint_text, '')),
            '[^a-z0-9]+',
            ' ',
            'g'
          )
        ),
        ''
      ) AS normalized_complaint
    FROM field_claim fc
  ),
  ranked_matches AS (
    SELECT
      base.field_claim_id,
      other.field_claim_id AS similar_claim_id,
      ROW_NUMBER() OVER (
        PARTITION BY base.field_claim_id
        ORDER BY
          similarity(base.normalized_complaint, other.normalized_complaint) DESC,
          CASE
            WHEN base.claim_ts IS NULL OR other.claim_ts IS NULL THEN 999999999
            ELSE ABS(EXTRACT(EPOCH FROM (base.claim_ts - other.claim_ts)))
          END ASC,
          other.field_claim_id ASC
      ) AS rank_no
    FROM normalized_claims base
    JOIN normalized_claims other
      ON base.field_claim_id <> other.field_claim_id
    WHERE base.normalized_complaint IS NOT NULL
      AND other.normalized_complaint IS NOT NULL
  ),
  aggregated_matches AS (
    SELECT
      field_claim_id,
      array_agg(similar_claim_id ORDER BY rank_no) AS similar_to
    FROM ranked_matches
    WHERE rank_no <= 3
    GROUP BY field_claim_id
  )
  UPDATE field_claim fc
  SET similar_to = aggregated_matches.similar_to
  FROM aggregated_matches
  WHERE fc.field_claim_id = aggregated_matches.field_claim_id;
END;
$$;

SELECT refresh_field_claim_similarity();

CREATE OR REPLACE VIEW v_field_claim_detail AS
SELECT
  fc.field_claim_id,
  fc.product_id,
  fc.claim_ts,
  fc.market,
  fc.complaint_text,
  fc.similar_to,
  fc.reported_part_number,
  fc.image_url,
  fc.cost,
  fc.detected_section_id,
  fc.mapped_defect_id,
  fc.notes,
  p.build_ts                      AS product_build_ts,
  p.article_id,
  a.name                          AS article_name,
  d.defect_code                   AS mapped_defect_code,
  d.severity                      AS mapped_defect_severity,
  pm.title                        AS reported_part_title,
  pm.commodity                    AS reported_part_commodity,
  s.name                          AS detected_section_name,
  (EXTRACT(EPOCH FROM (fc.claim_ts - p.build_ts)) / 86400)::int
                                  AS days_from_build
FROM field_claim fc
JOIN product p       ON fc.product_id = p.product_id
JOIN article a       ON p.article_id = a.article_id
LEFT JOIN defect d   ON fc.mapped_defect_id = d.defect_id
LEFT JOIN part_master pm ON fc.reported_part_number = pm.part_number
LEFT JOIN section s  ON fc.detected_section_id = s.section_id;

COMMIT;

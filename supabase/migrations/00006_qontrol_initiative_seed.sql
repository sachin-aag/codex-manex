-- Seed the two past decisions that anchor the Portfolio Insights demo:
--   INI-00001 -- the supplier switch that LATER caused Story 1 (SB-00007 bad batch).
--   INI-00002 -- the torque-wrench recalibration that resolved Story 2 (VIB_FAIL cluster).
-- ON CONFLICT DO NOTHING so re-running migrations is idempotent.

BEGIN;

INSERT INTO qontrol_initiative (
  initiative_id, title, kind, status,
  decided_at, effective_from,
  owner, target_scope, expected_impact,
  reasoning, estimated_cost, source, linked_case_ids
) VALUES (
  'INI-00001',
  'Switched to ElektroParts GmbH for PM-00008 100uF capacitors',
  'supplier_switch',
  'completed',
  '2025-10-15T09:00:00Z',
  '2025-10-22T00:00:00Z',
  'Supply Chain',
  jsonb_build_object(
    'part_number', 'PM-00008',
    'new_supplier', 'ElektroParts GmbH',
    'previous_supplier', 'KondensatorWerk AG'
  ),
  jsonb_build_object(
    'unit_cost_delta_pct', -18,
    'expected_quality_impact', 'neutral'
  ),
  'Approved supplier change to ElektroParts GmbH for the 100uF capacitor line item (PM-00008). Decision driven by a documented 18% unit-cost reduction at equivalent spec. Incoming-quality plan kept at the default sampling rate.',
  0,
  'seeded',
  ARRAY[]::TEXT[]
)
ON CONFLICT (initiative_id) DO NOTHING;

INSERT INTO qontrol_initiative (
  initiative_id, title, kind, status,
  decided_at, effective_from,
  owner, target_scope, expected_impact,
  reasoning, estimated_cost, source, linked_case_ids
) VALUES (
  'INI-00002',
  'Recalibrated torque wrench at Montage Linie 1',
  'recalibration',
  'completed',
  '2026-01-05T08:30:00Z',
  '2026-01-08T00:00:00Z',
  'Manufacturing / Process',
  jsonb_build_object(
    'section_name', 'Montage Linie 1',
    'defect_code', 'VIB_FAIL',
    'equipment', 'torque wrench'
  ),
  jsonb_build_object(
    'expected_vib_fail_reduction_pct', -100,
    'expected_effective_weeks', 2
  ),
  'VIB_FAIL cluster at Montage Linie 1 across weeks 49-52/2025 triggered a scheduled calibration of the torque wrench. Screws were being under-torqued, amplifying housing vibration above the end-of-line spec.',
  0,
  'seeded',
  ARRAY[]::TEXT[]
)
ON CONFLICT (initiative_id) DO NOTHING;

COMMIT;

-- Migration: Add trigger tracking to pricing reapply jobs
-- Stores which pricing rule triggered the repricing job and a snapshot of its properties

ALTER TABLE pricing_reapply_jobs
  ADD COLUMN trigger_type TEXT CHECK (trigger_type IN ('manual', 'rule_create', 'rule_update')),
  ADD COLUMN triggered_by_rule_id UUID REFERENCES pricing_rules(id) ON DELETE SET NULL,
  ADD COLUMN trigger_rule_snapshot JSONB;

-- Index for querying jobs by trigger rule
CREATE INDEX idx_pricing_reapply_jobs_rule ON pricing_reapply_jobs(triggered_by_rule_id) WHERE triggered_by_rule_id IS NOT NULL;

COMMENT ON COLUMN pricing_reapply_jobs.trigger_type IS 'Type of trigger: manual (user initiated), rule_create (after creating a rule), rule_update (after updating a rule)';
COMMENT ON COLUMN pricing_reapply_jobs.triggered_by_rule_id IS 'ID of the pricing rule that triggered this job (if applicable)';
COMMENT ON COLUMN pricing_reapply_jobs.trigger_rule_snapshot IS 'Snapshot of the pricing rule properties at job creation time';

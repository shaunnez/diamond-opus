-- Error logs table for persisting service exceptions to Supabase
-- Captures unique errors from scheduler, worker, consolidator, and API

CREATE TABLE IF NOT EXISTS error_logs (
  id            BIGSERIAL PRIMARY KEY,
  service       VARCHAR(50)  NOT NULL,  -- e.g. 'scheduler', 'worker', 'consolidator', 'api'
  error_message VARCHAR(255) NOT NULL,  -- exception message, trimmed to 255 chars
  stack_trace   TEXT,                   -- optional truncated stack trace
  context       JSONB,                  -- optional structured context (runId, partitionId, etc.)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for querying by service and time
CREATE INDEX IF NOT EXISTS idx_error_logs_service_created
  ON error_logs (service, created_at DESC);

-- Index for time-based queries (dashboard pagination)
CREATE INDEX IF NOT EXISTS idx_error_logs_created
  ON error_logs (created_at DESC);

-- Auto-cleanup: keep only 30 days of error logs
-- Run periodically via Supabase cron or manual cleanup
-- DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '30 days';

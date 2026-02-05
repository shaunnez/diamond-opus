-- Rate limiter table for global request throttling
-- Uses fixed window token bucket pattern to limit Nivoda API requests across all workers

CREATE TABLE IF NOT EXISTS rate_limit (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 0,
  -- Metadata for monitoring
  last_request_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Initialize the global rate limit row
INSERT INTO rate_limit (key, window_start, request_count)
VALUES ('nivoda_global', NOW(), 0)
ON CONFLICT (key) DO NOTHING;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_key ON rate_limit(key);

COMMENT ON TABLE rate_limit IS 'Global rate limiting for external API calls using fixed window token bucket';
COMMENT ON COLUMN rate_limit.window_start IS 'Start of the current 1-second rate limit window';
COMMENT ON COLUMN rate_limit.request_count IS 'Number of requests made in the current window';

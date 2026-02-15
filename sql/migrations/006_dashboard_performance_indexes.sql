-- Migration 006: Dashboard performance indexes
-- Targets: Runs page, Consolidation page, Feeds page, Error Logs, Diamond Search

-- 1a. partition_progress: completed worker counts (Runs + Consolidation pages)
-- Existing idx_partition_progress_incomplete covers completed = false only.
-- Analytics queries repeatedly count WHERE completed = TRUE per run_id.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_partition_progress_completed
  ON partition_progress(run_id)
  WHERE completed = true;

-- 1b. worker_runs: partial indexes for hot status values (Runs page)
-- getRunsWithStats() counts completed/failed workers per run via correlated subqueries.
-- Existing idx_worker_runs_status covers (run_id, status) but scans all statuses.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_worker_runs_completed
  ON worker_runs(run_id)
  WHERE status = 'completed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_worker_runs_failed
  ON worker_runs(run_id)
  WHERE status = 'failed';

-- 1c. run_metadata: feed + started_at composite (Runs + Consolidation pages)
-- Both pages filter by feed and sort by started_at DESC.
-- Existing idx_run_metadata_feed only covers (feed).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_run_metadata_feed_started
  ON run_metadata(feed, started_at DESC);

-- 1d. Raw tables: run_id + consolidated + consolidation_status composite (Consolidation page)
-- getRunsConsolidationStatus() does LEFT JOIN LATERAL aggregating these columns per run_id.
-- Existing idx_raw_*_run_id only covers (run_id).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_raw_nivoda_run_consolidated
  ON raw_diamonds_nivoda(run_id, consolidated, consolidation_status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_raw_demo_run_consolidated
  ON raw_diamonds_demo(run_id, consolidated, consolidation_status);

-- 1e. diamonds: status + feed composite (Feeds page)
-- getFeedStats() runs WHERE status = 'active' GROUP BY feed.
-- Existing separate indexes on status and feed can't serve both filter + GROUP BY.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diamonds_status_feed
  ON diamonds(status, feed);

-- 1f. error_logs: JSONB runId extraction
-- getErrorLogs() filters on context->>'runId' which is a full table scan today.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_error_logs_context_runid
  ON error_logs ((context->>'runId'));

-- 1g. diamonds: expression indexes for UPPER() in search queries
-- Search uses UPPER(cut), UPPER(polish), UPPER(symmetry) which bypass existing btree indexes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diamonds_upper_cut
  ON diamonds(UPPER(cut)) WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diamonds_upper_polish
  ON diamonds(UPPER(polish)) WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diamonds_upper_symmetry
  ON diamonds(UPPER(symmetry)) WHERE status = 'active';

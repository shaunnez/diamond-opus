-- Index Optimization Migration
-- This migration adds indexes to optimize query performance based on actual query patterns

-- ============================================================================
-- HOLD_HISTORY TABLE
-- ============================================================================

-- Query: SELECT * FROM hold_history WHERE diamond_id = $1 ORDER BY created_at DESC
-- Issue: Foreign key column without index, causes sequential scan
-- Impact: High - called when viewing diamond hold history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hold_history_diamond_id
ON hold_history(diamond_id, created_at DESC);

-- ============================================================================
-- PURCHASE_HISTORY TABLE
-- ============================================================================

-- Query: Lookups by diamond_id for purchase history
-- Issue: Foreign key column without index
-- Impact: Medium - called when viewing diamond purchase history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_history_diamond_id
ON purchase_history(diamond_id);

-- ============================================================================
-- RAW_DIAMONDS_NIVODA TABLE
-- ============================================================================

-- Query: SELECT * FROM raw_diamonds_nivoda WHERE consolidated = FALSE ORDER BY created_at ASC LIMIT $1 OFFSET $2
-- Issue: Current partial index covers filter but not the sort order
-- Impact: High - consolidator paginates through unconsolidated records
-- Note: This composite index replaces the need for idx_raw_nivoda_consolidated for this query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_raw_nivoda_unconsolidated_created
ON raw_diamonds_nivoda(created_at ASC) WHERE NOT consolidated;

-- ============================================================================
-- DIAMONDS TABLE
-- ============================================================================

-- Query: searchDiamonds with lab_grown filter: WHERE ... AND lab_grown = $n
-- Issue: lab_grown not in any index, yet commonly filtered
-- Impact: High - lab-grown diamonds are a distinct category users filter on
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diamonds_lab_grown
ON diamonds(lab_grown) WHERE status = 'active';

-- Query: searchDiamonds with cut filter: WHERE ... AND cut = ANY($n)
-- Issue: cut not indexed, commonly used in search filters
-- Impact: Medium - cut quality is a common search criterion
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diamonds_cut
ON diamonds(cut) WHERE status = 'active';

-- Query: searchDiamonds ORDER BY created_at DESC (default sort)
-- Issue: No index on created_at for active diamonds
-- Impact: High - default sort order for all search results
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diamonds_created
ON diamonds(created_at DESC) WHERE status = 'active';

-- Query: Soft delete lookups: WHERE status = 'deleted' and deleted_at queries
-- Issue: No index specifically for finding deleted diamonds
-- Impact: Low - administrative queries only, but good to have for cleanup jobs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diamonds_deleted
ON diamonds(deleted_at) WHERE status = 'deleted';

-- Query: searchDiamonds with carats range: WHERE carats >= $n AND carats <= $m
-- Issue: carats is in composite index but range queries benefit from single-column index
-- Impact: Medium - carat weight is one of the most common filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diamonds_carats
ON diamonds(carats) WHERE status = 'active';

-- ============================================================================
-- WORKER_RUNS TABLE
-- ============================================================================

-- Query: SELECT * FROM worker_runs WHERE run_id = $1 ORDER BY started_at
-- Issue: Current index is (run_id, status) but query orders by started_at
-- Impact: Low - administrative/monitoring queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_worker_runs_run_started
ON worker_runs(run_id, started_at);

-- ============================================================================
-- RUN_METADATA TABLE
-- ============================================================================

-- Query: Monitoring queries for incomplete runs
-- Issue: No index for finding runs that haven't completed
-- Impact: Low - administrative queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_run_metadata_incomplete
ON run_metadata(started_at DESC) WHERE completed_at IS NULL;

-- ============================================================================
-- NOTES FOR PRODUCTION DEPLOYMENT
-- ============================================================================
--
-- 1. All indexes use CONCURRENTLY to avoid locking tables during creation
-- 2. IF NOT EXISTS prevents errors if indexes already exist
-- 3. Partial indexes (WHERE clauses) reduce index size and improve write performance
-- 4. Run during low-traffic periods for best performance
-- 5. Monitor index usage with: SELECT * FROM pg_stat_user_indexes WHERE relname = 'table_name';
-- 6. After running, execute ANALYZE on affected tables:
--    ANALYZE hold_history;
--    ANALYZE purchase_history;
--    ANALYZE raw_diamonds_nivoda;
--    ANALYZE diamonds;
--    ANALYZE worker_runs;
--    ANALYZE run_metadata;

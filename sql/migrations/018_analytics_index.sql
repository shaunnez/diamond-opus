-- Analytics index: covers dashboard summary and feed stats queries
-- that aggregate by availability and feed on active diamonds.
-- Includes feed_price and updated_at for index-only scans on getFeedStats().
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diamonds_analytics
  ON diamonds (availability, feed)
  INCLUDE (feed_price, updated_at)
  WHERE status = 'active';

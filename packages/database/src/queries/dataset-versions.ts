import { query } from '../client.js';

interface DatasetVersionRow {
  feed: string;
  version: string;
  updated_at: Date;
}

/**
 * Get the current dataset version for a feed.
 * Returns 0 if no version row exists (cache will still work, just won't match after first consolidation).
 */
export async function getDatasetVersion(feed: string): Promise<number> {
  const result = await query<DatasetVersionRow>(
    'SELECT version FROM dataset_versions WHERE feed = $1',
    [feed]
  );
  return result.rows[0] ? parseInt(result.rows[0].version, 10) : 0;
}

/**
 * Get all dataset versions as a map of feed -> version.
 * Used by the API cache to poll for version changes across all feeds.
 */
export async function getAllDatasetVersions(): Promise<Record<string, number>> {
  const result = await query<DatasetVersionRow>(
    'SELECT feed, version FROM dataset_versions'
  );
  const versions: Record<string, number> = {};
  for (const row of result.rows) {
    versions[row.feed] = parseInt(row.version, 10);
  }
  return versions;
}

/**
 * Increment the dataset version for a feed after successful consolidation.
 * Uses UPSERT to handle the case where the feed row doesn't exist yet.
 * Returns the new version number.
 */
export async function incrementDatasetVersion(feed: string): Promise<number> {
  const result = await query<DatasetVersionRow>(
    `INSERT INTO dataset_versions (feed, version, updated_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (feed) DO UPDATE SET
       version = dataset_versions.version + 1,
       updated_at = NOW()
     RETURNING version`,
    [feed]
  );
  return parseInt(result.rows[0]!.version, 10);
}

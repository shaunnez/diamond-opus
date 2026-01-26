import { api } from './client';

export type AllowedTable = 'diamonds' | 'run_metadata' | 'worker_runs';

export type QueryOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';

export interface QueryFilter {
  field: string;
  operator: QueryOperator;
  value: unknown;
}

export interface QueryOptions {
  select?: string;
  filters?: QueryFilter[];
  order?: { column: string; ascending: boolean };
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  data: Record<string, unknown>[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

// Table column definitions for the query builder
export const TABLE_COLUMNS: Record<AllowedTable, { name: string; type: string }[]> = {
  diamonds: [
    { name: 'id', type: 'uuid' },
    { name: 'supplier', type: 'string' },
    { name: 'supplier_stone_id', type: 'string' },
    { name: 'offer_id', type: 'string' },
    { name: 'shape', type: 'string' },
    { name: 'carats', type: 'number' },
    { name: 'color', type: 'string' },
    { name: 'clarity', type: 'string' },
    { name: 'cut', type: 'string' },
    { name: 'polish', type: 'string' },
    { name: 'symmetry', type: 'string' },
    { name: 'fluorescence', type: 'string' },
    { name: 'lab_grown', type: 'boolean' },
    { name: 'treated', type: 'boolean' },
    { name: 'supplier_price_cents', type: 'number' },
    { name: 'price_per_carat_cents', type: 'number' },
    { name: 'retail_price_cents', type: 'number' },
    { name: 'markup_ratio', type: 'number' },
    { name: 'rating', type: 'number' },
    { name: 'availability', type: 'string' },
    { name: 'raw_availability', type: 'string' },
    { name: 'image_url', type: 'string' },
    { name: 'video_url', type: 'string' },
    { name: 'certificate_lab', type: 'string' },
    { name: 'certificate_number', type: 'string' },
    { name: 'supplier_name', type: 'string' },
    { name: 'status', type: 'string' },
    { name: 'source_updated_at', type: 'datetime' },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  run_metadata: [
    { name: 'run_id', type: 'uuid' },
    { name: 'run_type', type: 'string' },
    { name: 'expected_workers', type: 'number' },
    { name: 'completed_workers', type: 'number' },
    { name: 'failed_workers', type: 'number' },
    { name: 'watermark_before', type: 'datetime' },
    { name: 'watermark_after', type: 'datetime' },
    { name: 'started_at', type: 'datetime' },
    { name: 'completed_at', type: 'datetime' },
  ],
  worker_runs: [
    { name: 'id', type: 'uuid' },
    { name: 'run_id', type: 'uuid' },
    { name: 'partition_id', type: 'string' },
    { name: 'worker_id', type: 'string' },
    { name: 'status', type: 'string' },
    { name: 'records_processed', type: 'number' },
    { name: 'error_message', type: 'string' },
    { name: 'started_at', type: 'datetime' },
    { name: 'completed_at', type: 'datetime' },
  ],
};

export const OPERATORS: { value: QueryOperator; label: string; description: string }[] = [
  { value: 'eq', label: '=', description: 'Equals' },
  { value: 'neq', label: '!=', description: 'Not equals' },
  { value: 'gt', label: '>', description: 'Greater than' },
  { value: 'gte', label: '>=', description: 'Greater than or equals' },
  { value: 'lt', label: '<', description: 'Less than' },
  { value: 'lte', label: '<=', description: 'Less than or equals' },
  { value: 'like', label: 'LIKE', description: 'Pattern match (case-sensitive)' },
  { value: 'ilike', label: 'ILIKE', description: 'Pattern match (case-insensitive)' },
  { value: 'in', label: 'IN', description: 'In list (comma-separated)' },
  { value: 'is', label: 'IS', description: 'IS NULL / IS NOT NULL' },
];

export async function executeQuery(table: AllowedTable, options: QueryOptions): Promise<QueryResult> {
  // Convert filters array to the expected format
  const filters: Record<string, Record<string, unknown>> = {};
  if (options.filters) {
    for (const filter of options.filters) {
      if (!filters[filter.field]) {
        filters[filter.field] = {};
      }
      filters[filter.field][filter.operator] = filter.value;
    }
  }

  const response = await api.post<QueryResult>(`/analytics/query/${table}`, {
    select: options.select,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    order: options.order,
    limit: options.limit,
    offset: options.offset,
  });

  return response.data;
}

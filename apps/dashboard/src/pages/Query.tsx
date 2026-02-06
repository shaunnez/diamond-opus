import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Search, Plus, X, Play, Download, Database } from 'lucide-react';
import {
  executeQuery,
  type AllowedTable,
  type QueryFilter,
  type QueryOptions,
  TABLE_COLUMNS,
  OPERATORS,
} from '../api/query';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  Button,
  Input,
  Select,
  Table,
  Pagination,
  Alert,
  PageLoader,
  Checkbox,
} from '../components/ui';
import { formatNumber } from '../utils/formatters';

const TABLES: { value: AllowedTable; label: string }[] = [
  { value: 'diamonds', label: 'Diamonds' },
  { value: 'run_metadata', label: 'Run Metadata' },
  { value: 'worker_runs', label: 'Worker Runs' },
];

export function Query() {
  const [table, setTable] = useState<AllowedTable>('diamonds');
  const [filters, setFilters] = useState<QueryFilter[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [orderColumn, setOrderColumn] = useState('');
  const [orderAsc, setOrderAsc] = useState(false);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const queryMutation = useMutation({
    mutationFn: (options: QueryOptions) => executeQuery(table, options),
  });

  const columns = TABLE_COLUMNS[table];

  const handleTableChange = (newTable: AllowedTable) => {
    setTable(newTable);
    setFilters([]);
    setSelectedColumns(new Set());
    setOrderColumn('');
    setOffset(0);
  };

  const addFilter = () => {
    setFilters([...filters, { field: columns[0]?.name ?? '', operator: 'eq', value: '' }]);
  };

  const updateFilter = (index: number, updates: Partial<QueryFilter>) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], ...updates };
    setFilters(newFilters);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const toggleColumn = (column: string) => {
    const newSelected = new Set(selectedColumns);
    if (newSelected.has(column)) {
      newSelected.delete(column);
    } else {
      newSelected.add(column);
    }
    setSelectedColumns(newSelected);
  };

  const runQuery = () => {
    const options: QueryOptions = {
      select: selectedColumns.size > 0 ? Array.from(selectedColumns).join(', ') : undefined,
      filters: filters.length > 0 ? filters : undefined,
      order: orderColumn ? { column: orderColumn, ascending: orderAsc } : undefined,
      limit,
      offset,
    };
    queryMutation.mutate(options);
  };

  const handlePageChange = (newPage: number) => {
    const newOffset = (newPage - 1) * limit;
    setOffset(newOffset);
    runQuery();
  };

  const exportResults = () => {
    if (!queryMutation.data?.data) return;
    const csv = convertToCSV(queryMutation.data.data);
    downloadCSV(csv, `${table}_query_${Date.now()}.csv`);
  };

  const resultColumns =
    queryMutation.data?.data && queryMutation.data.data.length > 0
      ? Object.keys(queryMutation.data.data[0]).map((key) => ({
          key,
          header: key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
          render: (item: Record<string, unknown>) => {
            const value = item[key];
            if (value === null || value === undefined) return '-';
            if (typeof value === 'boolean') return value ? 'Yes' : 'No';
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
          },
        }))
      : [];

  return (
    <>
      <Header />
      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Query Builder Panel */}
          <div className="lg:col-span-1 space-y-6">
            {/* Table Selection */}
            <Card>
              <CardHeader title="Table" />
              <Select
                value={table}
                onChange={(e) => handleTableChange(e.target.value as AllowedTable)}
                options={TABLES}
              />
            </Card>

            {/* Column Selection */}
            <Card>
              <CardHeader
                title="Columns"
                subtitle={`${selectedColumns.size || 'All'} selected`}
              />
              <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                {columns.map((col) => (
                  <Checkbox
                    key={col.name}
                    label={col.name}
                    checked={selectedColumns.has(col.name)}
                    onChange={() => toggleColumn(col.name)}
                  />
                ))}
              </div>
            </Card>

            {/* Filters */}
            <Card>
              <CardHeader
                title="Filters"
                action={
                  <Button variant="ghost" size="sm" onClick={addFilter}>
                    <Plus className="w-4 h-4" />
                  </Button>
                }
              />
              <div className="mt-2 space-y-3">
                {filters.map((filter, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <Select
                        value={filter.field}
                        onChange={(e) => updateFilter(index, { field: e.target.value })}
                        options={columns.map((c) => ({ value: c.name, label: c.name }))}
                      />
                      <Select
                        value={filter.operator}
                        onChange={(e) =>
                          updateFilter(index, {
                            operator: e.target.value as QueryFilter['operator'],
                          })
                        }
                        options={OPERATORS.map((op) => ({
                          value: op.value,
                          label: `${op.label} (${op.description})`,
                        }))}
                      />
                      <Input
                        placeholder="Value"
                        value={String(filter.value)}
                        onChange={(e) => updateFilter(index, { value: e.target.value })}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFilter(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {filters.length === 0 && (
                  <p className="text-sm text-stone-500 dark:text-stone-400 text-center py-2">
                    No filters added
                  </p>
                )}
              </div>
            </Card>

            {/* Ordering */}
            <Card>
              <CardHeader title="Order By" />
              <div className="space-y-2">
                <Select
                  value={orderColumn}
                  onChange={(e) => setOrderColumn(e.target.value)}
                  options={[
                    { value: '', label: 'None' },
                    ...columns.map((c) => ({ value: c.name, label: c.name })),
                  ]}
                />
                {orderColumn && (
                  <Select
                    value={orderAsc ? 'asc' : 'desc'}
                    onChange={(e) => setOrderAsc(e.target.value === 'asc')}
                    options={[
                      { value: 'asc', label: 'Ascending' },
                      { value: 'desc', label: 'Descending' },
                    ]}
                  />
                )}
              </div>
            </Card>

            {/* Limit */}
            <Card>
              <CardHeader title="Limit" />
              <Select
                value={String(limit)}
                onChange={(e) => setLimit(Number(e.target.value))}
                options={[
                  { value: '10', label: '10 rows' },
                  { value: '25', label: '25 rows' },
                  { value: '50', label: '50 rows' },
                  { value: '100', label: '100 rows' },
                  { value: '500', label: '500 rows' },
                  { value: '1000', label: '1000 rows' },
                ]}
              />
            </Card>

            {/* Run Query Button */}
            <Button
              className="w-full"
              onClick={runQuery}
              loading={queryMutation.isPending}
              icon={<Play className="w-4 h-4" />}
            >
              Run Query
            </Button>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-3">
            <Card className="p-0 overflow-hidden">
              <div className="p-4 border-b border-stone-200 dark:border-stone-600 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-stone-400 dark:text-stone-500" />
                  <h3 className="font-semibold text-stone-900 dark:text-stone-100">Query Results</h3>
                  {queryMutation.data && (
                    <span className="text-sm text-stone-500 dark:text-stone-400">
                      {formatNumber(queryMutation.data.pagination.total)} total rows
                    </span>
                  )}
                </div>
                {queryMutation.data?.data && queryMutation.data.data.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={exportResults}
                    icon={<Download className="w-4 h-4" />}
                  >
                    Export CSV
                  </Button>
                )}
              </div>

              {queryMutation.isPending ? (
                <PageLoader />
              ) : queryMutation.error ? (
                <div className="p-6">
                  <Alert variant="error" title="Query Error">
                    {(queryMutation.error as Error).message}
                  </Alert>
                </div>
              ) : !queryMutation.data ? (
                <div className="flex flex-col items-center justify-center py-16 text-stone-400 dark:text-stone-500">
                  <Search className="w-12 h-12 mb-4" />
                  <p className="text-lg font-medium text-stone-500 dark:text-stone-400">No query run yet</p>
                  <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">
                    Configure your query and click "Run Query"
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table
                      columns={resultColumns}
                      data={queryMutation.data.data}
                      keyExtractor={(item) =>
                        (item as Record<string, unknown>).id
                          ? String((item as Record<string, unknown>).id)
                          : JSON.stringify(item)
                      }
                      emptyMessage="No results found"
                    />
                  </div>
                  {queryMutation.data.pagination.total > limit && (
                    <Pagination
                      page={Math.floor(offset / limit) + 1}
                      totalPages={Math.ceil(queryMutation.data.pagination.total / limit)}
                      total={queryMutation.data.pagination.total}
                      limit={limit}
                      onPageChange={handlePageChange}
                    />
                  )}
                </>
              )}
            </Card>
          </div>
        </div>
      </PageContainer>
    </>
  );
}

// Helper functions for CSV export
function convertToCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value);
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

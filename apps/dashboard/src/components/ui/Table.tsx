import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  loading?: boolean;
}

export function Table<T extends Record<string, any> = Record<string, unknown>>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data available',
  loading = false,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="table-container">
        <div className="flex items-center justify-center h-48">
          <div className="animate-pulse text-stone-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="table-container">
        <div className="flex items-center justify-center h-48 text-stone-400">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={keyExtractor(item)}
              onClick={() => onRowClick?.(item)}
              className={onRowClick ? 'cursor-pointer' : ''}
            >
              {columns.map((col) => (
                <td key={col.key} className={col.className}>
                  {col.render ? col.render(item) : String(item[col.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, limit, onPageChange }: PaginationProps) {
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border-t border-stone-200">
      <div className="text-sm text-stone-500 text-center sm:text-left">
        <span className="hidden sm:inline">
          Showing <span className="font-medium">{startItem}</span> to{' '}
          <span className="font-medium">{endItem}</span> of{' '}
        </span>
        <span className="font-medium">{total}</span> <span className="hidden sm:inline">results</span><span className="sm:hidden">total</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          icon={<ChevronLeft className="w-4 h-4" />}
        >
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <span className="text-sm text-stone-600 px-2">
          {page} / {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          icon={<ChevronRight className="w-4 h-4" />}
        >
          <span className="hidden sm:inline">Next</span>
        </Button>
      </div>
    </div>
  );
}

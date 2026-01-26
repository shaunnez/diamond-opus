import { useQuery } from '@tanstack/react-query';
import { Building2, Diamond, DollarSign } from 'lucide-react';
import { getSupplierStats } from '../api/analytics';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import { Card, CardHeader, Table, PageLoader, Alert, Badge } from '../components/ui';
import {
  formatNumber,
  formatCurrency,
  formatRelativeTime,
} from '../utils/formatters';

export function Suppliers() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['supplier-stats'],
    queryFn: getSupplierStats,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return <PageLoader />;
  }

  if (error) {
    return (
      <>
        <Header />
        <PageContainer>
          <Alert variant="error" title="Failed to load supplier data">
            Unable to fetch supplier statistics. Please try again later.
          </Alert>
        </PageContainer>
      </>
    );
  }

  const totalDiamonds = data?.reduce((sum, s) => sum + s.totalDiamonds, 0) ?? 0;
  const totalAvailable = data?.reduce((sum, s) => sum + s.availableDiamonds, 0) ?? 0;

  const columns = [
    {
      key: 'supplier',
      header: 'Supplier',
      render: (s: (typeof data)[0]) => (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-stone-100 rounded-lg">
            <Building2 className="w-4 h-4 text-stone-600" />
          </div>
          <span className="font-medium text-stone-900">{s.supplier}</span>
        </div>
      ),
    },
    {
      key: 'totalDiamonds',
      header: 'Total',
      render: (s: (typeof data)[0]) => formatNumber(s.totalDiamonds),
    },
    {
      key: 'availability',
      header: 'Availability',
      render: (s: (typeof data)[0]) => (
        <div className="flex items-center gap-2">
          <Badge variant="success">{formatNumber(s.availableDiamonds)}</Badge>
          {s.onHoldDiamonds > 0 && (
            <Badge variant="warning">{formatNumber(s.onHoldDiamonds)} hold</Badge>
          )}
          {s.soldDiamonds > 0 && (
            <Badge variant="neutral">{formatNumber(s.soldDiamonds)} sold</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'avgPrice',
      header: 'Avg Price',
      render: (s: (typeof data)[0]) => formatCurrency(s.avgPriceCents),
    },
    {
      key: 'priceRange',
      header: 'Price Range',
      render: (s: (typeof data)[0]) => (
        <span className="text-stone-600">
          {formatCurrency(s.minPriceCents)} - {formatCurrency(s.maxPriceCents)}
        </span>
      ),
    },
    {
      key: 'lastUpdated',
      header: 'Last Updated',
      render: (s: (typeof data)[0]) =>
        s.lastUpdated ? formatRelativeTime(s.lastUpdated) : '-',
    },
  ];

  return (
    <>
      <Header onRefresh={refetch} isRefreshing={isFetching} />
      <PageContainer>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-50 rounded-xl">
                <Building2 className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-stone-500">Total Suppliers</p>
                <p className="text-2xl font-semibold text-stone-900">
                  {formatNumber(data?.length ?? 0)}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-success-50 rounded-xl">
                <Diamond className="w-6 h-6 text-success-600" />
              </div>
              <div>
                <p className="text-sm text-stone-500">Total Diamonds</p>
                <p className="text-2xl font-semibold text-stone-900">
                  {formatNumber(totalDiamonds)}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-info-50 rounded-xl">
                <DollarSign className="w-6 h-6 text-info-600" />
              </div>
              <div>
                <p className="text-sm text-stone-500">Available</p>
                <p className="text-2xl font-semibold text-stone-900">
                  {formatNumber(totalAvailable)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Supplier Table */}
        <Card className="p-0 overflow-hidden">
          <div className="p-6 border-b border-stone-200">
            <CardHeader
              title="Supplier Breakdown"
              subtitle="Diamond inventory by supplier"
            />
          </div>
          <Table
            columns={columns}
            data={data ?? []}
            keyExtractor={(s) => s.supplier}
            emptyMessage="No suppliers found"
          />
        </Card>

        {/* Top Suppliers Chart Alternative - Simple Bar */}
        <Card className="mt-6">
          <CardHeader
            title="Inventory Distribution"
            subtitle="Diamonds by supplier (top 10)"
          />
          <div className="mt-4 space-y-3">
            {data
              ?.slice(0, 10)
              .map((supplier) => {
                const percent =
                  totalDiamonds > 0
                    ? (supplier.totalDiamonds / totalDiamonds) * 100
                    : 0;
                return (
                  <div key={supplier.supplier}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-stone-700 font-medium">
                        {supplier.supplier}
                      </span>
                      <span className="text-stone-500">
                        {formatNumber(supplier.totalDiamonds)} ({percent.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full h-3 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      </PageContainer>
    </>
  );
}

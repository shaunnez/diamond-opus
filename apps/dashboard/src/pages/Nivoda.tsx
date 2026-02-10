import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Search,
  Hand,
  ShoppingCart,
  Diamond,
  RefreshCw,
  Image,
  Video,
} from 'lucide-react';
import {
  searchNivodaDiamonds,
  getNivodaCount,
  placeHold,
  createOrder,
  type NivodaSearchOptions,
  type NivodaSearchItem,
} from '../api/nivoda';
import { Header } from '../components/layout/Header';
import { PageContainer } from '../components/layout/Layout';
import {
  Card,
  CardHeader,
  Button,
  Input,
  Badge,
  Alert,
  ConfirmModal,
  useToast,
} from '../components/ui';
import { formatNumber } from '../utils/formatters';

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export function Nivoda() {
  const { addToast } = useToast();

  // Search state
  const [searchOptions, setSearchOptions] = useState<NivodaSearchOptions>({
    price_min: undefined,
    price_max: undefined,
    carat_min: undefined,
    carat_max: undefined,
    limit: 20,
    offset: 0,
  });

  // Action state
  const [selectedDiamond, setSelectedDiamond] = useState<NivodaSearchItem | null>(null);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [destinationId, setDestinationId] = useState('');
  const [orderReference, setOrderReference] = useState('');

  // Search query
  const searchQuery = useQuery({
    queryKey: ['nivoda-search', searchOptions],
    queryFn: () =>
      searchNivodaDiamonds({
        ...searchOptions
      }),
    enabled: false, // Manual trigger
  });

  // Count query
  const countQuery = useQuery({
    queryKey: ['nivoda-count', searchOptions],
    queryFn: () =>
      getNivodaCount({
        ...searchOptions
      }),
    enabled: false,
  });

  // Mutations
  const holdMutation = useMutation({
    mutationFn: (offerId: string) => placeHold(offerId),
    onSuccess: () => {
      setShowHoldModal(false);
      setSelectedDiamond(null);
      searchQuery.refetch();
      addToast({ variant: 'success', title: 'Hold placed successfully' });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to place hold',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  const orderMutation = useMutation({
    mutationFn: () =>
      createOrder({
        offer_id: selectedDiamond!.offer_id,
        destination_id: destinationId || undefined,
        reference: orderReference || undefined,
      }),
    onSuccess: () => {
      setShowOrderModal(false);
      setSelectedDiamond(null);
      setDestinationId('');
      setOrderReference('');
      searchQuery.refetch();
      addToast({ variant: 'success', title: 'Order created successfully' });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to create order',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    },
  });

  const handleSearch = () => {
    searchQuery.refetch().then((result) => {
      if (result.data) {
        addToast({
          variant: 'success',
          title: 'Search complete',
          message: `Found ${formatNumber(result.data.total_count)} diamonds`,
        });
      }
      if (result.error) {
        addToast({
          variant: 'error',
          title: 'Search failed',
          message: result.error instanceof Error ? result.error.message : 'An unknown error occurred',
        });
      }
    });
  };

  const handleGetCount = () => {
    countQuery.refetch().then((result) => {
      if (result.error) {
        addToast({
          variant: 'error',
          title: 'Count failed',
          message: result.error instanceof Error ? result.error.message : 'An unknown error occurred',
        });
      }
    });
  };


  const handlePlaceHold = (item: NivodaSearchItem) => {
    setSelectedDiamond(item);
    setShowHoldModal(true);
  };

  const handleCreateOrder = (item: NivodaSearchItem) => {
    setSelectedDiamond(item);
    setShowOrderModal(true);
  };

  const getAvailabilityBadge = (availability: string) => {
    switch (availability.toLowerCase()) {
      case 'available':
        return <Badge variant="success">Available</Badge>;
      case 'on_hold':
        return <Badge variant="warning">On Hold</Badge>;
      case 'sold':
        return <Badge variant="error">Sold</Badge>;
      default:
        return <Badge variant="neutral">{availability}</Badge>;
    }
  };

  return (
    <>
      <Header />
      <PageContainer>
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Nivoda Operations</h1>
            <p className="text-stone-600 dark:text-stone-400 mt-1">
              Search diamonds directly from Nivoda, place holds, and create orders
            </p>
          </div>

          {/* Search Configuration */}
          <Card>
            <CardHeader
              title="Search Diamonds"
              subtitle="Search the Nivoda inventory in real-time"
            />
            <div className="mt-4 space-y-4">
              {/* Price and Carat Range */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Input
                  label="Min Price ($)"
                  type="number"
                  value={searchOptions.price_min ?? ''}
                  onChange={(e) =>
                    setSearchOptions((prev) => ({
                      ...prev,
                      price_min: e.target.value ? parseInt(e.target.value, 10) : undefined,
                    }))
                  }
                  placeholder="0"
                />
                <Input
                  label="Max Price ($)"
                  type="number"
                  value={searchOptions.price_max ?? ''}
                  onChange={(e) =>
                    setSearchOptions((prev) => ({
                      ...prev,
                      price_max: e.target.value ? parseInt(e.target.value, 10) : undefined,
                    }))
                  }
                  placeholder="No limit"
                />
                <Input
                  label="Min Carats"
                  type="number"
                  step="0.01"
                  value={searchOptions.carat_min ?? ''}
                  onChange={(e) =>
                    setSearchOptions((prev) => ({
                      ...prev,
                      carat_min: e.target.value ? parseFloat(e.target.value) : undefined,
                    }))
                  }
                  placeholder="0.5"
                />
                <Input
                  label="Max Carats"
                  type="number"
                  step="0.01"
                  value={searchOptions.carat_max ?? ''}
                  onChange={(e) =>
                    setSearchOptions((prev) => ({
                      ...prev,
                      carat_max: e.target.value ? parseFloat(e.target.value) : undefined,
                    }))
                  }
                  placeholder="10"
                />
              </div>


              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={handleGetCount}
                  disabled={countQuery.isLoading}
                  icon={<RefreshCw className={`w-4 h-4 ${countQuery.isLoading ? 'animate-spin' : ''}`} />}
                >
                  {countQuery.isLoading ? 'Counting...' : 'Get Count'}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSearch}
                  disabled={searchQuery.isLoading}
                  icon={<Search className="w-4 h-4" />}
                >
                  {searchQuery.isLoading ? 'Searching...' : 'Search'}
                </Button>
              </div>

              {/* Count Result */}
              {countQuery.data !== undefined && (
                <div className="p-4 bg-primary-50 rounded-lg">
                  <p className="text-lg font-semibold text-primary-700">
                    {formatNumber(countQuery.data)} diamonds match your criteria
                  </p>
                </div>
              )}

              {countQuery.error && (
                <Alert variant="error">
                  {countQuery.error instanceof Error ? countQuery.error.message : 'Failed to get count'}
                </Alert>
              )}
            </div>
          </Card>

          {/* Search Results */}
          {searchQuery.data && (
            <Card>
              <CardHeader
                title="Search Results"
                subtitle={`${formatNumber(searchQuery.data.total_count)} total matches, showing ${searchQuery.data.items.length}`}
              />
              {searchQuery.error && (
                <Alert variant="error" className="mt-4">
                  {searchQuery.error instanceof Error ? searchQuery.error.message : 'Search failed'}
                </Alert>
              )}
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-stone-200 dark:divide-stone-600">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Diamond
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Details
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Price
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Media
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 dark:text-stone-400 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-stone-600">
                    {searchQuery.data.items.map((item) => (
                      <tr key={item.offer_id} className="hover:bg-stone-50 dark:hover:bg-stone-700/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-stone-100 dark:bg-stone-700/50 rounded-lg">
                              <Diamond className="w-5 h-5 text-stone-400 dark:text-stone-500" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                                {item.diamond.certificate.shape} {item.diamond.certificate.carats}ct
                              </p>
                              <p className="text-xs text-stone-500 dark:text-stone-400">
                                {item.diamond.certificate.lab} #{item.diamond.certificate.number}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="neutral">{item.diamond.certificate.color}</Badge>
                            <Badge variant="neutral">{item.diamond.certificate.clarity}</Badge>
                            {item.diamond.certificate.cut && (
                              <Badge variant="neutral">{item.diamond.certificate.cut}</Badge>
                            )}
                            {item.diamond.certificate.lab_grown && (
                              <Badge variant="info">Lab Grown</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {getAvailabilityBadge(item.diamond.availability)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                            {formatPrice(item.price)}
                          </p>
                          {item.discount && (
                            <p className="text-xs text-success-600">-{item.discount}%</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            {item.diamond.image && (
                              <a
                                href={item.diamond.image}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 text-stone-400 dark:text-stone-500 hover:text-primary-600"
                              >
                                <Image className="w-4 h-4" />
                              </a>
                            )}
                            {item.diamond.video && (
                              <a
                                href={item.diamond.video}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 text-stone-400 dark:text-stone-500 hover:text-primary-600"
                              >
                                <Video className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handlePlaceHold(item)}
                              disabled={item.diamond.availability?.toLowerCase() !== 'available'}
                              icon={<Hand className="w-3 h-3" />}
                            >
                              Hold
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleCreateOrder(item)}
                              disabled={item.diamond.availability?.toLowerCase() === 'sold'}
                              icon={<ShoppingCart className="w-3 h-3" />}
                            >
                              Order
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {searchQuery.data.items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-stone-500 dark:text-stone-400">
                          No diamonds found matching your criteria
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Hold Modal */}
          <ConfirmModal
            isOpen={showHoldModal}
            onClose={() => {
              setShowHoldModal(false);
              setSelectedDiamond(null);
            }}
            onConfirm={() => selectedDiamond && holdMutation.mutate(selectedDiamond.offer_id)}
            title="Place Hold"
            message={
              selectedDiamond
                ? `Place a hold on this ${selectedDiamond.diamond.certificate.shape} ${selectedDiamond.diamond.certificate.carats}ct diamond for ${formatPrice(selectedDiamond.price)}?`
                : ''
            }
            confirmText="Place Hold"
            loading={holdMutation.isPending}
          />

          {/* Order Modal */}
          {showOrderModal && selectedDiamond && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-stone-800 rounded-xl shadow-xl max-w-md w-full">
                <div className="p-6 border-b border-stone-200 dark:border-stone-700">
                  <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Create Order</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div className="p-4 bg-stone-50 dark:bg-stone-700 rounded-lg">
                    <p className="font-medium text-stone-900 dark:text-stone-100">
                      {selectedDiamond.diamond.certificate.shape}{' '}
                      {selectedDiamond.diamond.certificate.carats}ct
                    </p>
                    <p className="text-sm text-stone-500 dark:text-stone-400">
                      {selectedDiamond.diamond.certificate.color} /{' '}
                      {selectedDiamond.diamond.certificate.clarity}
                    </p>
                    <p className="text-lg font-semibold text-primary-600 mt-2">
                      {formatPrice(selectedDiamond.price)}
                    </p>
                  </div>

                  <Input
                    label="Destination ID"
                    value={destinationId}
                    onChange={(e) => setDestinationId(e.target.value)}
                    placeholder="Enter your Nivoda destination ID"
                  />

                  <Input
                    label="Order Reference (optional)"
                    value={orderReference}
                    onChange={(e) => setOrderReference(e.target.value)}
                    placeholder="Your internal reference"
                  />

                  {orderMutation.error && (
                    <Alert variant="error">
                      {orderMutation.error instanceof Error
                        ? orderMutation.error.message
                        : 'Failed to create order'}
                    </Alert>
                  )}
                </div>
                <div className="p-6 border-t border-stone-200 dark:border-stone-700 flex justify-end gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowOrderModal(false);
                      setSelectedDiamond(null);
                      setDestinationId('');
                      setOrderReference('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => orderMutation.mutate()}
                    disabled={orderMutation.isPending}
                    icon={<ShoppingCart className="w-4 h-4" />}
                  >
                    {orderMutation.isPending ? 'Creating...' : 'Create Order'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </PageContainer>
    </>
  );
}

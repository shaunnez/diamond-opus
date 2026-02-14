import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Video, Image as ImageIcon, FileText, ExternalLink, ShoppingCart } from 'lucide-react';
import { getDiamondDetails } from '../api/trading';
import { PageContainer } from '../components/layout/Layout';
import {
  Button,
  PageLoader,
  Alert,
  Card,
  CardHeader,
  DiamondImage,
  DiamondShapeIcon,
} from '../components/ui';

export function DiamondDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showVideo, setShowVideo] = useState(false);

  const { data: diamond, isLoading, error } = useQuery({
    queryKey: ['diamond', id],
    queryFn: () => getDiamondDetails(id!),
    enabled: !!id,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <PageLoader />;

  if (error || !diamond) {
    return (
      <PageContainer>
        <Alert variant="error" title="Diamond not found">
          {(error as Error)?.message || 'Could not find the requested diamond'}
        </Alert>
        <Button variant="ghost" onClick={() => navigate('/storefront')} className="mt-4">
          Back to Storefront
        </Button>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/storefront')}
        icon={<ArrowLeft className="w-4 h-4" />}
        className="mb-6"
      >
        Back to Storefront
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column - Image/Video */}
        <div>
          <Card className="sticky top-6">
            {/* Media viewer */}
            <div className="p-4">
              <DiamondImage
                src={diamond.imageUrl}
                alt={`${diamond.shape} ${diamond.carats}ct ${diamond.color} ${diamond.clarity}`}
                shape={diamond.shape}
                aspectRatio="square"
                showVideo={showVideo}
                videoSrc={diamond.videoUrl}
                className="rounded-lg"
              />

              {/* Media controls */}
              {(diamond.imageUrl || diamond.videoUrl) && (
                <div className="flex gap-2 mt-4">
                  {diamond.imageUrl && (
                    <Button
                      variant={!showVideo ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setShowVideo(false)}
                      icon={<ImageIcon className="w-4 h-4" />}
                    >
                      Image
                    </Button>
                  )}
                  {diamond.videoUrl && (
                    <Button
                      variant={showVideo ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setShowVideo(true)}
                      icon={<Video className="w-4 h-4" />}
                    >
                      Video
                    </Button>
                  )}
                  {diamond.certificatePdfUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(diamond.certificatePdfUrl, '_blank')}
                      icon={<FileText className="w-4 h-4" />}
                    >
                      Certificate
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right column - Details */}
        <div className="space-y-6">
          {/* Title and price */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 text-primary-600 dark:text-primary-400">
                <DiamondShapeIcon shape={diamond.shape} />
              </div>
              <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-100">
                {diamond.shape} {diamond.carats?.toFixed(2)}ct
              </h1>
            </div>

            <div className="flex items-baseline gap-3 mb-4">
              <div className="text-4xl font-bold text-stone-900 dark:text-stone-100">
                ${(diamond.diamondPrice || diamond.feedPrice)?.toLocaleString()}
              </div>
              <div className="text-lg text-stone-500 dark:text-stone-400">
                ${diamond.pricePerCarat?.toLocaleString()}/ct
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium ${
                  diamond.availability === 'available'
                    ? 'bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-400 border border-success-200 dark:border-success-500/30'
                    : diamond.availability === 'on_hold'
                    ? 'bg-warning-50 dark:bg-warning-900/20 text-warning-700 dark:text-warning-400 border border-warning-200 dark:border-warning-500/30'
                    : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-600'
                }`}
              >
                {diamond.availability}
              </span>
              <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-600">
                {diamond.feed}
              </span>
              {diamond.labGrown && (
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-info-50 dark:bg-info-900/20 text-info-700 dark:text-info-400 border border-info-200 dark:border-info-500/30">
                  Lab Grown
                </span>
              )}
            </div>
          </div>

          {/* Primary specs */}
          <Card>
            <CardHeader title="Primary Specifications" />
            <div className="p-4 grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-stone-500 dark:text-stone-400">Color</div>
                <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">{diamond.color || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm text-stone-500 dark:text-stone-400">Clarity</div>
                <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">{diamond.clarity || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm text-stone-500 dark:text-stone-400">Cut</div>
                <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">{diamond.cut || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm text-stone-500 dark:text-stone-400">Polish</div>
                <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">{diamond.polish || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm text-stone-500 dark:text-stone-400">Symmetry</div>
                <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">{diamond.symmetry || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm text-stone-500 dark:text-stone-400">Fluorescence</div>
                <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                  {diamond.fluorescenceIntensity || diamond.fluorescence || 'N/A'}
                </div>
              </div>
            </div>
          </Card>

          {/* Measurements */}
          {diamond.measurements && (
            <Card>
              <CardHeader title="Measurements" />
              <div className="p-4 grid grid-cols-3 gap-4">
                {diamond.measurements.length && (
                  <div>
                    <div className="text-sm text-stone-500 dark:text-stone-400">Length</div>
                    <div className="text-base font-medium text-stone-900 dark:text-stone-100">
                      {diamond.measurements.length.toFixed(2)} mm
                    </div>
                  </div>
                )}
                {diamond.measurements.width && (
                  <div>
                    <div className="text-sm text-stone-500 dark:text-stone-400">Width</div>
                    <div className="text-base font-medium text-stone-900 dark:text-stone-100">
                      {diamond.measurements.width.toFixed(2)} mm
                    </div>
                  </div>
                )}
                {diamond.measurements.depth && (
                  <div>
                    <div className="text-sm text-stone-500 dark:text-stone-400">Depth</div>
                    <div className="text-base font-medium text-stone-900 dark:text-stone-100">
                      {diamond.measurements.depth.toFixed(2)} mm
                    </div>
                  </div>
                )}
                {diamond.measurements.table && (
                  <div>
                    <div className="text-sm text-stone-500 dark:text-stone-400">Table</div>
                    <div className="text-base font-medium text-stone-900 dark:text-stone-100">
                      {diamond.measurements.table.toFixed(1)}%
                    </div>
                  </div>
                )}
                {diamond.measurements.depthPercentage && (
                  <div>
                    <div className="text-sm text-stone-500 dark:text-stone-400">Depth %</div>
                    <div className="text-base font-medium text-stone-900 dark:text-stone-100">
                      {diamond.measurements.depthPercentage.toFixed(1)}%
                    </div>
                  </div>
                )}
                {diamond.measurements.girdle && (
                  <div>
                    <div className="text-sm text-stone-500 dark:text-stone-400">Girdle</div>
                    <div className="text-base font-medium text-stone-900 dark:text-stone-100">
                      {diamond.measurements.girdle}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Certificate */}
          {diamond.certificateLab && (
            <Card>
              <CardHeader title="Certificate" />
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-stone-500 dark:text-stone-400">Lab</div>
                    <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                      {diamond.certificateLab}
                    </div>
                  </div>
                  {diamond.certificateNumber && (
                    <div>
                      <div className="text-sm text-stone-500 dark:text-stone-400">Number</div>
                      <div className="text-lg font-mono font-semibold text-stone-900 dark:text-stone-100">
                        {diamond.certificateNumber}
                      </div>
                    </div>
                  )}
                </div>
                {diamond.certificatePdfUrl && (
                  <Button
                    variant="secondary"
                    className="mt-4 w-full"
                    onClick={() => window.open(diamond.certificatePdfUrl, '_blank')}
                    icon={<ExternalLink className="w-4 h-4" />}
                  >
                    View Certificate PDF
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Supplier info */}
          {diamond.supplierName && (
            <Card>
              <CardHeader title="Supplier Information" />
              <div className="p-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-stone-500 dark:text-stone-400">Supplier</div>
                  <div className="text-base font-medium text-stone-900 dark:text-stone-100">
                    {diamond.supplierName}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-stone-500 dark:text-stone-400">Stone ID</div>
                  <div className="text-base font-mono font-medium text-stone-900 dark:text-stone-100">
                    {diamond.supplierStoneId}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Action button */}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={diamond.availability !== 'available'}
            icon={<ShoppingCart className="w-5 h-5" />}
          >
            {diamond.availability === 'available' ? 'Create Order' : 'Not Available'}
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

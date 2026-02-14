import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { getDiamond } from '../api/diamonds';
import { DiamondMedia } from '../components/diamonds/DiamondMedia';
import { DiamondSpecs } from '../components/diamonds/DiamondSpecs';
import { DiamondActions } from '../components/diamonds/DiamondActions';
import { AvailabilityBadge, LabBadge, FeedBadge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { formatNZD, formatUSD, formatCarats, formatMarkupRatio } from '../utils/format';

export function DiamondDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: diamond, isLoading, error } = useQuery({
    queryKey: ['diamond', id],
    queryFn: () => getDiamond(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return <Spinner className="py-20" />;
  }

  if (error || !diamond) {
    return (
      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <h2 className="font-serif text-2xl text-charcoal mb-2">Diamond Not Found</h2>
        <p className="text-sm text-warm-gray-500 mb-6">
          This diamond may no longer be available.
        </p>
        <Link to="/" className="btn-secondary inline-block">
          Back to Collection
        </Link>
      </div>
    );
  }

  const title = `${diamond.shape} ${formatCarats(diamond.carats)}`;

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Breadcrumb */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-warm-gray-500 hover:text-charcoal transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Collection
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Media Section — 3 columns */}
        <div className="lg:col-span-3">
          <DiamondMedia
            videoUrl={diamond.videoUrl}
            imageUrl={diamond.imageUrl}
            shape={diamond.shape}
            alt={title}
            size="detail"
            className="w-full aspect-square lg:aspect-[4/3]"
          />
        </div>

        {/* Info Section — 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title and badges */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AvailabilityBadge availability={diamond.availability} />
              {diamond.certificateLab && <LabBadge lab={diamond.certificateLab} />}
              <FeedBadge feed={diamond.feed} />
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-charcoal">
              {title}
            </h1>
            {diamond.fancyColor && (
              <p className="text-warm-gray-500 mt-1">
                {diamond.fancyIntensity} {diamond.fancyColor}
              </p>
            )}
            {/* Quick specs */}
            <p className="text-sm text-warm-gray-500 mt-2">
              {[diamond.color, diamond.clarity, diamond.cut].filter(Boolean).join(' \u00B7 ')}
              {diamond.labGrown ? ' \u00B7 Lab Grown' : ''}
            </p>
          </div>

          {/* Price block */}
          <div className="bg-white border border-border p-5 space-y-2">
            <div className="flex items-baseline gap-3">
              <span className="font-serif text-3xl font-semibold text-charcoal">
                {formatNZD(diamond.priceNzd)}
              </span>
              <span className="text-sm text-warm-gray-400">NZD</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {diamond.feedPrice != null && (
                <span className="text-warm-gray-400 line-through">
                  {formatUSD(diamond.feedPrice)} USD
                </span>
              )}
              {diamond.markupRatio != null && (
                <span className="text-warm-gray-400 font-mono text-xs bg-cream px-2 py-0.5 border border-border">
                  markup: {formatMarkupRatio(diamond.markupRatio)}
                </span>
              )}
            </div>
            {diamond.pricePerCarat != null && (
              <p className="text-xs text-warm-gray-400">
                {formatUSD(diamond.pricePerCarat)}/ct
              </p>
            )}
          </div>

          {/* Actions */}
          <DiamondActions diamond={diamond} />

          {/* Specs */}
          <div className="border-t border-border pt-6">
            <DiamondSpecs diamond={diamond} />
          </div>
        </div>
      </div>
    </div>
  );
}

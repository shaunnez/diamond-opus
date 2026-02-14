import { useNavigate } from 'react-router-dom';
import { DiamondMedia } from './DiamondMedia';
import { AvailabilityBadge, LabBadge, FeedBadge } from '../ui/Badge';
import { formatNZD, formatUSD, formatCarats, formatMarkupRatio } from '../../utils/format';
import type { Diamond } from '../../types/diamond';

interface DiamondCardProps {
  diamond: Diamond;
}

export function DiamondCard({ diamond }: DiamondCardProps) {
  const navigate = useNavigate();

  const specs = [diamond.color, diamond.clarity, diamond.cut].filter(Boolean).join(' \u00B7 ');

  return (
    <button
      onClick={() => navigate(`/diamonds/${diamond.id}`)}
      className="bg-white border border-border text-left group hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 flex flex-col w-full"
    >
      {/* Media */}
      <DiamondMedia
        videoUrl={diamond.videoUrl}
        imageUrl={diamond.imageUrl}
        shape={diamond.shape}
        alt={`${diamond.shape} ${formatCarats(diamond.carats)}`}
        feed={diamond.feed}
      />

      {/* Info */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Top row: shape+carat and badges */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-serif text-sm font-semibold text-charcoal leading-tight">
            {diamond.shape} {formatCarats(diamond.carats)}
          </h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            {diamond.certificateLab && <LabBadge lab={diamond.certificateLab} />}
            <FeedBadge feed={diamond.feed} />
          </div>
        </div>

        {/* Specs */}
        {specs && (
          <p className="text-xs text-warm-gray-500">{specs}</p>
        )}

        {/* Fancy color info */}
        {diamond.fancyColor && (
          <p className="text-xs text-warm-gray-500">
            {diamond.fancyIntensity} {diamond.fancyColor}
          </p>
        )}

        {/* Price */}
        <div className="mt-auto pt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold text-charcoal">
              {formatNZD(diamond.priceNzd)}
            </span>
            {diamond.feedPrice != null && (
              <span className="text-xs text-warm-gray-400 line-through">
                {formatUSD(diamond.feedPrice)}
              </span>
            )}
            {diamond.markupRatio != null && (
              <span className="text-[10px] text-warm-gray-400 font-mono">
                +{formatMarkupRatio(diamond.markupRatio)}
              </span>
            )}
          </div>
        </div>

        {/* Availability */}
        <div className="flex items-center justify-between pt-1">
          <AvailabilityBadge availability={diamond.availability} />
          {diamond.labGrown && (
            <span className="text-[10px] text-warm-gray-400 uppercase tracking-wider">
              Lab Grown
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

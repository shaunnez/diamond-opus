import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Video } from 'lucide-react';
import type { Diamond } from '@diamond-opus/shared/types';
import { DiamondImage } from './DiamondImage';
import { DiamondShapeIcon } from './DiamondShapeIcon';

interface DiamondCardProps {
  diamond: Diamond;
}

export function DiamondCard({ diamond }: DiamondCardProps) {
  const navigate = useNavigate();
  const [showVideo, setShowVideo] = useState(false);

  const handleClick = () => {
    navigate(`/diamonds/${diamond.id}`);
  };

  const toggleVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowVideo(!showVideo);
  };

  return (
    <div
      onClick={handleClick}
      className="group relative bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-soft-lg hover:-translate-y-1 hover:border-primary-300 dark:hover:border-primary-600"
    >
      {/* Image */}
      <div className="relative">
        <DiamondImage
          src={diamond.imageUrl}
          alt={`${diamond.shape} ${diamond.carats}ct ${diamond.color} ${diamond.clarity}`}
          shape={diamond.shape}
          aspectRatio="square"
          showVideo={showVideo}
          videoSrc={diamond.videoUrl}
        />

        {/* Feed badge */}
        <div className="absolute top-2 left-2">
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-white/90 dark:bg-stone-900/90 backdrop-blur-sm border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300">
            {diamond.feed}
          </span>
        </div>

        {/* Video toggle button */}
        {diamond.videoUrl && (
          <button
            onClick={toggleVideo}
            className="absolute top-2 right-2 p-2 rounded-full bg-white/90 dark:bg-stone-900/90 backdrop-blur-sm border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            title={showVideo ? 'Show image' : 'Show video'}
          >
            <Video className={`w-4 h-4 ${showVideo ? 'fill-current' : ''}`} />
          </button>
        )}

        {/* Quick view overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="flex items-center gap-2 text-white transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
            <Eye className="w-5 h-5" />
            <span className="text-sm font-medium">View Details</span>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="p-4">
        {/* Shape and carat */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 text-primary-600 dark:text-primary-400">
            <DiamondShapeIcon shape={diamond.shape} />
          </div>
          <h3 className="font-semibold text-stone-900 dark:text-stone-100">
            {diamond.shape}
          </h3>
          <span className="text-sm text-stone-600 dark:text-stone-400">
            {diamond.carats?.toFixed(2)}ct
          </span>
        </div>

        {/* Specs */}
        <div className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400 mb-3">
          <span className="font-medium">{diamond.color}</span>
          <span>•</span>
          <span className="font-medium">{diamond.clarity}</span>
          {diamond.cut && (
            <>
              <span>•</span>
              <span>{diamond.cut}</span>
            </>
          )}
        </div>

        {/* Certificate */}
        {diamond.certificateLab && (
          <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-500 mb-3">
            <span className="font-medium">{diamond.certificateLab}</span>
            {diamond.certificateNumber && (
              <span className="font-mono">{diamond.certificateNumber.substring(0, 10)}</span>
            )}
          </div>
        )}

        {/* Price */}
        <div className="flex items-baseline justify-between pt-3 border-t border-stone-100 dark:border-stone-700">
          <div>
            <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">
              ${(diamond.diamondPrice || diamond.feedPrice)?.toLocaleString()}
            </div>
            <div className="text-xs text-stone-500 dark:text-stone-500">
              ${diamond.pricePerCarat?.toLocaleString()}/ct
            </div>
          </div>

          {/* Availability badge */}
          <div>
            <span
              className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                diamond.availability === 'available'
                  ? 'bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-400 border border-success-200 dark:border-success-500/30'
                  : diamond.availability === 'on_hold'
                  ? 'bg-warning-50 dark:bg-warning-900/20 text-warning-700 dark:text-warning-400 border border-warning-200 dark:border-warning-500/30'
                  : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-600'
              }`}
            >
              {diamond.availability}
            </span>
          </div>
        </div>

        {/* Lab grown badge */}
        {diamond.labGrown && (
          <div className="mt-2">
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-info-50 dark:bg-info-900/20 text-info-700 dark:text-info-400 border border-info-200 dark:border-info-500/30">
              Lab Grown
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

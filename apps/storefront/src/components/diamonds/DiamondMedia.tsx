import { useState } from 'react';
import { ShapeSvg } from './ShapeSvg';

interface DiamondMediaProps {
  videoUrl?: string;
  imageUrl?: string;
  shape: string;
  alt: string;
  className?: string;
  size?: 'card' | 'detail';
  feed?: string;
}

// Demo feed fallback images based on shape
const DEMO_IMAGES: Record<string, string> = {
  ROUND: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?w=800&q=80',
  OVAL: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&q=80',
  EMERALD: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&q=80',
  CUSHION: 'https://images.unsplash.com/photo-1617038220319-276d3cfab638?w=800&q=80',
  PRINCESS: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&q=80',
  ASSCHER: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800&q=80',
  RADIANT: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&q=80',
  MARQUISE: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?w=800&q=80',
  PEAR: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800&q=80',
  HEART: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&q=80',
};

export function DiamondMedia({
  videoUrl,
  imageUrl,
  shape,
  alt,
  className = '',
  size = 'card',
  feed,
}: DiamondMediaProps) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);

  const containerClasses =
    size === 'detail'
      ? `bg-cream flex items-center justify-center relative overflow-hidden ${className}`
      : `bg-cream flex items-center justify-center aspect-square relative overflow-hidden ${className}`;

  // For demo feed without image, use shape-based demo image
  const finalImageUrl = imageUrl || (feed === 'demo' ? DEMO_IMAGES[shape] : undefined);

  // V360 video — render as interactive iframe
  if (videoUrl) {
    return (
      <div className={containerClasses}>
        {!videoLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-warm-gray-100 to-warm-gray-200 animate-shimmer" />
        )}
        <iframe
          src={videoUrl}
          title={alt}
          className="w-full h-full border-0"
          allow="autoplay; fullscreen"
          loading="lazy"
          onLoad={() => setVideoLoaded(true)}
        />
      </div>
    );
  }

  // Image fallback
  if (finalImageUrl && !imgError) {
    return (
      <div className={containerClasses}>
        {!imgLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-warm-gray-100 to-warm-gray-200 animate-shimmer" />
        )}
        <img
          src={finalImageUrl}
          alt={alt}
          className={`w-full h-full object-contain transition-opacity duration-300 ${
            imgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // Shape SVG placeholder
  return (
    <div className={containerClasses}>
      <ShapeSvg
        shape={shape}
        size={size === 'detail' ? 120 : 64}
        className="text-warm-gray-400/50"
      />
    </div>
  );
}

import { useState } from 'react';
import { ShapeSvg } from './ShapeSvg';

interface DiamondMediaProps {
  videoUrl?: string;
  imageUrl?: string;
  shape: string;
  alt: string;
  className?: string;
  size?: 'card' | 'detail';
}

export function DiamondMedia({
  videoUrl,
  imageUrl,
  shape,
  alt,
  className = '',
  size = 'card',
}: DiamondMediaProps) {
  const [imgError, setImgError] = useState(false);

  const containerClasses =
    size === 'detail'
      ? `bg-cream flex items-center justify-center overflow-hidden ${className}`
      : `bg-cream flex items-center justify-center aspect-square overflow-hidden ${className}`;

  // V360 video — render as interactive iframe
  if (videoUrl) {
    return (
      <div className={containerClasses}>
        <iframe
          src={videoUrl}
          title={alt}
          className="w-full h-full border-0"
          allow="autoplay; fullscreen"
          loading="lazy"
        />
      </div>
    );
  }

  // Image fallback
  if (imageUrl && !imgError) {
    return (
      <div className={containerClasses}>
        <img
          src={imageUrl}
          alt={alt}
          className="w-full h-full object-contain"
          loading="lazy"
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

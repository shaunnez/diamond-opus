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

function Skeleton() {
  return (
    <div className="absolute inset-0 skeleton-shimmer" />
  );
}

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
  const [videoError, setVideoError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [showIframe, setShowIframe] = useState(false);

  const containerClasses =
    size === 'detail'
      ? `bg-cream flex items-center justify-center relative overflow-hidden ${className}`
      : `bg-cream flex items-center justify-center aspect-square relative overflow-hidden ${className}`;

  // For demo feed without image, use shape-based demo image (normalize shape to uppercase)
  const normalizedShape = shape?.toUpperCase() ?? '';
  const finalImageUrl = imageUrl || (feed === 'demo' ? DEMO_IMAGES[normalizedShape] : undefined);
  const isDesktop = window.innerWidth >= 1024;

  const handleInteraction = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (videoUrl && !videoError) {
      setShowIframe(true);
    }
    return false;
  };

  // For card size on search page: show iframe only after user interaction
  // For detail page: show iframe immediately
  if (videoUrl && !videoError && showIframe) {
    return (
      <div className={containerClasses}>
        {!videoLoaded && <Skeleton />}
        <iframe
          src={isDesktop ? videoUrl.replace('/500/500', '/') : videoUrl}
          title={alt}
          className={`w-full h-full border-0 transition-opacity duration-300 ${size === 'detail' ? '' : 'h-[300px]'} ${
            videoLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          allow="autoplay; fullscreen"
          loading="lazy"
          scrolling="no"
          onLoad={() => setVideoLoaded(true)}
          onError={() => setVideoError(true)}
          style={{ overflow: 'hidden' }}
        />

      </div>
    );
  }

  // Image fallback or initial view for cards with video
  if (finalImageUrl && !imgError) {
    return (
      <div
        className={containerClasses}
        onClick={handleInteraction}
      >
        {!imgLoaded && <Skeleton />}
        <img
          src={finalImageUrl}
          alt={alt}
          className={`max-w-full max-h-full transform transition-opacity object-cover  ${size === 'detail' ? 'object-cover h-full' : 'object-cover h-[300px]'} ${
            imgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
        />
        {videoUrl && (
          <a className="absolute h-full w-full z-10 flex items-center justify-center align-middle"  onClick={handleInteraction}>
            <span className=" bg-black opacity-50 w-fullh-10 z-10 flex w-full items-center justify-center">
              <span className="text-center ">
                <p  className="text-white text-sm p-1" >Click v360</p>
              </span>
            </span>
          </a>
        )}

      </div>
    );
  }

  // Shape SVG placeholder
  return (
    <div
      className={containerClasses}
      onClick={handleInteraction}
    >
      <ShapeSvg
        shape={shape}
        size={size === 'detail' ? 120 : 64}
        className="text-warm-gray-400/50 h-[300px]"
      />
    </div>
  );
}

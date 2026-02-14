import { useState } from 'react';
import { Diamond } from 'lucide-react';

interface DiamondImageProps {
  src?: string;
  alt: string;
  shape?: string;
  className?: string;
  aspectRatio?: 'square' | 'video';
  showVideo?: boolean;
  videoSrc?: string;
}

export function DiamondImage({
  src,
  alt,
  shape = 'ROUND',
  className = '',
  aspectRatio = 'square',
  showVideo = false,
  videoSrc,
}: DiamondImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const aspectClasses = aspectRatio === 'square' ? 'aspect-square' : 'aspect-video';

  // Fallback to shape-based placeholder image
  const getFallbackImage = () => {
    const normalizedShape = shape.toUpperCase().split(' ')[0]; // Handle "CUSHION BRILLIANT" etc.

    // Map of real diamond images by shape (using placeholder service)
    const shapeImages: Record<string, string> = {
      ROUND: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400&h=400&fit=crop',
      OVAL: 'https://images.unsplash.com/photo-1611652022419-a9419f74343c?w=400&h=400&fit=crop',
      EMERALD: 'https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?w=400&h=400&fit=crop',
      CUSHION: 'https://images.unsplash.com/photo-1603561596112-0a132b757442?w=400&h=400&fit=crop',
      ASSCHER: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=400&h=400&fit=crop',
      RADIANT: 'https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?w=400&h=400&fit=crop',
      MARQUISE: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&h=400&fit=crop',
      PEAR: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&h=400&fit=crop',
      PRINCESS: 'https://images.unsplash.com/photo-1603561596112-0a132b757442?w=400&h=400&fit=crop',
      HEART: 'https://images.unsplash.com/photo-1611652022419-a9419f74343c?w=400&h=400&fit=crop',
    };

    return shapeImages[normalizedShape] || shapeImages.ROUND;
  };

  const displaySrc = hasError || !src ? getFallbackImage() : src;

  return (
    <div className={`relative ${aspectClasses} ${className} bg-stone-100 dark:bg-stone-800 rounded-lg overflow-hidden group`}>
      {/* Skeleton loader */}
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-r from-stone-200 via-stone-300 to-stone-200 dark:from-stone-700 dark:via-stone-600 dark:to-stone-700 animate-shimmer bg-[length:200%_100%]">
          <div className="absolute inset-0 flex items-center justify-center">
            <Diamond className="w-8 h-8 text-stone-400 dark:text-stone-500 animate-pulse" />
          </div>
        </div>
      )}

      {/* Main image or video */}
      {showVideo && videoSrc ? (
        <video
          src={videoSrc}
          className="w-full h-full object-contain transition-opacity duration-300"
          style={{ opacity: isLoading ? 0 : 1 }}
          onLoadedData={() => setIsLoading(false)}
          onError={() => {
            setHasError(true);
            setIsLoading(false);
          }}
          autoPlay
          loop
          muted
          playsInline
        />
      ) : (
        <img
          src={displaySrc}
          alt={alt}
          className="w-full h-full object-contain transition-all duration-300 group-hover:scale-105"
          style={{ opacity: isLoading ? 0 : 1 }}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            if (!hasError) {
              setHasError(true);
              // Trigger re-render with fallback
              setIsLoading(true);
              setTimeout(() => setIsLoading(false), 0);
            }
          }}
        />
      )}

      {/* Overlay gradient on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </div>
  );
}

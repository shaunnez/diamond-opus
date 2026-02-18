interface StarRatingProps {
  /** Rating on a 1–10 scale */
  rating: number;
  size?: 'sm' | 'md';
  showNumeric?: boolean;
}

/**
 * Renders a 5-star rating display mapped from a 1–10 scale.
 * Each star represents 2 points; half-stars are shown for odd values.
 */
export function StarRating({ rating, size = 'sm', showNumeric = false }: StarRatingProps) {
  // Map 1–10 to 0–5 (each star = 2 points)
  const starValue = rating / 2;
  const fullStars = Math.floor(starValue);
  const hasHalf = starValue - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  const starSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: fullStars }).map((_, i) => (
          <FullStar key={`full-${i}`} className={starSize} />
        ))}
        {hasHalf && <HalfStar className={starSize} />}
        {Array.from({ length: emptyStars }).map((_, i) => (
          <EmptyStar key={`empty-${i}`} className={starSize} />
        ))}
      </div>
      {showNumeric && (
        <span className={`${textSize} text-warm-gray-500 font-mono`}>{rating}/10</span>
      )}
    </div>
  );
}

function FullStar({ className }: { className: string }) {
  return (
    <svg className={`${className} text-gold fill-current`} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function HalfStar({ className }: { className: string }) {
  return (
    <svg className={`${className} text-gold`} viewBox="0 0 20 20" aria-hidden="true">
      <defs>
        <linearGradient id="half-grad">
          <stop offset="50%" stopColor="currentColor" />
          <stop offset="50%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        fill="url(#half-grad)"
        stroke="currentColor"
        strokeWidth="0.5"
        d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
      />
    </svg>
  );
}

function EmptyStar({ className }: { className: string }) {
  return (
    <svg className={`${className} text-warm-gray-300`} viewBox="0 0 20 20" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
      />
    </svg>
  );
}

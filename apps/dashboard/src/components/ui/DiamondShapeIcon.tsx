interface DiamondShapeIconProps {
  shape: string;
  className?: string;
}

export function DiamondShapeIcon({ shape, className = 'w-full h-full' }: DiamondShapeIconProps) {
  const normalizedShape = shape.toUpperCase().split(' ')[0]; // Handle "CUSHION BRILLIANT" etc.

  const shapes: Record<string, JSX.Element> = {
    ROUND: (
      <svg viewBox="0 0 100 100" className={className} fill="currentColor">
        <circle cx="50" cy="50" r="45" opacity="0.9" />
        <circle cx="50" cy="50" r="35" opacity="0.7" />
        <circle cx="50" cy="50" r="25" opacity="0.5" />
        <circle cx="50" cy="50" r="15" opacity="0.3" />
      </svg>
    ),
    OVAL: (
      <svg viewBox="0 0 100 100" className={className} fill="currentColor">
        <ellipse cx="50" cy="50" rx="30" ry="45" opacity="0.9" />
        <ellipse cx="50" cy="50" rx="24" ry="36" opacity="0.7" />
        <ellipse cx="50" cy="50" rx="18" ry="27" opacity="0.5" />
        <ellipse cx="50" cy="50" rx="12" ry="18" opacity="0.3" />
      </svg>
    ),
    EMERALD: (
      <svg viewBox="0 0 100 100" className={className} fill="currentColor">
        <polygon points="20,25 80,25 85,30 85,70 80,75 20,75 15,70 15,30" opacity="0.9" />
        <polygon points="25,30 75,30 78,33 78,67 75,70 25,70 22,67 22,33" opacity="0.7" />
        <polygon points="30,35 70,35 72,37 72,63 70,65 30,65 28,63 28,37" opacity="0.5" />
        <rect x="35" y="40" width="30" height="20" opacity="0.3" />
      </svg>
    ),
    CUSHION: (
      <svg viewBox="0 0 100 100" className={className} fill="currentColor">
        <path d="M30,20 L70,20 Q85,20 85,35 L85,65 Q85,80 70,80 L30,80 Q15,80 15,65 L15,35 Q15,20 30,20 Z" opacity="0.9" />
        <path d="M32,26 L68,26 Q78,26 78,36 L78,64 Q78,74 68,74 L32,74 Q22,74 22,64 L22,36 Q22,26 32,26 Z" opacity="0.7" />
        <path d="M35,32 L65,32 Q70,32 70,37 L70,63 Q70,68 65,68 L35,68 Q30,68 30,63 L30,37 Q30,32 35,32 Z" opacity="0.5" />
        <rect x="38" y="38" width="24" height="24" rx="4" opacity="0.3" />
      </svg>
    ),
    PRINCESS: (
      <svg viewBox="0 0 100 100" className={className} fill="currentColor">
        <rect x="15" y="15" width="70" height="70" opacity="0.9" />
        <rect x="22" y="22" width="56" height="56" opacity="0.7" />
        <rect x="30" y="30" width="40" height="40" opacity="0.5" />
        <rect x="38" y="38" width="24" height="24" opacity="0.3" />
        <path d="M50,30 L65,50 L50,70 L35,50 Z" opacity="0.2" />
      </svg>
    ),
    ASSCHER: (
      <svg viewBox="0 0 100 100" className={className} fill="currentColor">
        <polygon points="30,15 70,15 85,30 85,70 70,85 30,85 15,70 15,30" opacity="0.9" />
        <polygon points="34,22 66,22 78,34 78,66 66,78 34,78 22,66 22,34" opacity="0.7" />
        <polygon points="38,30 62,30 70,38 70,62 62,70 38,70 30,62 30,38" opacity="0.5" />
        <rect x="42" y="42" width="16" height="16" opacity="0.3" />
      </svg>
    ),
    RADIANT: (
      <svg viewBox="0 0 100 100" className={className} fill="currentColor">
        <polygon points="25,20 75,20 85,30 85,70 75,80 25,80 15,70 15,30" opacity="0.9" />
        <polygon points="30,26 70,26 78,34 78,66 70,74 30,74 22,66 22,34" opacity="0.7" />
        <polygon points="35,32 65,32 70,37 70,63 65,68 35,68 30,63 30,37" opacity="0.5" />
        <rect x="40" y="40" width="20" height="20" opacity="0.3" />
      </svg>
    ),
    MARQUISE: (
      <svg viewBox="0 0 100 100" className={className} fill="currentColor">
        <path d="M10,50 Q10,20 50,10 Q90,20 90,50 Q90,80 50,90 Q10,80 10,50 Z" opacity="0.9" />
        <path d="M18,50 Q18,28 50,20 Q82,28 82,50 Q82,72 50,80 Q18,72 18,50 Z" opacity="0.7" />
        <path d="M26,50 Q26,36 50,30 Q74,36 74,50 Q74,64 50,70 Q26,64 26,50 Z" opacity="0.5" />
        <ellipse cx="50" cy="50" rx="18" ry="12" opacity="0.3" />
      </svg>
    ),
    PEAR: (
      <svg viewBox="0 0 100 100" className={className} fill="currentColor">
        <path d="M50,10 Q70,15 80,35 Q85,50 75,65 Q65,80 50,90 Q35,80 25,65 Q15,50 20,35 Q30,15 50,10 Z" opacity="0.9" />
        <path d="M50,18 Q66,22 74,38 Q78,50 70,62 Q62,74 50,82 Q38,74 30,62 Q22,50 26,38 Q34,22 50,18 Z" opacity="0.7" />
        <path d="M50,26 Q62,29 68,41 Q71,50 65,59 Q59,68 50,74 Q41,68 35,59 Q29,50 32,41 Q38,29 50,26 Z" opacity="0.5" />
        <circle cx="50" cy="46" r="12" opacity="0.3" />
      </svg>
    ),
    HEART: (
      <svg viewBox="0 0 100 100" className={className} fill="currentColor">
        <path d="M50,85 L15,50 Q10,40 15,30 Q20,20 30,20 Q40,20 50,30 Q60,20 70,20 Q80,20 85,30 Q90,40 85,50 Z" opacity="0.9" />
        <path d="M50,76 L21,47 Q17,39 21,31 Q25,24 32,24 Q39,24 50,35 Q61,24 68,24 Q75,24 79,31 Q83,39 79,47 Z" opacity="0.7" />
        <path d="M50,67 L27,44 Q24,38 27,32 Q30,28 35,28 Q40,28 50,38 Q60,28 65,28 Q70,28 73,32 Q76,38 73,44 Z" opacity="0.5" />
        <circle cx="50" cy="42" r="8" opacity="0.3" />
      </svg>
    ),
  };

  return shapes[normalizedShape] || shapes.ROUND;
}

import { getShapeByName } from '../../utils/shapes';

interface ShapeSvgProps {
  shape: string;
  size?: number;
  className?: string;
  color?: string;
}

export function ShapeSvg({ shape, size = 48, className = '', color }: ShapeSvgProps) {
  const def = getShapeByName(shape);

  if (!def) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
        <circle cx="24" cy="24" r="18" fill="none" stroke={color || 'currentColor'} strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path
        d={def.path}
        fill="none"
        stroke={color || 'currentColor'}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

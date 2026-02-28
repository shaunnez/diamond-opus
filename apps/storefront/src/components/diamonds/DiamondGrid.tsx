import { DiamondCard } from './DiamondCard';
import type { Diamond } from '../../types/diamond';

interface DiamondGridProps {
  diamonds: Diamond[];
}

export function DiamondGrid({ diamonds }: DiamondGridProps) {
  if (diamonds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-border/50 flex items-center justify-center mb-4">
          <svg width="32" height="32" viewBox="0 0 48 48" className="text-warm-gray-400">
            <path
              d="M24 4 C35.05 4 44 12.95 44 24 C44 35.05 35.05 44 24 44 C12.95 44 4 35.05 4 24 C4 12.95 12.95 4 24 4 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </div>
        <h3 className="font-serif text-lg text-charcoal mb-1">No diamonds found</h3>
        <p className="text-sm text-warm-gray-500">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {diamonds.map((diamond, index) => (
        <div
          key={diamond.id}
          className="animate-card-enter"
          style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
        >
          <DiamondCard diamond={diamond} />
        </div>
      ))}
    </div>
  );
}

import type { DiamondAvailability } from '../../types/diamond';

const styles: Record<DiamondAvailability, string> = {
  available: 'bg-success/10 text-success border-success/20',
  on_hold: 'bg-hold/10 text-hold border-hold/20',
  sold: 'bg-sold/10 text-sold border-sold/20',
  unavailable: 'bg-warm-gray-400/10 text-warm-gray-500 border-warm-gray-400/20',
};

const labels: Record<DiamondAvailability, string> = {
  available: 'Available',
  on_hold: 'On Hold',
  sold: 'Sold',
  unavailable: 'Unavailable',
};

interface BadgeProps {
  availability: DiamondAvailability;
  className?: string;
}

export function AvailabilityBadge({ availability, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium border ${styles[availability]} ${className}`}
    >
      {labels[availability]}
    </span>
  );
}

export function FeedBadge({ feed }: { feed: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-cream text-warm-gray-500 border border-border">
      {feed}
    </span>
  );
}

export function LabBadge({ lab }: { lab: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-charcoal/5 text-charcoal border border-charcoal/10">
      {lab}
    </span>
  );
}

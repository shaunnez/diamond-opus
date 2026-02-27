import { useQuery } from '@tanstack/react-query';
import { getRecommendedDiamonds } from '../../api/diamonds';
import { DiamondCard } from './DiamondCard';
import type { Diamond } from '../../types/diamond';

interface RelatedDiamondsProps {
  anchorId: string;
}

interface RecommendationSlot {
  label: string;
  diamond: Diamond | null;
}

export function RelatedDiamonds({ anchorId }: RelatedDiamondsProps) {
  const { data } = useQuery({
    queryKey: ['diamond', anchorId, 'related'],
    queryFn: () => getRecommendedDiamonds(anchorId),
    enabled: !!anchorId,
  });

  if (!data) return null;

  const slots: RecommendationSlot[] = [
    { label: 'Top Rated', diamond: data.highest_rated },
    { label: 'Premium Pick', diamond: data.most_expensive },
    { label: 'Best Value', diamond: data.mid_rated },
  ];

  const filledSlots = slots.filter(s => s.diamond !== null);
  if (filledSlots.length === 0) return null;

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="font-serif text-xl text-charcoal mb-6">You May Also Like</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {filledSlots.map(({ label, diamond }) => (
          <div key={diamond!.id} className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
            <DiamondCard diamond={diamond!} />
          </div>
        ))}
      </div>
    </section>
  );
}

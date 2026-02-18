import { useQuery } from '@tanstack/react-query';
import { getRelatedDiamonds } from '../../api/diamonds';
import { DiamondCard } from './DiamondCard';

interface RelatedDiamondsProps {
  anchorId: string;
}

export function RelatedDiamonds({ anchorId }: RelatedDiamondsProps) {
  const { data: diamonds } = useQuery({
    queryKey: ['diamond', anchorId, 'related'],
    queryFn: () => getRelatedDiamonds(anchorId),
    enabled: !!anchorId,
  });

  if (!diamonds?.length) return null;

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="font-serif text-xl text-charcoal mb-6">Similar Diamonds</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {diamonds.map((diamond) => (
          <DiamondCard key={diamond.id} diamond={diamond} />
        ))}
      </div>
    </section>
  );
}

import type { StoneType } from '../../types/diamond';

interface StoneTypeFilterProps {
  value: StoneType;
  onChange: (value: StoneType) => void;
}

const options: { value: StoneType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'natural', label: 'Natural' },
  { value: 'lab', label: 'Lab Grown' },
  { value: 'fancy', label: 'Fancy Colored' },
];

export function StoneTypeFilter({ value, onChange }: StoneTypeFilterProps) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-warm-gray-600 uppercase tracking-wider">
        Stone Type
      </label>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-2 py-2 text-xs font-medium border transition-colors ${
              value === opt.value
                ? 'bg-charcoal text-white border-charcoal'
                : 'bg-white text-warm-gray-500 border-border hover:border-warm-gray-400 hover:text-charcoal'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

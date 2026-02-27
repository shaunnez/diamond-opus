interface ChipSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  getLabel?: (value: string) => string;
}

export function ChipSelect({ label, options, selected, onChange, getLabel }: ChipSelectProps) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-warm-gray-600 uppercase tracking-wider">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              className={`px-2.5 py-1 text-xs font-medium border transition-colors ${
                active
                  ? 'bg-charcoal text-white border-charcoal'
                  : 'bg-white text-warm-gray-500 border-border hover:border-warm-gray-400 hover:text-charcoal'
              }`}
            >
              {getLabel ? getLabel(opt) : opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

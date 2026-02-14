interface ToggleFilterProps {
  label: string;
  checked: boolean | undefined;
  onChange: (checked: boolean | undefined) => void;
}

export function ToggleFilter({ label, checked, onChange }: ToggleFilterProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked ?? false}
          onChange={() => onChange(checked ? undefined : true)}
        />
        <div
          className={`w-9 h-5 rounded-full transition-colors ${
            checked ? 'bg-gold' : 'bg-border'
          }`}
        />
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </div>
      <span className="text-xs font-medium text-warm-gray-600 uppercase tracking-wider group-hover:text-charcoal transition-colors">
        {label}
      </span>
    </label>
  );
}

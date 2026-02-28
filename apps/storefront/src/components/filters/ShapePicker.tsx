import { DIAMOND_SHAPES } from '../../utils/shapes';
import { ShapeSvg } from '../diamonds/ShapeSvg';

interface ShapePickerProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function ShapePicker({ selected, onChange }: ShapePickerProps) {
  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((s) => s !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-2">
        {DIAMOND_SHAPES.map((shape) => {
          const active = selected.includes(shape.name);
          return (
            <button
              key={shape.name}
              onClick={() => toggle(shape.name)}
              className={`flex flex-col items-center gap-1 p-2 border transition-all ${
                active
                  ? 'border-gold bg-gold/5 text-gold'
                  : 'border-border bg-white text-warm-gray-400 hover:border-warm-gray-400 hover:text-warm-gray-600'
              }`}
              title={shape.label}
            >
              <ShapeSvg shape={shape.name} size={28} />
              <span className="text-[10px] font-medium leading-tight">{shape.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

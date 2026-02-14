import { useState, useEffect, useCallback } from 'react';

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: [number | undefined, number | undefined];
  onChange: (value: [number | undefined, number | undefined]) => void;
  formatValue?: (v: number) => string;
}

export function RangeSlider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  formatValue = (v) => String(v),
}: RangeSliderProps) {
  const [localMin, setLocalMin] = useState(value[0] ?? min);
  const [localMax, setLocalMax] = useState(value[1] ?? max);

  useEffect(() => {
    setLocalMin(value[0] ?? min);
    setLocalMax(value[1] ?? max);
  }, [value, min, max]);

  const commitChange = useCallback(() => {
    const newMin = localMin <= min ? undefined : localMin;
    const newMax = localMax >= max ? undefined : localMax;
    onChange([newMin, newMax]);
  }, [localMin, localMax, min, max, onChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-warm-gray-600 uppercase tracking-wider">
          {label}
        </label>
        <span className="text-xs text-warm-gray-500">
          {formatValue(localMin)} — {formatValue(localMax)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localMin}
          onChange={(e) => {
            const v = Number(e.target.value);
            setLocalMin(Math.min(v, localMax - step));
          }}
          onMouseUp={commitChange}
          onTouchEnd={commitChange}
          className="flex-1"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localMax}
          onChange={(e) => {
            const v = Number(e.target.value);
            setLocalMax(Math.max(v, localMin + step));
          }}
          onMouseUp={commitChange}
          onTouchEnd={commitChange}
          className="flex-1"
        />
      </div>
    </div>
  );
}

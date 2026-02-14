import { useState } from 'react';
import { ChevronDown, RotateCcw, X } from 'lucide-react';
import { ShapePicker } from './ShapePicker';
import { RangeSlider } from './RangeSlider';
import { ChipSelect } from './ChipSelect';
import { ToggleFilter } from './ToggleFilter';
import { StoneTypeFilter } from './StoneTypeFilter';
import type { DiamondSearchParams, StoneType } from '../../types/diamond';
import { formatNZD } from '../../utils/format';

interface FilterPanelProps {
  filters: DiamondSearchParams;
  stoneType: StoneType;
  onFiltersChange: (filters: DiamondSearchParams) => void;
  onStoneTypeChange: (type: StoneType) => void;
  onReset: () => void;
  open: boolean;
  onClose: () => void;
}

const COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
const CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3'];
const CUTS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
const POLISH = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
const SYMMETRY = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
const FLUORESCENCE = ['None', 'Faint', 'Medium', 'Strong', 'Very Strong'];
const LABS = ['GIA', 'AGS', 'IGI', 'HRD', 'GCAL'];

export function FilterPanel({
  filters,
  stoneType,
  onFiltersChange,
  onStoneTypeChange,
  onReset,
  open,
  onClose,
}: FilterPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (partial: Partial<DiamondSearchParams>) => {
    onFiltersChange({ ...filters, ...partial, page: 1 });
  };

  const selectedShapes = filters.shape ? filters.shape.split(',') : [];

  const content = (
    <div className="space-y-6">
      {/* Stone Type */}
      <StoneTypeFilter value={stoneType} onChange={onStoneTypeChange} />

      {/* Shape */}
      <ShapePicker
        selected={selectedShapes}
        onChange={(shapes) => update({ shape: shapes.length ? shapes.join(',') : undefined })}
      />

      {/* Carat */}
      <RangeSlider
        label="Carat"
        min={0.2}
        max={10}
        step={0.1}
        value={[filters.carat_min, filters.carat_max]}
        onChange={([min, max]) => update({ carat_min: min, carat_max: max })}
        formatValue={(v) => `${v.toFixed(1)}ct`}
      />

      {/* Price NZD */}
      <RangeSlider
        label="Price (NZD)"
        min={0}
        max={200000}
        step={500}
        value={[filters.price_min, filters.price_max]}
        onChange={([min, max]) => update({ price_min: min, price_max: max })}
        formatValue={(v) => formatNZD(v)}
      />

      {/* Color */}
      <ChipSelect
        label="Color"
        options={COLORS}
        selected={filters.color || []}
        onChange={(color) => update({ color: color.length ? color : undefined })}
      />

      {/* Clarity */}
      <ChipSelect
        label="Clarity"
        options={CLARITIES}
        selected={filters.clarity || []}
        onChange={(clarity) => update({ clarity: clarity.length ? clarity : undefined })}
      />

      {/* Cut */}
      <ChipSelect
        label="Cut"
        options={CUTS}
        selected={filters.cut || []}
        onChange={(cut) => update({ cut: cut.length ? cut : undefined })}
      />

      {/* Polish */}
      <ChipSelect
        label="Polish"
        options={POLISH}
        selected={filters.polish || []}
        onChange={(polish) => update({ polish: polish.length ? polish : undefined })}
      />

      {/* Symmetry */}
      <ChipSelect
        label="Symmetry"
        options={SYMMETRY}
        selected={filters.symmetry || []}
        onChange={(symmetry) => update({ symmetry: symmetry.length ? symmetry : undefined })}
      />

      {/* Fluorescence */}
      <ChipSelect
        label="Fluorescence"
        options={FLUORESCENCE}
        selected={filters.fluorescence_intensity || []}
        onChange={(fi) =>
          update({ fluorescence_intensity: fi.length ? fi : undefined })
        }
      />

      {/* Lab */}
      <ChipSelect
        label="Certificate Lab"
        options={LABS}
        selected={filters.lab || []}
        onChange={(lab) => update({ lab: lab.length ? lab : undefined })}
      />

      {/* Toggles */}
      <div className="space-y-3 pt-2">
        <ToggleFilter
          label="Eye Clean"
          checked={filters.eye_clean}
          onChange={(v) => update({ eye_clean: v })}
        />
        <ToggleFilter
          label="No BGM"
          checked={filters.no_bgm}
          onChange={(v) => update({ no_bgm: v })}
        />
      </div>

      {/* Advanced */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-xs font-medium text-warm-gray-500 hover:text-charcoal transition-colors uppercase tracking-wider w-full"
      >
        Advanced Filters
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
        />
      </button>

      {showAdvanced && (
        <div className="space-y-5 pt-1 animate-fade-in">
          <RangeSlider
            label="Table %"
            min={50}
            max={80}
            step={0.5}
            value={[filters.table_min, filters.table_max]}
            onChange={([min, max]) => update({ table_min: min, table_max: max })}
            formatValue={(v) => `${v}%`}
          />
          <RangeSlider
            label="Depth %"
            min={55}
            max={75}
            step={0.5}
            value={[filters.depth_pct_min, filters.depth_pct_max]}
            onChange={([min, max]) => update({ depth_pct_min: min, depth_pct_max: max })}
            formatValue={(v) => `${v}%`}
          />
          <RangeSlider
            label="L/W Ratio"
            min={0.8}
            max={2.5}
            step={0.05}
            value={[filters.ratio_min, filters.ratio_max]}
            onChange={([min, max]) => update({ ratio_min: min, ratio_max: max })}
            formatValue={(v) => v.toFixed(2)}
          />
        </div>
      )}

      {/* Reset */}
      <button
        onClick={onReset}
        className="flex items-center gap-2 text-xs font-medium text-warm-gray-500 hover:text-sold transition-colors uppercase tracking-wider"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Reset All Filters
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-72 flex-shrink-0">
        <div className="sticky top-4 bg-white border border-border p-5 max-h-[calc(100vh-6rem)] overflow-y-auto">
          <h2 className="font-serif text-lg font-semibold text-charcoal mb-5">Filters</h2>
          {content}
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-white shadow-card-hover overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-serif text-lg font-semibold text-charcoal">Filters</h2>
              <button onClick={onClose} className="text-warm-gray-400 hover:text-charcoal">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">{content}</div>
          </div>
        </div>
      )}
    </>
  );
}

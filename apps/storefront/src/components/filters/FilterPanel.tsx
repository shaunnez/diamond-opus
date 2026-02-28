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
const CUTS = ['EX', 'VG', 'G', 'F', 'P'];
const POLISH = ['EX', 'VG', 'G', 'F', 'P'];
const SYMMETRY = ['EX', 'VG', 'G', 'F', 'P'];
const FLUORESCENCE = ['NONE', 'FAINT', 'MEDIUM', 'STRONG', 'VERY_STRONG'];

const CUT_GRADE_LABELS: Record<string, string> = {
  EX: 'Excellent', VG: 'Very Good', G: 'Good', F: 'Fair', P: 'Poor',
};
const formatGradeLabel = (value: string) =>
  CUT_GRADE_LABELS[value] ?? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const LABS = ['GIA', 'AGS', 'IGI', 'HRD', 'GCAL'];

const FANCY_COLORS = [
  'Black', 'Blue', 'Brown', 'Chameleon', 'Cognac', 'Gray',
  'Green', 'Orange', 'Pink', 'Purple', 'White', 'Yellow',
  'Brown-Orange', 'Brown-Pink', 'Brown-Yellow', 'Gray-Blue',
  'Green-Yellow', 'Orange-Yellow', 'Pink-Purple',
  'Yellow-Green', 'Yellow-Orange',
];

const FANCY_INTENSITIES = [
  'Faint', 'Very Light', 'Light', 'Fancy Light', 'Fancy',
  'Fancy Intense', 'Fancy Vivid', 'Fancy Deep', 'Fancy Dark',
];

function FilterSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-3 text-xs font-medium text-charcoal uppercase tracking-wider hover:text-warm-gray-600 transition-colors"
      >
        {title}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

export function FilterPanel({
  filters,
  stoneType,
  onFiltersChange,
  onStoneTypeChange,
  onReset,
  open,
  onClose,
}: FilterPanelProps) {
  const [pendingFilters, setPendingFilters] = useState<DiamondSearchParams>(filters);
  const [pendingStoneType, setPendingStoneType] = useState<StoneType>(stoneType);

  const update = (partial: Partial<DiamondSearchParams>) =>
    setPendingFilters((prev) => ({ ...prev, ...partial, page: 1 }));

  const hasPendingChanges =
    JSON.stringify(pendingFilters) !== JSON.stringify(filters) ||
    pendingStoneType !== stoneType;

  const handleApply = () => {
    onFiltersChange(pendingFilters);
    if (pendingStoneType !== stoneType) onStoneTypeChange(pendingStoneType);
    onClose();
  };

  const handleReset = () => {
    setPendingFilters({});
    setPendingStoneType('all');
    onReset();
  };

  const isFancy = pendingStoneType === 'natural_fancy' || pendingStoneType === 'lab_fancy';

  const filterContent = (
    <div>
      <FilterSection title="Stone Type">
        <StoneTypeFilter value={pendingStoneType} onChange={setPendingStoneType} />
      </FilterSection>

      <FilterSection title="Shape">
        <ShapePicker
          selected={pendingFilters.shape || []}
          onChange={(shapes) => update({ shape: shapes.length ? shapes : undefined })}
        />
      </FilterSection>

      <FilterSection title="Carat">
        <RangeSlider
          label=""
          min={0.2}
          max={10}
          step={0.1}
          value={[pendingFilters.carat_min, pendingFilters.carat_max]}
          onChange={([min, max]) => update({ carat_min: min, carat_max: max })}
          formatValue={(v) => `${v.toFixed(1)}ct`}
        />
      </FilterSection>

      <FilterSection title="Price (NZD)">
        <RangeSlider
          label=""
          min={0}
          max={200000}
          step={500}
          value={[pendingFilters.price_min, pendingFilters.price_max]}
          onChange={([min, max]) => update({ price_min: min, price_max: max })}
          formatValue={(v) => formatNZD(v)}
        />
      </FilterSection>

      {isFancy ? (
        <>
          <FilterSection title="Fancy Color">
            <ChipSelect
              label=""
              options={FANCY_COLORS}
              selected={pendingFilters.fancy_colors || []}
              onChange={(fc) => update({ fancy_colors: fc.length ? fc : undefined })}
            />
          </FilterSection>
          <FilterSection title="Fancy Intensity">
            <ChipSelect
              label=""
              options={FANCY_INTENSITIES}
              selected={pendingFilters.fancy_intensity || []}
              onChange={(fi) => update({ fancy_intensity: fi.length ? fi : undefined })}
            />
          </FilterSection>
        </>
      ) : (
        <FilterSection title="Color">
          <ChipSelect
            label=""
            options={COLORS}
            selected={pendingFilters.color || []}
            onChange={(color) => update({ color: color.length ? color : undefined })}
          />
        </FilterSection>
      )}

      <FilterSection title="Clarity">
        <ChipSelect
          label=""
          options={CLARITIES}
          selected={pendingFilters.clarity || []}
          onChange={(clarity) => update({ clarity: clarity.length ? clarity : undefined })}
        />
      </FilterSection>

      <FilterSection title="Cut" defaultOpen={false}>
        <ChipSelect
          label=""
          options={CUTS}
          selected={pendingFilters.cut || []}
          onChange={(cut) => update({ cut: cut.length ? cut : undefined })}
          getLabel={formatGradeLabel}
        />
      </FilterSection>

      <FilterSection title="Polish" defaultOpen={false}>
        <ChipSelect
          label=""
          options={POLISH}
          selected={pendingFilters.polish || []}
          onChange={(polish) => update({ polish: polish.length ? polish : undefined })}
          getLabel={formatGradeLabel}
        />
      </FilterSection>

      <FilterSection title="Symmetry" defaultOpen={false}>
        <ChipSelect
          label=""
          options={SYMMETRY}
          selected={pendingFilters.symmetry || []}
          onChange={(symmetry) => update({ symmetry: symmetry.length ? symmetry : undefined })}
          getLabel={formatGradeLabel}
        />
      </FilterSection>

      <FilterSection title="Fluorescence" defaultOpen={false}>
        <ChipSelect
          label=""
          options={FLUORESCENCE}
          selected={pendingFilters.fluorescence_intensity || []}
          onChange={(fi) =>
            update({ fluorescence_intensity: fi.length ? fi : undefined })
          }
          getLabel={formatGradeLabel}
        />
      </FilterSection>

      <FilterSection title="Certificate Lab" defaultOpen={false}>
        <ChipSelect
          label=""
          options={LABS}
          selected={pendingFilters.lab || []}
          onChange={(lab) => update({ lab: lab.length ? lab : undefined })}
        />
      </FilterSection>

      <FilterSection title="Quality" defaultOpen={false}>
        <div className="space-y-3">
          <ToggleFilter
            label="Eye Clean"
            checked={pendingFilters.eye_clean}
            onChange={(v) => update({ eye_clean: v })}
          />
          <ToggleFilter
            label="No BGM"
            checked={pendingFilters.no_bgm}
            onChange={(v) => update({ no_bgm: v })}
          />
        </div>
      </FilterSection>

      <FilterSection title="Advanced" defaultOpen={false}>
        <div className="space-y-5">
          <RangeSlider
            label="Table %"
            min={50}
            max={80}
            step={0.5}
            value={[pendingFilters.table_min, pendingFilters.table_max]}
            onChange={([min, max]) => update({ table_min: min, table_max: max })}
            formatValue={(v) => `${v}%`}
          />
          <RangeSlider
            label="Depth %"
            min={55}
            max={75}
            step={0.5}
            value={[pendingFilters.depth_pct_min, pendingFilters.depth_pct_max]}
            onChange={([min, max]) => update({ depth_pct_min: min, depth_pct_max: max })}
            formatValue={(v) => `${v}%`}
          />
          <RangeSlider
            label="L/W Ratio"
            min={0.8}
            max={2.5}
            step={0.05}
            value={[pendingFilters.ratio_min, pendingFilters.ratio_max]}
            onChange={([min, max]) => update({ ratio_min: min, ratio_max: max })}
            formatValue={(v) => v.toFixed(2)}
          />
        </div>
      </FilterSection>
    </div>
  );

  const applyFooter = (
    <div className="flex-shrink-0 px-5 py-4 border-t border-border bg-white">
      <button
        onClick={handleApply}
        className={`w-full py-2.5 text-sm font-medium transition-colors ${
          hasPendingChanges
            ? 'bg-charcoal text-white hover:bg-warm-gray-600'
            : 'bg-border text-warm-gray-500 cursor-default'
        }`}
      >
        {hasPendingChanges ? 'Apply Filters' : 'Filters Applied'}
      </button>
      <button
        onClick={handleReset}
        className="mt-2 flex items-center gap-2 text-xs text-warm-gray-500 hover:text-sold transition-colors mx-auto"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Reset All Filters
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-72 flex-shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-border bg-white">
        <div className="flex-shrink-0 px-5 py-4 border-b border-border">
          <h2 className="font-serif text-lg font-semibold text-charcoal">Filters</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-1">
          {filterContent}
        </div>
        {applyFooter}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-white shadow-card-hover flex flex-col animate-fade-in">
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-serif text-lg font-semibold text-charcoal">Filters</h2>
              <button onClick={onClose} className="text-warm-gray-400 hover:text-charcoal">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-1">
              {filterContent}
            </div>
            {applyFooter}
          </div>
        </div>
      )}
    </>
  );
}

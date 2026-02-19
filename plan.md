# Plan: Fancy Color Filters — Storefront, API, and Data Normalization

## Summary

Change the stone type filter from `[All, Natural, Lab, Fancy]` to `[All, Natural, Natural Fancy, Lab, Lab Fancy]`. When a fancy type is selected, hide the regular D-M color selector and show fancy color + fancy intensity chip selectors instead. Fix data normalization in the Nivoda mapper so fancy_color and fancy_intensity values are clean and consistent. Fix an existing DB query bug with the fancy_color boolean filter.

---

## Part 1: Nivoda Mapper — Normalize `fancy_color` and `fancy_intensity`

**File:** `packages/nivoda/src/mapper.ts`

The demo feed does NOT produce any fancy color data (confirmed — `mapDemoItemToDiamond` never sets `fancyColor`). All messy data comes from Nivoda's `f_color` and `f_intensity` fields passed through without normalization.

### 1a. Add `normalizeFancyColor(raw: string | undefined): string | undefined`

Logic:
1. Return `undefined` for null, empty string, or invalid values (`"Even"`, `"U-V"`)
2. Trim and normalize synonyms: `GREY` → `Gray`
3. Normalize compound colors with space delimiters to hyphenated Title Case:
   - `"GREEN YELLOW"` → `"Green-Yellow"`
   - `"ORANGE YELLOW"` → `"Orange-Yellow"`
   - `"YELLOW GREEN"` → `"Yellow-Green"`
   - `"YELLOW ORANGE"` → `"Yellow-Orange"`
4. Normalize adjective forms (keep space, Title Case):
   - `"ORANGY BROWN"` → `"Orangy Brown"`
   - `"ORANGY YELLOW"` → `"Orangy Yellow"`
5. Title Case all remaining values: `"BLUE"` → `"Blue"`, `"yellow"` → `"Yellow"`, `"BROWN-PINK"` → `"Brown-Pink"`

Expected normalized set of fancy colors:
`Black, Blue, Brown, Brown-Orange, Brown-Pink, Brown-Yellow, Chameleon, Cognac, Gray, Gray-Blue, Green, Green-Yellow, Orange, Orange-Brown, Orange-Yellow, Orangy Brown, Orangy Yellow, Pink, Pink-Brown, Pink-Purple, Purple, Purple-Pink, White, Yellow, Yellow-Brown, Yellow-Green, Yellow-Orange`

### 1b. Add `normalizeFancyIntensity(raw: string | undefined): string | undefined`

Same pattern — Title Case, trim, normalize known abbreviations. Standard GIA fancy intensities:
`Faint, Very Light, Light, Fancy Light, Fancy, Fancy Intense, Fancy Vivid, Fancy Deep, Fancy Dark`

### 1c. Apply normalizers in `mapNivodaItemToDiamond()`

Change lines 99-101:
```typescript
fancyColor: normalizeFancyColor(certificate.f_color) ?? undefined,
fancyIntensity: normalizeFancyIntensity(certificate.f_intensity) ?? undefined,
fancyOvertone: normalizeFancyColor(certificate.f_overtone) ?? undefined,  // reuse same normalizer
```

**Note:** Existing data in the DB won't be retroactively fixed. It will be cleaned on next consolidation run. This is acceptable.

---

## Part 2: Fix Database Query Bug — `fancyColor` Boolean Filter

**File:** `packages/database/src/queries/diamonds.ts` (lines 190-193)

**Current (broken):**
```typescript
if (params.fancyColor !== undefined) {
  conditions.push(`fancy_color != $${paramIndex++}`);
  values.push(params.fancyColor);  // pushes boolean true/false
}
```
This compares a TEXT column against a boolean value using `!=`, which is nonsensical.

**Fixed:**
```typescript
if (params.fancyColor === true) {
  conditions.push(`fancy_color IS NOT NULL AND fancy_color != ''`);
} else if (params.fancyColor === false) {
  conditions.push(`(fancy_color IS NULL OR fancy_color = '')`);
}
```
No parameterized value needed — these are static SQL conditions.

---

## Part 3: Wire Up `fancy_colors` Array Filter in API

The backend DB query already supports `fancyColors` as a string array (line 185-188 of `diamonds.ts`). But the API route and validator don't expose it. We need to wire it up.

### 3a. Validator

**File:** `packages/api/src/validators/diamonds.ts`

Add to schema:
```typescript
fancy_colors: z.union([z.string(), z.array(z.string())]).optional(),
```

### 3b. API Route

**File:** `packages/api/src/routes/diamonds.ts`

Add to payload mapping (around line 396):
```typescript
fancyColors: toArray(query.fancy_colors),
```

But `toArray` currently runs `longDiamondFilterToShort()` which maps "Excellent" → "EX" etc. Fancy color values should NOT go through that conversion. Need to use a version that doesn't apply the short mapping — likely just `toStringArray()` or add a `toRawArray()`.

Check if `toStringArray` already exists (it does — used for `availability`). Use that instead of `toArray` for fancy colors since they shouldn't be case-converted.

Actually, looking at the code: `toArray()` calls `longDiamondFilterToShort` which only maps known cut/polish/symmetry terms. It wouldn't corrupt "Blue" → something else. But to be safe, use a simple split without the mapping. We can use `toStringArray` which just splits without conversion.

---

## Part 4: Storefront Types

**File:** `apps/storefront/src/types/diamond.ts`

### 4a. Update `StoneType`

```typescript
// Before:
export type StoneType = 'all' | 'natural' | 'lab' | 'fancy';

// After:
export type StoneType = 'all' | 'natural' | 'natural_fancy' | 'lab' | 'lab_fancy';
```

### 4b. Add `fancy_colors` to `DiamondSearchParams`

```typescript
fancy_colors?: string[];  // specific fancy color values to filter by
```

---

## Part 5: Storefront Hook — `useDiamondSearch`

**File:** `apps/storefront/src/hooks/useDiamondSearch.ts`

### 5a. Add `fancy_colors` to `ARRAY_PARAMS`

```typescript
const ARRAY_PARAMS = [
  'shape', 'color', 'clarity', 'cut', 'polish', 'symmetry',
  'fluorescence_intensity', 'lab', 'fancy_intensity', 'fancy_colors',
] as const;
```

### 5b. Update `getStoneTypeFromURL`

```typescript
function getStoneTypeFromURL(params: URLSearchParams): StoneType {
  const val = params.get('stone_type');
  if (val === 'natural' || val === 'lab' || val === 'natural_fancy' || val === 'lab_fancy') return val;
  return 'all';
}
```

### 5c. Update `apiParams` logic

```typescript
if (stoneType === 'natural') {
  params.lab_grown = false;
  delete params.fancy_color;
  delete params.fancy_intensity;
  delete params.fancy_colors;
} else if (stoneType === 'natural_fancy') {
  params.lab_grown = false;
  params.fancy_color = true;
  delete params.color;  // ignore D-M color selections for fancy
} else if (stoneType === 'lab') {
  params.lab_grown = true;
  delete params.fancy_color;
  delete params.fancy_intensity;
  delete params.fancy_colors;
} else if (stoneType === 'lab_fancy') {
  params.lab_grown = true;
  params.fancy_color = true;
  delete params.color;  // ignore D-M color selections for fancy
} else {
  // 'all'
  delete params.lab_grown;
}
```

---

## Part 6: Storefront API Client

**File:** `apps/storefront/src/api/diamonds.ts`

Add serialization for `fancy_colors`:
```typescript
if (params.fancy_colors?.length) query.fancy_colors = params.fancy_colors.join(',');
```

---

## Part 7: Storefront UI — StoneTypeFilter

**File:** `apps/storefront/src/components/filters/StoneTypeFilter.tsx`

Update options:
```typescript
const options: { value: StoneType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'natural', label: 'Natural' },
  { value: 'natural_fancy', label: 'Natural Fancy' },
  { value: 'lab', label: 'Lab Grown' },
  { value: 'lab_fancy', label: 'Lab Fancy' },
];
```

Layout will need adjustment for 5 buttons — likely wrap to 2 rows or use smaller text. Current layout uses `flex-1` on each button, 5 buttons may be tight. Consider a 3+2 grid or reduce font/padding.

---

## Part 8: Storefront UI — FilterPanel

**File:** `apps/storefront/src/components/filters/FilterPanel.tsx`

### 8a. Add constants

```typescript
const FANCY_COLORS = [
  'Black', 'Blue', 'Brown', 'Chameleon', 'Cognac', 'Gray',
  'Green', 'Orange', 'Pink', 'Purple', 'White', 'Yellow',
  // Compound colors
  'Brown-Orange', 'Brown-Pink', 'Brown-Yellow', 'Gray-Blue',
  'Green-Yellow', 'Orange-Brown', 'Orange-Yellow',
  'Pink-Brown', 'Pink-Purple', 'Purple-Pink',
  'Yellow-Brown', 'Yellow-Green', 'Yellow-Orange',
];

const FANCY_INTENSITIES = [
  'Faint', 'Very Light', 'Light', 'Fancy Light', 'Fancy',
  'Fancy Intense', 'Fancy Vivid', 'Fancy Deep', 'Fancy Dark',
];
```

### 8b. Conditional filter display

Derive a boolean:
```typescript
const isFancy = stoneType === 'natural_fancy' || stoneType === 'lab_fancy';
```

- When `isFancy` is **true**: Hide the Color (D-M) `ChipSelect`, show Fancy Color and Fancy Intensity `ChipSelect` components instead
- When `isFancy` is **false**: Show the normal Color (D-M) `ChipSelect`, hide fancy selectors

```tsx
{isFancy ? (
  <>
    <ChipSelect
      label="Fancy Color"
      options={FANCY_COLORS}
      selected={filters.fancy_colors || []}
      onChange={(fc) => update({ fancy_colors: fc.length ? fc : undefined })}
    />
    <ChipSelect
      label="Fancy Intensity"
      options={FANCY_INTENSITIES}
      selected={filters.fancy_intensity || []}
      onChange={(fi) => update({ fancy_intensity: fi.length ? fi : undefined })}
    />
  </>
) : (
  <ChipSelect
    label="Color"
    options={COLORS}
    selected={filters.color || []}
    onChange={(color) => update({ color: color.length ? color : undefined })}
  />
)}
```

---

## Part 9: Cleanup — `setStoneType` should clear conflicting filters

**File:** `apps/storefront/src/hooks/useDiamondSearch.ts`

When switching stone type, clear filters that belong to the other mode to prevent stale URL params:

```typescript
const setStoneType = useCallback(
  (type: StoneType) => {
    const newFilters = { ...filters };
    const isFancy = type === 'natural_fancy' || type === 'lab_fancy';
    if (isFancy) {
      delete newFilters.color;  // clear D-M colors
    } else {
      delete newFilters.fancy_colors;     // clear fancy color selections
      delete newFilters.fancy_intensity;  // clear fancy intensity selections
    }
    const urlParams = filtersToURLParams(newFilters);
    if (type !== 'all') urlParams.stone_type = type;
    setSearchParams(urlParams, { replace: true });
  },
  [setSearchParams, filters]
);
```

---

## Files Changed (summary)

| File | Change |
|------|--------|
| `packages/nivoda/src/mapper.ts` | Add `normalizeFancyColor()`, `normalizeFancyIntensity()`, apply to mapping |
| `packages/database/src/queries/diamonds.ts` | Fix `fancyColor` boolean filter (IS NOT NULL instead of != boolean) |
| `packages/api/src/validators/diamonds.ts` | Add `fancy_colors` param |
| `packages/api/src/routes/diamonds.ts` | Wire `fancy_colors` → `fancyColors` in payload |
| `apps/storefront/src/types/diamond.ts` | Update `StoneType`, add `fancy_colors` to search params |
| `apps/storefront/src/hooks/useDiamondSearch.ts` | Update stone type logic, add fancy_colors, clear conflicting filters |
| `apps/storefront/src/api/diamonds.ts` | Serialize `fancy_colors` |
| `apps/storefront/src/components/filters/StoneTypeFilter.tsx` | 5 options layout |
| `apps/storefront/src/components/filters/FilterPanel.tsx` | Fancy color/intensity chips, conditional display |

---

## Out of scope

- Retroactive DB cleanup of existing fancy_color values (will be fixed on next consolidation)
- Dashboard changes (dashboard uses different filter system)
- Adding fancy colors to demo feed seed data

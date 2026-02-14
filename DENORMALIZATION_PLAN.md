# JSONB Denormalization Implementation Plan

## Executive Summary

**Goal**: Extract frequently-queried fields from `measurements` and `attributes` JSONB columns into proper database columns for 90-95% query performance improvement.

**Scope**: 11 files across database, API, consolidation, and frontend layers.

**Population Stats**:
- Measurements fields: **100% populated** (455,481/455,481 diamonds)
- Attributes fields: **60-88% populated** (eyeClean: 76.6%, brown: 71.3%, green: 60.6%, milky: 87.9%)

---

## Phase 1: Database Schema Migration

### 1.1 Add New Columns

**File**: `sql/migrations/002_denormalize_measurements_attributes.sql`

```sql
-- Measurement columns (100% populated)
ALTER TABLE diamonds
  ADD COLUMN IF NOT EXISTS table_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS depth_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS length_mm numeric(6,2),
  ADD COLUMN IF NOT EXISTS width_mm numeric(6,2),
  ADD COLUMN IF NOT EXISTS depth_mm numeric(6,2),
  ADD COLUMN IF NOT EXISTS crown_angle numeric(5,2),
  ADD COLUMN IF NOT EXISTS crown_height numeric(5,2),
  ADD COLUMN IF NOT EXISTS pavilion_angle numeric(5,2),
  ADD COLUMN IF NOT EXISTS pavilion_depth numeric(5,2);

-- Attribute columns (60-88% populated)
ALTER TABLE diamonds
  ADD COLUMN IF NOT EXISTS eye_clean boolean,
  ADD COLUMN IF NOT EXISTS brown text,
  ADD COLUMN IF NOT EXISTS green text,
  ADD COLUMN IF NOT EXISTS milky text;
```

### 1.2 Backfill Existing Data

```sql
-- Backfill from JSONB (can run in batches if needed)
UPDATE diamonds
SET
  -- Measurements
  table_pct = (measurements->>'table')::numeric,
  depth_pct = (measurements->>'depthPercentage')::numeric,
  length_mm = (measurements->>'length')::numeric,
  width_mm = (measurements->>'width')::numeric,
  depth_mm = (measurements->>'depth')::numeric,
  crown_angle = (measurements->>'crownAngle')::numeric,
  crown_height = (measurements->>'crownHeight')::numeric,
  pavilion_angle = (measurements->>'pavAngle')::numeric,
  pavilion_depth = (measurements->>'pavDepth')::numeric,
  -- Attributes
  eye_clean = (attributes->>'eyeClean')::boolean,
  brown = attributes->>'brown',
  green = attributes->>'green',
  milky = attributes->>'milky'
WHERE measurements IS NOT NULL OR attributes IS NOT NULL;
```

### 1.3 Create Indexes

```sql
-- Filtered columns (used in WHERE clauses)
CREATE INDEX idx_diamonds_table_pct ON diamonds (table_pct)
  WHERE status = 'active' AND table_pct IS NOT NULL;

CREATE INDEX idx_diamonds_depth_pct ON diamonds (depth_pct)
  WHERE status = 'active' AND depth_pct IS NOT NULL;

CREATE INDEX idx_diamonds_eye_clean ON diamonds (eye_clean)
  WHERE status = 'active' AND eye_clean = true;

CREATE INDEX idx_diamonds_no_bgm ON diamonds (brown, green, milky)
  WHERE status = 'active';

-- Composite for advanced filters
CREATE INDEX idx_diamonds_measurements_composite ON diamonds (table_pct, depth_pct, crown_angle, pavilion_angle)
  WHERE status = 'active';
```

### 1.4 Cleanup (Optional - Keep JSONB for now)

```sql
-- After validating everything works, optionally drop GIN indexes
-- DROP INDEX IF EXISTS idx_diamonds_measurements_gin;
-- DROP INDEX IF EXISTS idx_diamonds_attributes_gin;

-- Keep measurements and attributes JSONB for other fields
-- (girdle, culet, comments, etc.)
```

**Files Changed**:
- ✅ `sql/migrations/002_denormalize_measurements_attributes.sql` (NEW)

---

## Phase 2: Type Definitions

### 2.1 Update Shared Types

**File**: `packages/shared/src/types/diamond.ts`

**Lines 24-41** (DiamondMeasurements interface):
- Keep interface for JSONB mapping (consolidation still needs it)
- No changes needed

**Lines 95-96** (Diamond interface):
```typescript
export interface Diamond {
  id: string;
  // ... existing fields ...

  // NEW: Denormalized measurement columns
  tablePct?: number;
  depthPct?: number;
  lengthMm?: number;
  widthMm?: number;
  depthMm?: number;
  crownAngle?: number;
  crownHeight?: number;
  pavilionAngle?: number;
  pavilionDepth?: number;

  // NEW: Denormalized attribute columns
  eyeClean?: boolean;
  brown?: string;
  green?: string;
  milky?: string;

  // Keep JSONB for other fields
  measurements?: DiamondMeasurements;
  attributes?: DiamondAttributes;
}
```

**Files Changed**:
- ✅ `packages/shared/src/types/diamond.ts` (MODIFY lines 95-96)

---

## Phase 3: Database Layer

### 3.1 Update DiamondRow Interface

**File**: `packages/database/src/queries/diamonds.ts`

**Lines 4-47** (DiamondRow interface):
```typescript
interface DiamondRow {
  id: string;
  // ... existing fields ...

  // NEW: Denormalized columns
  table_pct: string | null;
  depth_pct: string | null;
  length_mm: string | null;
  width_mm: string | null;
  depth_mm: string | null;
  crown_angle: string | null;
  crown_height: string | null;
  pavilion_angle: string | null;
  pavilion_depth: string | null;
  eye_clean: boolean | null;
  brown: string | null;
  green: string | null;
  milky: string | null;

  // Keep JSONB
  measurements: Record<string, unknown> | null;
  attributes: Record<string, unknown> | null;
}
```

### 3.2 Update mapRowToDiamond

**Lines 109-154** (mapRowToDiamond function):
```typescript
function mapRowToDiamond(row: DiamondRow): Diamond {
  return {
    id: row.id,
    // ... existing fields ...

    // NEW: Map denormalized columns
    tablePct: row.table_pct ? parseFloat(row.table_pct) : undefined,
    depthPct: row.depth_pct ? parseFloat(row.depth_pct) : undefined,
    lengthMm: row.length_mm ? parseFloat(row.length_mm) : undefined,
    widthMm: row.width_mm ? parseFloat(row.width_mm) : undefined,
    depthMm: row.depth_mm ? parseFloat(row.depth_mm) : undefined,
    crownAngle: row.crown_angle ? parseFloat(row.crown_angle) : undefined,
    crownHeight: row.crown_height ? parseFloat(row.crown_height) : undefined,
    pavilionAngle: row.pavilion_angle ? parseFloat(row.pavilion_angle) : undefined,
    pavilionDepth: row.pavilion_depth ? parseFloat(row.pavilion_depth) : undefined,
    eyeClean: row.eye_clean ?? undefined,
    brown: row.brown ?? undefined,
    green: row.green ?? undefined,
    milky: row.milky ?? undefined,

    // Keep JSONB (still normalized, for other fields)
    measurements: normalizeMeasurements(row.measurements),
    attributes: normalizeAttributes(row.attributes),
  };
}
```

### 3.3 Update searchDiamonds Queries

**Lines 248-329** (JSONB queries → column queries):

**BEFORE**:
```typescript
if (params.tableMin !== undefined) {
  conditions.push(`(measurements->>'table')::numeric >= $${paramIndex++}`);
  values.push(params.tableMin);
}
```

**AFTER**:
```typescript
if (params.tableMin !== undefined) {
  conditions.push(`table_pct >= $${paramIndex++}`);
  values.push(params.tableMin);
}
```

**Full replacements**:
```typescript
// Lines 248-256: table → table_pct
if (params.tableMin !== undefined) {
  conditions.push(`table_pct >= $${paramIndex++}`);
  values.push(params.tableMin);
}
if (params.tableMax !== undefined) {
  conditions.push(`table_pct <= $${paramIndex++}`);
  values.push(params.tableMax);
}

// Lines 258-266: depthPercentage → depth_pct
if (params.depthPercentageMin !== undefined) {
  conditions.push(`depth_pct >= $${paramIndex++}`);
  values.push(params.depthPercentageMin);
}
if (params.depthPercentageMax !== undefined) {
  conditions.push(`depth_pct <= $${paramIndex++}`);
  values.push(params.depthPercentageMax);
}

// Lines 268-276: crownAngle → crown_angle
if (params.crownAngleMin !== undefined) {
  conditions.push(`crown_angle >= $${paramIndex++}`);
  values.push(params.crownAngleMin);
}
if (params.crownAngleMax !== undefined) {
  conditions.push(`crown_angle <= $${paramIndex++}`);
  values.push(params.crownAngleMax);
}

// Lines 278-286: pavAngle → pavilion_angle
if (params.pavAngleMin !== undefined) {
  conditions.push(`pavilion_angle >= $${paramIndex++}`);
  values.push(params.pavAngleMin);
}
if (params.pavAngleMax !== undefined) {
  conditions.push(`pavilion_angle <= $${paramIndex++}`);
  values.push(params.pavAngleMax);
}

// Lines 288-316: length/width/depth → length_mm/width_mm/depth_mm
if (params.lengthMin !== undefined) {
  conditions.push(`length_mm >= $${paramIndex++}`);
  values.push(params.lengthMin);
}
if (params.lengthMax !== undefined) {
  conditions.push(`length_mm <= $${paramIndex++}`);
  values.push(params.lengthMax);
}
if (params.widthMin !== undefined) {
  conditions.push(`width_mm >= $${paramIndex++}`);
  values.push(params.widthMin);
}
if (params.widthMax !== undefined) {
  conditions.push(`width_mm <= $${paramIndex++}`);
  values.push(params.widthMax);
}
if (params.depthMeasurementMin !== undefined) {
  conditions.push(`depth_mm >= $${paramIndex++}`);
  values.push(params.depthMeasurementMin);
}
if (params.depthMeasurementMax !== undefined) {
  conditions.push(`depth_mm <= $${paramIndex++}`);
  values.push(params.depthMeasurementMax);
}

// Lines 318-321: eyeClean → eye_clean
if (params.eyeClean !== undefined) {
  conditions.push(`eye_clean = $${paramIndex++}`);
  values.push(params.eyeClean);
}

// Lines 323-329: noBgm → brown/green/milky
if (params.noBgm === true) {
  conditions.push(`(
    (brown IS NULL OR UPPER(brown) IN ('NONE', 'N/A', ''))
    AND (green IS NULL OR UPPER(green) IN ('NONE', 'N/A', ''))
    AND (milky IS NULL OR UPPER(milky) IN ('NONE', 'N/A', ''))
  )`);
}
```

### 3.4 Update upsertDiamond

**Lines 389-491** (upsertDiamond function):

Add new columns to INSERT/UPDATE:
```sql
INSERT INTO diamonds (
  -- ... existing columns ...
  table_pct, depth_pct, length_mm, width_mm, depth_mm,
  crown_angle, crown_height, pavilion_angle, pavilion_depth,
  eye_clean, brown, green, milky,
  measurements, attributes
) VALUES (
  -- ... existing values ...
  $39, $40, $41, $42, $43, $44, $45, $46, $47,  -- measurements
  $48, $49, $50, $51,                            -- attributes
  $52, $53                                        -- JSONB
)
ON CONFLICT (feed, supplier_stone_id) DO UPDATE SET
  -- ... existing updates ...
  table_pct = EXCLUDED.table_pct,
  depth_pct = EXCLUDED.depth_pct,
  -- ... etc
```

Update values array:
```typescript
[
  // ... existing values ...
  diamond.tablePct,
  diamond.depthPct,
  diamond.lengthMm,
  diamond.widthMm,
  diamond.depthMm,
  diamond.crownAngle,
  diamond.crownHeight,
  diamond.pavilionAngle,
  diamond.pavilionDepth,
  diamond.eyeClean,
  diamond.brown,
  diamond.green,
  diamond.milky,
  diamond.measurements ? JSON.stringify(diamond.measurements) : null,
  diamond.attributes ? JSON.stringify(diamond.attributes) : null,
]
```

### 3.5 Update upsertDiamondsBatch

**Lines 495-662** (upsertDiamondsBatch function):

Add new column arrays:
```typescript
const tablePcts: (number | null)[] = [];
const depthPcts: (number | null)[] = [];
const lengthMms: (number | null)[] = [];
const widthMms: (number | null)[] = [];
const depthMms: (number | null)[] = [];
const crownAngles: (number | null)[] = [];
const crownHeights: (number | null)[] = [];
const pavilionAngles: (number | null)[] = [];
const pavilionDepths: (number | null)[] = [];
const eyeCleans: (boolean | null)[] = [];
const browns: (string | null)[] = [];
const greens: (string | null)[] = [];
const milkys: (string | null)[] = [];

for (const d of diamonds) {
  // ... existing pushes ...
  tablePcts.push(d.tablePct ?? null);
  depthPcts.push(d.depthPct ?? null);
  lengthMms.push(d.lengthMm ?? null);
  widthMms.push(d.widthMm ?? null);
  depthMms.push(d.depthMm ?? null);
  crownAngles.push(d.crownAngle ?? null);
  crownHeights.push(d.crownHeight ?? null);
  pavilionAngles.push(d.pavilionAngle ?? null);
  pavilionDepths.push(d.pavilionDepth ?? null);
  eyeCleans.push(d.eyeClean ?? null);
  browns.push(d.brown ?? null);
  greens.push(d.green ?? null);
  milkys.push(d.milky ?? null);
}
```

Update UNNEST query to include new columns.

**Files Changed**:
- ✅ `packages/database/src/queries/diamonds.ts` (MODIFY lines 4-47, 109-154, 248-329, 389-662)

---

## Phase 4: Consolidation Layer

### 4.1 Update Nivoda Mapper

**File**: `packages/nivoda/src/mapper.ts`

**Lines 163-259** (mapNivodaItemToDiamond function):

Add extraction of denormalized fields:
```typescript
export function mapNivodaItemToDiamond(
  item: NivodaSearchItem,
  feed: string = 'nivoda'
): Omit<Diamond, 'id' | 'createdAt' | 'updatedAt'> {
  const { diamond, certificate } = item;

  // Extract measurements and attributes as before
  const measurements = mapMeasurements(certificate);
  const attributes = mapAttributes(diamond);

  return {
    // ... existing fields ...

    // NEW: Extract top-level denormalized fields
    tablePct: measurements?.table,
    depthPct: measurements?.depthPercentage,
    lengthMm: measurements?.length,
    widthMm: measurements?.width,
    depthMm: measurements?.depth,
    crownAngle: measurements?.crownAngle,
    crownHeight: measurements?.crownHeight,
    pavilionAngle: measurements?.pavAngle,
    pavilionDepth: measurements?.pavDepth,
    eyeClean: attributes?.eyeClean,
    brown: attributes?.brown,
    green: attributes?.green,
    milky: attributes?.milky,

    // Keep full JSONB for other fields
    measurements,
    attributes,
  };
}
```

**Files Changed**:
- ✅ `packages/nivoda/src/mapper.ts` (MODIFY lines 163-259)

### 4.2 Update Demo Feed Mapper (if exists)

**File**: `packages/demo-feed/src/mapper.ts` (similar changes as Nivoda)

---

## Phase 5: Frontend Layer

### 5.1 Update Storefront Diamond Specs

**File**: `apps/storefront/src/components/diamonds/DiamondSpecs.tsx`

**Lines 20, 57-75** (Measurements display):

**BEFORE**:
```typescript
const m = diamond.measurements;
// ...
{m?.table != null && (
  <SpecRow label="Table" value={formatNumber(m.table, 1) + '%'} />
)}
```

**AFTER**:
```typescript
// Use denormalized columns first, fallback to JSONB
const tablePct = diamond.tablePct ?? diamond.measurements?.table;
const depthPct = diamond.depthPct ?? diamond.measurements?.depthPercentage;
const lengthMm = diamond.lengthMm ?? diamond.measurements?.length;
const widthMm = diamond.widthMm ?? diamond.measurements?.width;
const depthMm = diamond.depthMm ?? diamond.measurements?.depth;
const crownAngle = diamond.crownAngle ?? diamond.measurements?.crownAngle;
const pavilionAngle = diamond.pavilionAngle ?? diamond.measurements?.pavAngle;

// Display
{tablePct != null && (
  <SpecRow label="Table" value={formatNumber(tablePct, 1) + '%'} />
)}
{depthPct != null && (
  <SpecRow label="Depth" value={formatNumber(depthPct, 1) + '%'} />
)}
{lengthMm != null && widthMm != null && depthMm != null && (
  <SpecRow
    label="Dimensions"
    value={`${formatNumber(lengthMm, 2)} × ${formatNumber(widthMm, 2)} × ${formatNumber(depthMm, 2)} mm`}
  />
)}
```

**Lines 102-115** (Attributes display):

**BEFORE**:
```typescript
{diamond.attributes?.eyeClean != null && (
  <SpecRow label="Eye Clean" value={diamond.attributes.eyeClean ? 'Yes' : 'No'} />
)}
```

**AFTER**:
```typescript
{diamond.eyeClean != null && (
  <SpecRow label="Eye Clean" value={diamond.eyeClean ? 'Yes' : 'No'} />
)}
{diamond.brown && (
  <SpecRow label="Brown Tint" value={diamond.brown} />
)}
{diamond.green && (
  <SpecRow label="Green Tint" value={diamond.green} />
)}
{diamond.milky && (
  <SpecRow label="Milky" value={diamond.milky} />
)}
```

**Files Changed**:
- ✅ `apps/storefront/src/components/diamonds/DiamondSpecs.tsx` (MODIFY lines 20, 57-115)

### 5.2 Update Storefront Types

**File**: `apps/storefront/src/types/diamond.ts`

**Lines 70-71** (Diamond interface):
Add same fields as shared types:
```typescript
export interface Diamond {
  // ... existing ...

  // NEW: Denormalized fields
  tablePct?: number;
  depthPct?: number;
  lengthMm?: number;
  widthMm?: number;
  depthMm?: number;
  crownAngle?: number;
  pavilionAngle?: number;
  eyeClean?: boolean;
  brown?: string;
  green?: string;
  milky?: string;

  // Keep JSONB
  measurements?: DiamondMeasurements;
  attributes?: DiamondAttributes;
}
```

**Files Changed**:
- ✅ `apps/storefront/src/types/diamond.ts` (MODIFY lines 70-71)

### 5.3 Update Dashboard (if it displays these fields)

Check `apps/dashboard/src/` for any components displaying measurements/attributes.
- Based on exploration, dashboard mainly uses API data without custom rendering
- Should automatically work once API returns new fields

---

## Phase 6: Testing

### 6.1 Database Tests

**File**: `packages/database/__tests__/diamonds.integration.test.ts`

**Lines 60-61, 170-171** (Test fixtures):

Update test diamond objects to include denormalized fields:
```typescript
const testDiamond = {
  // ... existing fields ...
  tablePct: 57.5,
  depthPct: 61.2,
  lengthMm: 6.42,
  widthMm: 6.38,
  depthMm: 3.92,
  crownAngle: 34.5,
  pavilionAngle: 40.8,
  eyeClean: true,
  brown: 'None',
  green: 'None',
  milky: 'None',
  measurements: { /* full JSONB */ },
  attributes: { /* full JSONB */ },
};
```

Add test cases:
```typescript
it('should filter by table_pct range', async () => {
  const result = await searchDiamonds({
    tableMin: 55,
    tableMax: 60,
  });
  expect(result.data.every(d => d.tablePct >= 55 && d.tablePct <= 60)).toBe(true);
});

it('should filter by eye_clean', async () => {
  const result = await searchDiamonds({ eyeClean: true });
  expect(result.data.every(d => d.eyeClean === true)).toBe(true);
});

it('should filter by no_bgm', async () => {
  const result = await searchDiamonds({ noBgm: true });
  expect(result.data.every(d => {
    const noBrown = !d.brown || ['NONE', 'N/A', ''].includes(d.brown.toUpperCase());
    const noGreen = !d.green || ['NONE', 'N/A', ''].includes(d.green.toUpperCase());
    const noMilky = !d.milky || ['NONE', 'N/A', ''].includes(d.milky.toUpperCase());
    return noBrown && noGreen && noMilky;
  })).toBe(true);
});
```

### 6.2 API Tests

**File**: `packages/api/__tests__/routes.integration.test.ts`

Update test fixtures (lines 124-125, 249-250, etc.) and add query tests:
```typescript
it('GET /api/v2/diamonds?table_min=55&table_max=60', async () => {
  const response = await request(app)
    .get('/api/v2/diamonds?table_min=55&table_max=60')
    .set('X-API-Key', testApiKey);

  expect(response.status).toBe(200);
  expect(response.body.data.every(d => d.tablePct >= 55 && d.tablePct <= 60)).toBe(true);
});
```

### 6.3 Performance Tests

Create new test file: `packages/database/__tests__/diamonds.performance.test.ts`

```typescript
describe('Diamond Search Performance', () => {
  it('should query by table_pct faster than JSONB', async () => {
    const start = Date.now();
    await searchDiamonds({ tableMin: 55, tableMax: 60 });
    const columnQueryTime = Date.now() - start;

    // Should be under 10ms with proper indexes
    expect(columnQueryTime).toBeLessThan(10);
  });

  it('should query by eye_clean faster than JSONB', async () => {
    const start = Date.now();
    await searchDiamonds({ eyeClean: true });
    const columnQueryTime = Date.now() - start;

    expect(columnQueryTime).toBeLessThan(10);
  });
});
```

**Files Changed**:
- ✅ `packages/database/__tests__/diamonds.integration.test.ts` (MODIFY lines 60-61, 170-171, ADD new tests)
- ✅ `packages/api/__tests__/routes.integration.test.ts` (ADD new query tests)
- ✅ `packages/database/__tests__/diamonds.performance.test.ts` (NEW)

---

## Phase 7: Validation & Rollout

### 7.1 Pre-Deployment Checklist

```bash
# 1. Run migration
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f sql/migrations/002_denormalize_measurements_attributes.sql

# 2. Verify backfill
SELECT
  COUNT(*) as total,
  COUNT(table_pct) as has_table_pct,
  COUNT(depth_pct) as has_depth_pct,
  COUNT(eye_clean) as has_eye_clean
FROM diamonds
WHERE status = 'active';

# 3. Build all packages
npm run build

# 4. Run tests
npm run test

# 5. Type check
npm run typecheck

# 6. Run consolidation test
npm run dev:consolidator  # Process a small batch

# 7. Query performance test
EXPLAIN ANALYZE
SELECT * FROM diamonds
WHERE status = 'active'
  AND table_pct BETWEEN 55 AND 60
  AND eye_clean = true
LIMIT 50;
```

### 7.2 Rollback Plan (if needed)

```sql
-- Drop new indexes
DROP INDEX IF EXISTS idx_diamonds_table_pct;
DROP INDEX IF EXISTS idx_diamonds_depth_pct;
DROP INDEX IF EXISTS idx_diamonds_eye_clean;
DROP INDEX IF EXISTS idx_diamonds_no_bgm;
DROP INDEX IF EXISTS idx_diamonds_measurements_composite;

-- Drop new columns (only if necessary)
ALTER TABLE diamonds
  DROP COLUMN IF EXISTS table_pct,
  DROP COLUMN IF EXISTS depth_pct,
  DROP COLUMN IF EXISTS length_mm,
  DROP COLUMN IF EXISTS width_mm,
  DROP COLUMN IF EXISTS depth_mm,
  DROP COLUMN IF EXISTS crown_angle,
  DROP COLUMN IF EXISTS crown_height,
  DROP COLUMN IF EXISTS pavilion_angle,
  DROP COLUMN IF EXISTS pavilion_depth,
  DROP COLUMN IF EXISTS eye_clean,
  DROP COLUMN IF EXISTS brown,
  DROP COLUMN IF EXISTS green,
  DROP COLUMN IF EXISTS milky;

-- Revert code changes via git
git revert <commit-hash>
```

---

## Summary of Changes

| Component | Files | Lines Changed | Priority |
|-----------|-------|---------------|----------|
| **Database Schema** | 1 new migration | ~100 | 🔥 Critical |
| **Type Definitions** | 2 files | ~30 | 🔥 Critical |
| **Database Queries** | 1 file | ~200 | 🔥 Critical |
| **Consolidation** | 1-2 files | ~50 | 🔥 Critical |
| **Frontend** | 2 files | ~50 | ⚠️ High |
| **Tests** | 3 files | ~100 | ⚠️ High |
| **TOTAL** | **11 files** | **~530 lines** | |

---

## Expected Performance Improvements

| Query Type | Before (JSONB) | After (Columns) | Improvement |
|------------|----------------|-----------------|-------------|
| Table % filter | 50-100ms | 1-5ms | **90-95%** |
| Eye Clean filter | 50-100ms | 1-5ms | **90-95%** |
| No BGM filter | 100-200ms | 5-10ms | **90-95%** |
| Advanced filters (multi) | 200-500ms | 10-20ms | **90-96%** |
| Full text search | N/A | N/A | N/A |

---

## Implementation Order

1. ✅ **Database Migration** (Phase 1)
2. ✅ **Type Definitions** (Phase 2)
3. ✅ **Database Layer** (Phase 3)
4. ✅ **Consolidation** (Phase 4)
5. ✅ **Frontend** (Phase 5)
6. ✅ **Testing** (Phase 6)
7. ✅ **Validation** (Phase 7)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Query breaks | Low | High | Comprehensive testing, keep JSONB fallback |
| Type mismatches | Low | Medium | TypeScript will catch at compile time |
| Performance regression | Very Low | High | EXPLAIN ANALYZE before/after |
| Data loss | Very Low | Critical | Backfill from JSONB, no JSONB column deletion |
| Frontend display issues | Low | Medium | Fallback to JSONB in rendering |

---

## Timeline Estimate

- **Phase 1-2** (Schema + Types): 30 minutes
- **Phase 3** (Database Layer): 1-2 hours
- **Phase 4** (Consolidation): 30 minutes
- **Phase 5** (Frontend): 30 minutes
- **Phase 6** (Testing): 1 hour
- **Phase 7** (Validation): 30 minutes

**Total**: ~4-5 hours

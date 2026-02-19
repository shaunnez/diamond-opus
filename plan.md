# Implementation Plan

## Phase 1: Dashboard Runs list page — Record % column

**Goal:** Change the "Workers" column on the Runs list page to show % of records processed instead of worker completion count, since all workers finish at roughly the same time.

### Files to change:
1. **`packages/database/src/queries/analytics.ts`** — In `getRunsWithStats`, add `estimated_records` to the SQL query by summing `COALESCE(SUM((wr.work_item_payload->>'estimatedRecords')::numeric), 0)` across workers. Map to `estimatedRecords` in the response.

2. **`packages/api/src/routes/analytics.ts`** — Pass the new `estimatedRecords` field through in the response (verify it flows through).

3. **`apps/dashboard/src/api/analytics.ts`** — Add `estimatedRecords?: number` to `RunWithStats` interface.

4. **`apps/dashboard/src/pages/Runs.tsx`** — Change the "Workers" column to show record percentage. For completed/failed runs show "100%" or the actual count. For running runs show `totalRecordsProcessed / estimatedRecords` as a `RecordProgress` bar with percentage text.

---

## Phase 2: Storefront filter sidebar — Cushion variants & new shapes

**Goal:** When user selects "Cushion", also filter by CUSHION B, CUSHION MODIFIED, CUSHION BRILLIANT. Add ROSE, OLD MINER, TRILLIANT, HEXAGONAL to the shape picker.

### Files to change:
1. **`apps/storefront/src/utils/shapes.ts`** — Add 4 new shapes (ROSE, OLD MINER, TRILLIANT, HEXAGONAL) with SVG paths. Add a `SHAPE_GROUPS` mapping so "CUSHION" expands to `['CUSHION', 'CUSHION B', 'CUSHION MODIFIED', 'CUSHION BRILLIANT']`.

2. **`apps/storefront/src/hooks/useDiamondSearch.ts`** (or `api/diamonds.ts`) — When building the API query, expand "CUSHION" into all 4 cushion variants before sending to the API. The API will receive `shape=CUSHION,CUSHION B,CUSHION MODIFIED,CUSHION BRILLIANT`.

---

## Phase 3: Nivoda product_images — GraphQL, types, consolidation

**Goal:** Retrieve `product_images` with `display_index` from Nivoda, store in raw table (happens automatically since full payload is stored as JSONB), consolidate into a new `meta_images` JSONB column on the `diamonds` table.

### 3a. GraphQL query + types
1. **`packages/nivoda/src/queries.ts`** — Add `display_index` to the `product_images` selection in `DIAMONDS_BY_QUERY` (line 144-149). Currently has `id, url, loupe360_url, type` — add `display_index`.

2. **`packages/nivoda/src/types.ts`** — Add `NivodaProductImage` interface with `{id, url, loupe360_url?, type?, display_index?: number}`. Add `product_images?: NivodaProductImage[]` and `product_videos?: ...` to `NivodaCertificate`.

### 3b. Database migration
3. **`sql/migrations/010_meta_images.sql`** (new) — `ALTER TABLE diamonds ADD COLUMN meta_images JSONB;`

4. **`sql/full_schema.sql`** — Add `meta_images JSONB` to the diamonds table definition.

### 3c. Shared types
5. **`packages/shared/src/types/diamond.ts`** — Add `metaImages?: Array<{id: string; url: string; displayIndex: number}>` to `Diamond` interface.

### 3d. Mapper
6. **`packages/nivoda/src/mapper.ts`** — In `mapNivodaItemToDiamond`, extract `certificate.product_images`, map to `metaImages` array sorted by `display_index`.

### 3e. Database queries
7. **`packages/database/src/queries/diamonds.ts`**:
   - Add `meta_images` to `DiamondRow` interface
   - Add `metaImages` mapping in `mapRowToDiamond` (parse JSONB)
   - Add `metaImages` to `upsertDiamondsBatch` UNNEST arrays (as `jsonb[]`)
   - Add `meta_images` to the INSERT/ON CONFLICT columns

---

## Phase 4: Storefront — Display product images on diamond detail page

**Goal:** Show product images after the primary image/video on the diamond detail page.

### Files to change:
1. **`apps/storefront/src/types/diamond.ts`** — Add `metaImages?: Array<{id: string; url: string; displayIndex: number}>` to `Diamond` interface.

2. **`packages/api/src/routes/diamonds.ts`** — Verify the GET `/diamonds/:id` endpoint includes `meta_images` in the response. Since it uses `getDiamondById` which does `SELECT *`, it should be included automatically once the `DiamondRow` and `mapRowToDiamond` are updated.

3. **`apps/storefront/src/components/diamonds/DiamondMedia.tsx`** — Accept optional `metaImages` prop. In `detail` mode, after the primary image/video, render a thumbnail row of product images that can be clicked to view larger.

4. **`apps/storefront/src/pages/DiamondDetailPage.tsx`** — Pass `diamond.metaImages` to `DiamondMedia`.

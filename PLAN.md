# Diamond Search API & Storefront — Implementation Plan

## Summary of changes

1. Validator: allow 0 as min, limit → 1000, new sort cols, new filters, `fields` param
2. Shared types: `priceModelNzd`, `DiamondSlim`, updated `DiamondSearchParams`
3. DB queries: new sort columns (NULLS LAST), new filters, slim mapper
4. API route: compute `priceModelNzd` in enrichWithNzd, wire new params
5. Storefront types: add missing fields, update search params
6. Storefront API client: default `fields=slim&availability=available`
7. New `StarRating` component (1–10 mapped to half-stars on 5-star scale)
8. DiamondCard: priceModelNzd hero, priceNzd strikethrough, markup %, star rating
9. DiamondDetailPage / DiamondSpecs: same price layout, rating row in specs
10. SearchPage sort: remove feed_price, add price_model_price + rating sorts
11. Tests: diamonds query + validator
12. Typecheck: npm run typecheck

---

## Step-by-step

### Step 1 — `packages/api/src/validators/diamonds.ts`
- All `_min` params: `.positive()` → `.min(0)` (carat, price, ratio, table, depth_pct, crown_angle, pav_angle, length, width, depth_mm, rating_min)
- `limit`: max 100 → max 1000
- `sort_by` enum: add `'price_model_price'`, `'rating'`
- New filter params:
  - `availability: z.union([z.string(), z.array(z.string())]).optional()`
  - `price_model_price_min: z.coerce.number().min(0).optional()`
  - `price_model_price_max: z.coerce.number().min(0).optional()`
- `fields: z.enum(['full', 'slim']).default('full')`

### Step 2 — `packages/shared/src/types/diamond.ts`
- Add `priceModelNzd?: number` to `Diamond`
- Add `DiamondSlim` interface:
  ```
  id, feed, shape, carats, color, clarity, cut,
  fancyColor, fancyIntensity, labGrown,
  priceModelNzd, priceNzd, markupRatio,
  rating, availability, certificateLab,
  imageUrl, videoUrl, createdAt
  ```
  (no raw USD prices, no measurements, no attributes, no supplier)
- Add to `DiamondSearchParams`:
  `availability?: string[]`, `priceModelPriceMin?`, `priceModelPriceMax?`, `fields?: 'full' | 'slim'`

### Step 3 — `packages/database/src/queries/diamonds.ts`
- `allowedSortColumns`: add `price_model_price`, `rating`
- Sort clause: `ORDER BY ${safeSort} ${safeOrder} NULLS LAST`
- New filter conditions:
  - `availability` → `availability = ANY($n)` if array provided
  - `priceModelPriceMin/Max` → `price_model_price >= $n` / `price_model_price <= $n`
- Add `mapRowToDiamondSlim(row: DiamondRow): DiamondSlim` — maps only slim fields
  (still needs feedPrice + priceModelPrice internally so enrichment can compute NZD, but
   those raw USD fields are dropped — NZD enrichment happens in API route before returning)
- `searchDiamonds`: accept `fields` param, branch: `fields === 'slim'` → use slim mapper

### Step 4 — `packages/api/src/routes/diamonds.ts`
- `enrichWithNzd`: also compute `priceModelNzd = Math.round(priceModelPrice * rate * 100) / 100`
  when `priceModelPrice` is present
- Wire new params from validated query into `searchDiamonds` call:
  `availability`, `priceModelPriceMin`, `priceModelPriceMax`, `fields`
- For slim responses after enrichment, prune internal USD fields from each record
  (feedPrice, priceModelPrice, pricePerCarat, diamondPrice) before sending

### Step 5 — `apps/storefront/src/types/diamond.ts`
- Add `pricingRating?: number`, `priceModelNzd?: number` to `Diamond`
- Add `availability?: string[]`, `price_model_price_min?`, `price_model_price_max?`, `fields?`
  to `DiamondSearchParams`

### Step 6 — `apps/storefront/src/api/diamonds.ts`
- Default search: append `fields: 'slim'`, `availability: ['available']` to params

### Step 7 — `apps/storefront/src/components/ui/StarRating.tsx` (new)
- Props: `rating: number` (1–10), `size?: 'sm' | 'md'`
- Maps to 5-star scale (rating / 2), renders filled/half/empty stars
- Small variant for card, medium for detail

### Step 8 — `apps/storefront/src/components/diamonds/DiamondCard.tsx`
- Price block:
  - Hero: `priceModelNzd` (NZD, large)
  - Strikethrough: `priceNzd` (NZD)
  - Markup: `markupRatio` as percentage string
- Add `StarRating` (size="sm") when `rating` is present, below specs line

### Step 9 — `apps/storefront/src/pages/DiamondDetailPage.tsx` + `DiamondSpecs.tsx`
- Price block in detail page:
  - Hero: `priceModelNzd`
  - Strikethrough: `priceNzd`
  - Markup %: `markupRatio`
  - Remove USD feedPrice line
- `DiamondSpecs`: add `Rating` row at top of Specifications section
  using `StarRating` (size="md") + numeric label e.g. `8 / 10`

### Step 10 — `apps/storefront/src/pages/SearchPage.tsx`
- Remove sort entries for `feed_price`
- Add:
  - `{ label: 'Price: Low → High', sort_by: 'price_model_price', sort_order: 'asc' }`
  - `{ label: 'Price: High → Low', sort_by: 'price_model_price', sort_order: 'desc' }`
  - `{ label: 'Rating: Best First', sort_by: 'rating', sort_order: 'desc' }`

### Step 11 — Tests

**`packages/database/src/queries/__tests__/diamonds.test.ts`** (new)
- `mapRowToDiamondSlim` returns only slim fields
- `allowedSortColumns` includes `price_model_price` and `rating`
- NULLS LAST in generated ORDER BY clause
- Availability filter generates correct SQL
- `priceModelPrice` min/max filters generate correct SQL

**`packages/api/src/validators/__tests__/diamonds.test.ts`** (new)
- `carat_min: 0` parses successfully
- `price_min: 0` parses successfully
- `limit: 1000` accepted; `limit: 1001` rejected
- `sort_by: 'price_model_price'` accepted; `sort_by: 'feed_price'` still accepted (API contract)
- `sort_by: 'rating'` accepted
- `fields: 'slim'` accepted; `fields: 'other'` rejected

### Step 12 — Typecheck
```
npm run typecheck
```
Fix any type errors before considering complete.

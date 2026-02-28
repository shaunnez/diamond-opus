import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Diamond } from '@diamond/shared';
import {
  searchDiamonds,
  getDiamondById,
  getRecommendedDiamonds,
  updateDiamondAvailability,
  createHoldHistory,
  createPurchaseHistory,
  getPurchaseByIdempotencyKey,
  updatePurchaseStatus,
} from '@diamond/database';
import { NivodaAdapter, NivodaFeedAdapter } from '@diamond/nivoda';
import { validateQuery, validateParams, validateBody, notFound, badRequest, conflict, fatalError } from '../middleware/index.js';
import {
  diamondSearchSchema,
  diamondIdSchema,
  relatedDiamondsQuerySchema,
  purchaseRequestSchema,
  type DiamondSearchQuery,
  type DiamondIdParams,
  type RelatedDiamondsQuery,
  type PurchaseRequestBody,
} from '../validators/index.js';
import { getNzdRate } from '../services/currency.js';
import {
  buildFilterKey,
  buildSearchCacheKey,
  getCachedSearch,
  setCachedSearch,
  getCompositeVersion,
} from '../services/cache.js';
import { TradingAdapter } from '@diamond/feed-registry';
import { DemoFeedAdapter } from '@diamond/demo-feed';

const router = Router();

/**
 * Utility function to convert query parameters that can be either a single string or an array of strings into a consistent array format.
 * @param value 
 * @returns 
 */
function toArray(value: string | string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map(longDiamondFilterToShort);
  // Handle comma-separated strings from query params
  return value.includes(',') ? value.split(',').map(v => longDiamondFilterToShort(v.trim())) : [longDiamondFilterToShort(value)];
}

/**
 * Splits a string or array value into an array without any case conversion.
 * Use this for values that are stored as-is in the DB (e.g. availability statuses).
 */
function toStringArray(value: string | string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  return value.includes(',') ? value.split(',').map(v => v.trim()) : [value];
}

/**
 * Converts long-form diamond filter values to the short codes expected by the Nivoda API.
 * For example, "Excellent" -> "EX", "Very Good" -> "VG", etc.
 * @param filter 
 * @returns 
 */
function longDiamondFilterToShort(filter: string): string {
  const localFilter = filter.toUpperCase().replace(/ /g, '_');
  if (localFilter === 'EXCELLENT') return 'EX';
  if (localFilter === 'VERY_GOOD') return 'VG';
  if (localFilter === 'GOOD') return 'G';
  if (localFilter === 'FAIR') return 'F';
  if (localFilter === 'POOR') return 'P';
  return localFilter;
}

function enrichWithNzd(diamond: Diamond): Diamond {
  const rate = getNzdRate();
  if (rate !== null) {
    return {
      ...diamond,
      priceNzd: Math.round(diamond.feedPrice * rate * 100) / 100,
      priceModelNzd: diamond.priceModelPrice != null
        ? Math.round(diamond.priceModelPrice * rate * 100) / 100
        : undefined,
    };
  }
  return diamond;
}

const SLIM_FIELDS: (keyof Diamond)[] = [
  'id', 'feed', 'shape', 'carats', 'color', 'clarity', 'cut',
  'fancyColor', 'fancyIntensity', 'labGrown',
  'priceModelNzd', 'priceNzd', 'markupRatio',
  'rating', 'availability', 'certificateLab',
  'imageUrl', 'videoUrl', 'createdAt',
];

function toSlim(diamond: Diamond): Partial<Diamond> {
  const slim: Partial<Diamond> = {};
  for (const key of SLIM_FIELDS) {
    (slim as Record<string, unknown>)[key] = diamond[key];
  }
  return slim;
}


/**
 * Returns a TradingAdapter for the given feed.
 */
function getTradingAdapter(feedId: string): TradingAdapter {
  switch (feedId) {
    case 'nivoda-natural':
    case 'nivoda-labgrown':
      return new NivodaFeedAdapter({ feedVariant: feedId === 'nivoda-labgrown' ? 'labgrown' : 'natural' });
    case 'demo':
      return new DemoFeedAdapter();
    default:
      throw badRequest(`Trading is not supported for feed: ${feedId}`);
  }
}


/**
 * @openapi
 * /api/v2/diamonds:
 *   get:
 *     summary: Search diamonds
 *     description: >
 *       Filter and paginate the active diamond inventory.
 *
 *       **Array parameters** accept either repeated keys (`?shape=ROUND&shape=OVAL`)
 *       or a single comma-separated value (`?shape=ROUND,OVAL`).
 *
 *       **String normalisation** — most categorical values (shape, color, clarity,
 *       cut, polish, symmetry, fluorescence_intensity) are upper-cased before
 *       matching. Cut/polish/symmetry also accept long-form grades:
 *       `Excellent` → `EX`, `Very Good` → `VG`, `Good` → `G`, `Fair` → `F`,
 *       `Poor` → `P`. `fancy_colors` and `availability` are stored
 *       case-sensitively and must be passed exactly as documented.
 *     tags:
 *       - Diamonds
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: feed
 *         schema:
 *           type: string
 *           enum: [nivoda-natural, nivoda-labgrown, demo]
 *         description: Restrict results to a single source feed. Omit to search across all feeds.
 *         example: nivoda-natural
 *
 *       - in: query
 *         name: shape
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DiamondShape'
 *         description: >
 *           One or more diamond shapes. Values: ROUND, OVAL, EMERALD, CUSHION,
 *           CUSHION B, CUSHION MODIFIED, CUSHION BRILLIANT, ASSCHER, RADIANT,
 *           MARQUISE, PEAR, PRINCESS, ROSE, OLD MINER, TRILLIANT, HEXAGONAL, HEART.
 *         example: ROUND,OVAL
 *
 *       - in: query
 *         name: color
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DiamondColor'
 *         description: >
 *           One or more colour grades. D–M are traditional white grades (D = most
 *           colourless). Pass "Fancy" to include fancy-coloured diamonds; use
 *           fancy_colors to narrow by specific colour.
 *         example: G,H,I
 *
 *       - in: query
 *         name: clarity
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DiamondClarity'
 *         description: One or more clarity grades from FL (Flawless) to I3 (Included).
 *         example: VS1,VS2
 *
 *       - in: query
 *         name: cut
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DiamondCutGrade'
 *         description: >
 *           One or more cut grades. Short codes (EX, VG, G, F, P) and long-form
 *           (Excellent, Very Good, Good, Fair, Poor) are both accepted.
 *         example: EX,VG
 *
 *       - in: query
 *         name: polish
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DiamondCutGrade'
 *         description: >
 *           One or more polish grades. Short codes (EX, VG, G, F, P) and long-form
 *           (Excellent, Very Good, Good, Fair, Poor) are both accepted.
 *         example: EX,VG
 *
 *       - in: query
 *         name: symmetry
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DiamondCutGrade'
 *         description: >
 *           One or more symmetry grades. Short codes (EX, VG, G, F, P) and
 *           long-form (Excellent, Very Good, Good, Fair, Poor) are both accepted.
 *         example: EX
 *
 *       - in: query
 *         name: lab
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DiamondLab'
 *         description: >
 *           One or more grading laboratories. Values: GIA, AGS, IGI, HRD, GCAL.
 *         example: GIA,IGI
 *
 *       - in: query
 *         name: fluorescence_intensity
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DiamondFluorescenceIntensity'
 *         description: >
 *           One or more fluorescence intensity grades. Stored upper-case with
 *           underscores; spaces and mixed case are normalised automatically.
 *           Values: NONE, FAINT, MEDIUM, STRONG, VERY_STRONG.
 *         example: NONE,FAINT
 *
 *       - in: query
 *         name: availability
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DiamondAvailability'
 *         description: >
 *           One or more availability statuses. Defaults to all statuses if omitted.
 *           Values: available, on_hold, sold, unavailable. Case-sensitive.
 *         example: available
 *
 *       - in: query
 *         name: lab_grown
 *         schema:
 *           type: boolean
 *         description: >
 *           `true` = lab-grown diamonds only; `false` = natural/earth-mined only.
 *           Omit to return both.
 *         example: false
 *
 *       - in: query
 *         name: fancy_color
 *         schema:
 *           type: boolean
 *         description: >
 *           `true` = only fancy-coloured diamonds (fancy_color IS NOT NULL);
 *           `false` = only non-fancy diamonds. Omit to return both.
 *
 *       - in: query
 *         name: fancy_colors
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DiamondFancyColor'
 *         description: >
 *           Filter by specific fancy colour names. Case-sensitive. Use alongside
 *           fancy_color=true. Values: Black, Blue, Brown, Chameleon, Cognac,
 *           Gray, Green, Orange, Pink, Purple, White, Yellow, Brown-Orange,
 *           Brown-Pink, Brown-Yellow, Gray-Blue, Green-Yellow, Orange-Yellow,
 *           Pink-Purple, Yellow-Green, Yellow-Orange.
 *         example: Pink,Blue
 *
 *       - in: query
 *         name: fancy_intensity
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DiamondFancyIntensity'
 *         description: >
 *           One or more fancy colour intensity grades. Values: Faint, Very Light,
 *           Light, Fancy Light, Fancy, Fancy Intense, Fancy Vivid, Fancy Deep,
 *           Fancy Dark.
 *         example: Fancy Intense,Fancy Vivid
 *
 *       - in: query
 *         name: eye_clean
 *         schema:
 *           type: boolean
 *         description: >
 *           `true` = only eye-clean diamonds (no inclusions visible to the naked eye).
 *
 *       - in: query
 *         name: no_bgm
 *         schema:
 *           type: boolean
 *         description: >
 *           `true` = exclude diamonds with any brown, green, or milky tint
 *           (i.e. where the brown, green, or milky column is non-null and non-empty).
 *
 *       - in: query
 *         name: carat_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum carat weight (inclusive).
 *         example: 0.5
 *
 *       - in: query
 *         name: carat_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum carat weight (inclusive).
 *         example: 2.0
 *
 *       - in: query
 *         name: price_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum feed/cost price in USD (inclusive).
 *         example: 1000
 *
 *       - in: query
 *         name: price_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum feed/cost price in USD (inclusive).
 *         example: 10000
 *
 *       - in: query
 *         name: price_model_price_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum selling price (after pricing rules) in USD (inclusive).
 *         example: 1200
 *
 *       - in: query
 *         name: price_model_price_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum selling price (after pricing rules) in USD (inclusive).
 *         example: 12000
 *
 *       - in: query
 *         name: rating_min
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10
 *         description: Minimum overall quality rating (1–10, inclusive).
 *         example: 7
 *
 *       - in: query
 *         name: rating_max
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10
 *         description: Maximum overall quality rating (1–10, inclusive).
 *
 *       - in: query
 *         name: ratio_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum length-to-width ratio (inclusive).
 *         example: 1.0
 *
 *       - in: query
 *         name: ratio_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum length-to-width ratio (inclusive).
 *         example: 1.5
 *
 *       - in: query
 *         name: table_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum table percentage (%) (inclusive).
 *         example: 54
 *
 *       - in: query
 *         name: table_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum table percentage (%) (inclusive).
 *         example: 62
 *
 *       - in: query
 *         name: depth_pct_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum depth percentage (%) (inclusive).
 *         example: 59
 *
 *       - in: query
 *         name: depth_pct_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum depth percentage (%) (inclusive).
 *         example: 63
 *
 *       - in: query
 *         name: crown_angle_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum crown angle in degrees (inclusive).
 *         example: 33.0
 *
 *       - in: query
 *         name: crown_angle_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum crown angle in degrees (inclusive).
 *         example: 36.0
 *
 *       - in: query
 *         name: pav_angle_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum pavilion angle in degrees (inclusive).
 *         example: 40.0
 *
 *       - in: query
 *         name: pav_angle_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum pavilion angle in degrees (inclusive).
 *         example: 41.5
 *
 *       - in: query
 *         name: length_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum length in millimetres (inclusive).
 *
 *       - in: query
 *         name: length_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum length in millimetres (inclusive).
 *
 *       - in: query
 *         name: width_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum width in millimetres (inclusive).
 *
 *       - in: query
 *         name: width_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum width in millimetres (inclusive).
 *
 *       - in: query
 *         name: depth_mm_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Minimum depth (height) in millimetres (inclusive).
 *
 *       - in: query
 *         name: depth_mm_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Maximum depth (height) in millimetres (inclusive).
 *
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (1-based).
 *         example: 1
 *
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 50
 *         description: Number of results per page. Maximum 1000.
 *         example: 50
 *
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [created_at, feed_price, carats, color, clarity, ratio, fancy_color, fluorescence_intensity, certificate_lab, price_model_price, rating]
 *           default: created_at
 *         description: Field to sort by.
 *
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction.
 *
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *           enum: [full, slim]
 *           default: full
 *         description: >
 *           Response field set. `full` returns the complete Diamond object.
 *           `slim` returns only card-view fields (id, feed, shape, carats, color,
 *           clarity, cut, fancyColor, fancyIntensity, labGrown, priceModelNzd,
 *           priceNzd, markupRatio, rating, availability, certificateLab,
 *           imageUrl, videoUrl, createdAt) — use this for list/grid views to
 *           reduce payload size.
 *
 *     responses:
 *       200:
 *         description: Paginated list of matching diamonds.
 *         headers:
 *           X-Cache:
 *             schema:
 *               type: string
 *               enum: [HIT, MISS]
 *             description: Whether the response was served from the in-memory cache.
 *           ETag:
 *             schema:
 *               type: string
 *             description: Dataset version tag. Send back as If-None-Match to receive 304 when data is unchanged.
 *           Cache-Control:
 *             schema:
 *               type: string
 *             description: "'public, max-age=60, stale-while-revalidate=300'"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedDiamondResponse'
 *       304:
 *         description: Not Modified — dataset version matches the If-None-Match header sent by the client.
 *       401:
 *         description: Unauthorized — missing or invalid X-API-Key header.
 */
router.get(
  '/',
  validateQuery(diamondSearchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = (req as Request & { validatedQuery: DiamondSearchQuery }).validatedQuery;

      const payload = {
        feed: query.feed,
        shapes: toArray(query.shape),
        caratMin: query.carat_min,
        caratMax: query.carat_max,
        colors: toArray(query.color),
        clarities: toArray(query.clarity),
        cuts: toArray(query.cut),
        labGrown: query.lab_grown,
        priceMin: query.price_min,
        priceMax: query.price_max,
        fancyColor: query.fancy_color,
        fancyIntensities: toArray(query.fancy_intensity),
        fancyColors: toStringArray(query.fancy_colors),
        fluorescenceIntensities: toArray(query.fluorescence_intensity),
        polishes: toArray(query.polish),
        symmetries: toArray(query.symmetry),
        ratioMin: query.ratio_min,
        ratioMax: query.ratio_max,
        tableMin: query.table_min,
        tableMax: query.table_max,
        depthPercentageMin: query.depth_pct_min,
        depthPercentageMax: query.depth_pct_max,
        crownAngleMin: query.crown_angle_min,
        crownAngleMax: query.crown_angle_max,
        pavAngleMin: query.pav_angle_min,
        pavAngleMax: query.pav_angle_max,
        labs: toArray(query.lab),
        eyeClean: query.eye_clean,
        noBgm: query.no_bgm,
        lengthMin: query.length_min,
        lengthMax: query.length_max,
        widthMin: query.width_min,
        widthMax: query.width_max,
        depthMeasurementMin: query.depth_mm_min,
        depthMeasurementMax: query.depth_mm_max,
        ratingMin: query.rating_min,
        ratingMax: query.rating_max,
        availability: toStringArray(query.availability),
        priceModelPriceMin: query.price_model_price_min,
        priceModelPriceMax: query.price_model_price_max,
        page: query.page,
        limit: query.limit,
        sortBy: query.sort_by,
        sortOrder: query.sort_order,
        fields: query.fields,
        skipCount: query.no_count === true,
        afterCreatedAt: query.after_created_at,
        afterId: query.after_id,
      };

      // --- ETag: return 304 if dataset hasn't changed ---
      const currentVersion = getCompositeVersion();
      const etag = `"v${currentVersion}"`;
      if (req.headers['if-none-match'] === etag) {
        res.status(304).end();
        return;
      }

      // --- Cache lookup ---
      const filterKey = buildFilterKey(payload);
      const sortBy = payload.sortBy ?? 'created_at';
      const sortOrder = payload.sortOrder ?? 'desc';
      const page = payload.page ?? 1;
      const limit = Math.min(payload.limit ?? 50, 1000);
      const fields = payload.fields ?? 'full';
      // Use cursor as page key when keyset pagination is active
      const pageKey = payload.afterCreatedAt && payload.afterId
        ? `${payload.afterCreatedAt}_${payload.afterId}`
        : String(page);
      const cacheKey = buildSearchCacheKey(filterKey, sortBy, sortOrder, pageKey, limit, fields);

      const cached = getCachedSearch(cacheKey);
      if (cached) {
        res.set('ETag', etag);
        res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        res.set('X-Cache', 'HIT');
        res.type('json').send(cached);
        return;
      }

      // --- Cache miss: query DB ---
      const result = await searchDiamonds(payload);
      const enriched = result.data.map(enrichWithNzd);
      const responseBody = {
        ...result,
        data: fields === 'slim' ? enriched.map(toSlim) : enriched,
      };

      // Cache the serialized response
      const responseJson = JSON.stringify(responseBody);
      setCachedSearch(cacheKey, responseJson);

      res.set('ETag', etag);
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.set('X-Cache', 'MISS');
      res.type('json').send(responseJson);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v2/diamonds/{id}/related:
 *   get:
 *     summary: Get recommended diamonds
 *     description: >
 *       Returns three curated diamond recommendations relative to the anchor diamond.
 *       All candidates are similar by shape, lab_grown status, clarity, and cut,
 *       within a carat tolerance window. The three slots are:
 *         - highest_rated: the highest-rated similar diamond
 *         - most_expensive: the most expensive similar diamond
 *         - mid_rated: a similar diamond rated between 7–8 (fallback: closest rating to 7.5)
 *       Each slot is filled by a dedicated LIMIT 1 query. If the candidate pool is too small,
 *       cut is dropped then clarity progressively to ensure 3 distinct results.
 *       A slot may be null only if no similar diamonds exist at all.
 *     tags:
 *       - Diamonds
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Anchor diamond ID
 *       - in: query
 *         name: carat_tolerance
 *         schema:
 *           type: number
 *           default: 0.15
 *           minimum: 0
 *           maximum: 5
 *         description: Carat tolerance (+/-) from anchor diamond
 *     responses:
 *       200:
 *         description: Three curated diamond recommendations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     highest_rated:
 *                       type: object
 *                       nullable: true
 *                     most_expensive:
 *                       type: object
 *                       nullable: true
 *                     mid_rated:
 *                       type: object
 *                       nullable: true
 *             example:
 *               data:
 *                 highest_rated:
 *                   id: "550e8400-e29b-41d4-a716-446655440001"
 *                   shape: "ROUND"
 *                   carats: 1.52
 *                   color: "G"
 *                   clarity: "VS1"
 *                   rating: 9
 *                   priceModelNzd: 14200
 *                 most_expensive:
 *                   id: "550e8400-e29b-41d4-a716-446655440002"
 *                   shape: "ROUND"
 *                   carats: 1.48
 *                   color: "F"
 *                   clarity: "VS1"
 *                   rating: 7
 *                   priceModelNzd: 18500
 *                 mid_rated:
 *                   id: "550e8400-e29b-41d4-a716-446655440003"
 *                   shape: "ROUND"
 *                   carats: 1.55
 *                   color: "H"
 *                   clarity: "VS1"
 *                   rating: 8
 *                   priceModelNzd: 11000
 *       400:
 *         description: Invalid parameters
 *       404:
 *         description: Anchor diamond not found
 */
router.get(
  '/:id/related',
  validateParams(diamondIdSchema),
  validateQuery(relatedDiamondsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = (req as Request & { validatedParams: DiamondIdParams }).validatedParams;
      const queryParams = (req as Request & { validatedQuery: RelatedDiamondsQuery }).validatedQuery;

      const result = await getRecommendedDiamonds(id, {
        caratTolerance: queryParams.carat_tolerance,
      });

      if (!result) {
        throw notFound('Diamond not found');
      }

      const slim = (d: Diamond | null) => d ? toSlim(enrichWithNzd(d)) : null;

      res.json({
        data: {
          highest_rated: slim(result.highestRated),
          most_expensive: slim(result.mostExpensive),
          mid_rated: slim(result.midRated),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v2/diamonds/{id}:
 *   get:
 *     summary: Get diamond by ID
 *     tags:
 *       - Diamonds
 *     security:
 *       - ApiKeyAuth: []
 
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Diamond details
 *       404:
 *         description: Diamond not found
 */
router.get(
  '/:id',
  validateParams(diamondIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = (req as Request & { validatedParams: DiamondIdParams }).validatedParams;

      const diamond = await getDiamondById(id);
      if (!diamond) {
        throw notFound('Diamond not found');
      }

      res.json({ data: enrichWithNzd(diamond) });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v2/diamonds/{id}/availability:
 *   post:
 *     summary: Check diamond availability
 *     tags:
 *       - Diamonds
 *     security:
 *       - ApiKeyAuth: []
 
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Availability status
 *       404:
 *         description: Diamond not found
 */
router.post(
  '/:id/availability',
  validateParams(diamondIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = (req as Request & { validatedParams: DiamondIdParams }).validatedParams;

      const diamond = await getDiamondById(id);
      if (!diamond) {
        throw notFound('Diamond not found');
      }
      const adapter = getTradingAdapter(diamond.feed);
      const result = await adapter.checkAvailability(diamond);
      res.json({ data: result })
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v2/diamonds/{id}/hold:
 *   post:
 *     summary: Create hold on diamond
 *     tags:
 *       - Diamonds
 *     security:
 *       - ApiKeyAuth: []
 
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Hold created
 *       404:
 *         description: Diamond not found
 *       409:
 *         description: Diamond not available for hold
 */
router.post(
  '/:id/hold',
  validateParams(diamondIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = (req as Request & { validatedParams: DiamondIdParams }).validatedParams;

      const diamond = await getDiamondById(id);
      if (!diamond) {
        throw notFound('Diamond not found');
      }

      if (diamond.availability !== 'available') {
        throw conflict('Diamond is not available for hold');
      }

      const adapter = getTradingAdapter(diamond.feed);
      const availability = await adapter.checkAvailability(diamond);
      if (!availability?.available) {
        res.status(400).json({
          error: { code: 'NOT_AVAILABLE', message: 'Diamond is not available' },
        });
      }

      const holdResponse = await adapter.createHold(diamond.supplierStoneId);

      await createHoldHistory(
        diamond.id,
        diamond.feed,
        diamond.supplierStoneId,
        holdResponse.id,
        holdResponse.denied,
        holdResponse.until ? new Date(holdResponse.until) : undefined
      );

      if (!holdResponse.denied) {
        await updateDiamondAvailability(diamond.id, 'on_hold', holdResponse.id);
      }

      res.json({
        data: {
          id: holdResponse.id,
          denied: holdResponse.denied,
          until: holdResponse.until,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);



/**
 * @openapi
 * /api/v2/diamonds/{id}/cancel-hold:
 *   post:
 *     summary: Cancel hold on diamond
 *     tags:
 *       - Diamonds
 *     security:
 *       - ApiKeyAuth: []
 
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Hold cancelled
 *       404:
 *         description: Diamond not found
 *       409:
 *         description: Diamond not available for hold
 */
router.post(
  '/:id/cancel-hold',
  validateParams(diamondIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = (req as Request & { validatedParams: DiamondIdParams }).validatedParams;

      const diamond = await getDiamondById(id);
      if (!diamond) {
        throw notFound('Diamond not found');
      }

      if (diamond.availability !== 'on_hold' && diamond.holdId) {
        throw conflict('Diamond is not available to cancel hold');
      }

      const adapter = getTradingAdapter(diamond.feed);
      const availability = await adapter.checkAvailability(diamond);
      if (availability?.status !== 'on_hold') {
        return res.status(400).json({
          error: { code: 'NOT_AVAILABLE', message: 'Diamond is not on hold' },
        });
      }

      const holdResponse = await adapter.cancelHold(diamond.holdId || '');

      if (holdResponse.id) {
        await updateDiamondAvailability(diamond.id, 'available');
      }

      res.json({
        data: {
          id: holdResponse.id
        },
      });
    } catch (error) {
      next(error);
    }
  }
);


/**
 * @openapi
 * /api/v2/diamonds/purchase:
 *   post:
 *     summary: Purchase diamond
 *     tags:
 *       - Diamonds
 *     security:
 *       - ApiKeyAuth: []
 
 *     parameters:
 *       - in: header
 *         name: X-Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - destination_id
 *             properties:
 *               destination_id:
 *                 type: string
 *               reference:
 *                 type: string
 *               comments:
 *                 type: string
 *               return_option:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Purchase created
 *       400:
 *         description: Missing idempotency key
 *       404:
 *         description: Diamond not found
 *       409:
 *         description: Duplicate request or diamond not available
 */
router.post(
  '/purchase',
  validateBody(purchaseRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as PurchaseRequestBody;
      const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;

      if (!idempotencyKey) {
        throw badRequest('X-Idempotency-Key header is required');
      }

      const existingPurchase = await getPurchaseByIdempotencyKey(idempotencyKey);
      if (existingPurchase) {
        res.json({
          data: {
            id: existingPurchase.feedOrderId,
            status: existingPurchase.status,
          },
        });
        return;
      }

      // todo: remove raw availability?
      const diamond = await getDiamondById(body.destination_id);
      if (!diamond) {
        throw notFound('Diamond not found');
      }

      if (diamond.availability !== 'available') {
        throw conflict('Diamond not available');
      }

      const adapter = getTradingAdapter(diamond.feed);
      const availability = await adapter.checkAvailability(diamond);
      if (!availability?.available) {
        throw conflict('Diamond not available');
      }

      const purchaseRecord = await createPurchaseHistory(
        diamond.id,
        diamond.feed,
        diamond.offerId,
        idempotencyKey,
        'pending',
        undefined,
        body.reference,
        body.comments
      );

      try {
        const orderResponse = await adapter.createOrder(diamond, { comments: body.comments,  reference: body.reference });
        // [
        //   {
        //     offerId: diamond.offerId,
        //     // todo: confirm destination id
        //     // destinationId: body.destination_id,
        //     customer_comment: body.comments,
        //     // todo: maybe not make this set from front end
        //     customer_order_number: body.reference,
        //     return_option: body.return_option,
        //   }
        // ]);
        
        if (!orderResponse) {
          throw fatalError('Diamond failed to place order');
        }
        await updatePurchaseStatus(purchaseRecord.id, 'confirmed', orderResponse?.id);
        await updateDiamondAvailability(diamond.id, 'sold');

        res.json({
          data:  orderResponse
        });
      } catch (error) {
        await updatePurchaseStatus(purchaseRecord.id, 'failed', null);
        throw error;
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;

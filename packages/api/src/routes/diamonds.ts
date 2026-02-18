import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Diamond } from '@diamond/shared';
import {
  searchDiamonds,
  getDiamondById,
  getRelatedDiamonds,
  RELATED_FIELDS_ALLOWLIST,
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
    case 'nivoda':
      return new NivodaFeedAdapter();
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
 *     summary: Search diamonds with filters
 *     tags:
 *       - Diamonds
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: query
 *         name: shape
 *         schema:
 *           type: string
 *         description: Comma-separated shape values (e.g. ROUND,OVAL)
 *       - in: query
 *         name: carat_min
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: carat_max
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: color
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: clarity
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: cut
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: lab_grown
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: price_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Min feed price in USD
 *       - in: query
 *         name: price_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Max feed price in USD
 *       - in: query
 *         name: price_model_price_min
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Min model price in USD
 *       - in: query
 *         name: price_model_price_max
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Max model price in USD
 *       - in: query
 *         name: availability
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *             enum: [available, on_hold, sold, unavailable]
 *         description: Filter by availability status (comma-separated)
 *       - in: query
 *         name: rating_min
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10
 *       - in: query
 *         name: rating_max
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10
 *       - in: query
 *         name: fancy_color
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: fancy_intensity
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: fluorescence_intensity
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: polish
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: symmetry
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: lab
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Certificate lab (e.g. GIA, IGI)
 *       - in: query
 *         name: eye_clean
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: no_bgm
 *         schema:
 *           type: boolean
 *         description: Exclude Brown/Green/Milky tinted diamonds
 *       - in: query
 *         name: ratio_min
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: ratio_max
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: table_min
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: table_max
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: depth_pct_min
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: depth_pct_max
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: crown_angle_min
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: crown_angle_max
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: pav_angle_min
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: pav_angle_max
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: length_min
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: length_max
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: width_min
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: width_max
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: depth_mm_min
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: depth_mm_max
 *         schema:
 *           type: number
 *           minimum: 0
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 1000
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [created_at, feed_price, carats, color, clarity, ratio, fancy_color, fluorescence_intensity, certificate_lab, price_model_price, rating]
 *           default: created_at
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *           enum: [full, slim]
 *           default: full
 *         description: "slim returns card-view fields only (priceModelNzd, priceNzd, rating, etc.); full returns all fields"
 *     responses:
 *       200:
 *         description: List of diamonds
 *       401:
 *         description: Unauthorized
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
      const cacheKey = buildSearchCacheKey(filterKey, sortBy, sortOrder, page, limit);

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
 *     summary: Get related diamonds
 *     description: >
 *       Returns diamonds similar to the anchor diamond based on configurable similarity fields.
 *       Always restricts to available diamonds, matches lab_grown with anchor, excludes anchor,
 *       and applies carat and priceModelPrice tolerances.
 *     tags:
 *       - Diamonds
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Anchor diamond ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 12
 *           minimum: 1
 *           maximum: 50
 *         description: Maximum number of related diamonds to return
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: >
 *           Comma-separated list of similarity fields.
 *           Allowed: shape, lab_grown, color, clarity, cut, polish, symmetry, fluorescence_intensity, certificate_lab.
 *           Default: shape,lab_grown,color,clarity,cut
 *         example: shape,color,clarity
 *       - in: query
 *         name: carat_tolerance
 *         schema:
 *           type: number
 *           default: 0.15
 *           minimum: 0
 *           maximum: 5
 *         description: Carat tolerance (+/-) from anchor diamond
 *       - in: query
 *         name: price_tolerance
 *         schema:
 *           type: integer
 *           default: 250
 *           minimum: 0
 *           maximum: 10000
 *         description: Absolute USD price tolerance (+/-) on priceModelPrice from anchor
 *     responses:
 *       200:
 *         description: List of related diamonds
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *             example:
 *               data:
 *                 - id: "550e8400-e29b-41d4-a716-446655440001"
 *                   shape: "ROUND"
 *                   carats: 1.52
 *                   color: "G"
 *                   clarity: "VS1"
 *                   priceModelNzd: 12500
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

      // Parse and validate fields
      let fields: string[] | undefined;
      if (queryParams.fields) {
        fields = queryParams.fields.split(',').map(f => f.trim()).filter(Boolean);
        const invalidFields = fields.filter(f => !(f in RELATED_FIELDS_ALLOWLIST));
        if (invalidFields.length > 0) {
          throw badRequest(`Invalid similarity fields: ${invalidFields.join(', ')}. Allowed: ${Object.keys(RELATED_FIELDS_ALLOWLIST).join(', ')}`);
        }
      }

      const result = await getRelatedDiamonds(id, {
        limit: queryParams.limit,
        fields,
        caratTolerance: queryParams.carat_tolerance,
        priceTolerance: queryParams.price_tolerance,
      });

      if (!result) {
        throw notFound('Diamond not found');
      }

      const enriched = result.related.map(enrichWithNzd);
      res.json({ data: enriched.map(toSlim) });
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
 *       - HmacAuth: []
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
 *       - HmacAuth: []
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
 *       - HmacAuth: []
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
 *       - HmacAuth: []
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
 *       - HmacAuth: []
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

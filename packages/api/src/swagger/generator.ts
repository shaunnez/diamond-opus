import swaggerJsdoc from 'swagger-jsdoc';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Diamond Platform API',
      version: '2.0.0',
      description: 'API for diamond inventory management',
    },
    servers: [
      {
        url: '/',
        description: 'Current environment (relative path)',
      },
      {
        url: 'http://localhost:3000',
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: `API key for authentication. Pass your API key in the X-API-Key header.`,
        },
      },
      schemas: {
        DiamondShape: {
          type: 'string',
          description: 'Diamond shape. Values are stored upper-case.',
          enum: [
            'ROUND', 'OVAL', 'EMERALD', 'CUSHION', 'CUSHION B', 'CUSHION MODIFIED',
            'CUSHION BRILLIANT', 'ASSCHER', 'RADIANT', 'MARQUISE', 'PEAR',
            'PRINCESS', 'ROSE', 'OLD MINER', 'TRILLIANT', 'HEXAGONAL', 'HEART',
          ],
          example: 'ROUND',
        },
        DiamondColor: {
          type: 'string',
          description: 'Diamond colour grade. D–M are traditional white grades (D = most colourless). Use "Fancy" for fancy-coloured diamonds and filter further with fancy_colors.',
          enum: ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'Fancy'],
          example: 'G',
        },
        DiamondClarity: {
          type: 'string',
          description: 'Diamond clarity grade, from highest (FL = Flawless) to lowest (I3 = Included).',
          enum: ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3'],
          example: 'VS1',
        },
        DiamondCutGrade: {
          type: 'string',
          description: 'Cut, polish, or symmetry grade. Short codes (EX, VG, G, F, P) and long-form (Excellent, Very Good, Good, Fair, Poor) are both accepted and normalised before filtering.',
          enum: ['EX', 'VG', 'G', 'F', 'P'],
          example: 'EX',
        },
        DiamondFluorescenceIntensity: {
          type: 'string',
          description: 'Fluorescence intensity. Stored upper-case with underscores. Input is normalised (spaces → underscores, case-insensitive).',
          enum: ['NONE', 'FAINT', 'MEDIUM', 'STRONG', 'VERY_STRONG'],
          example: 'NONE',
        },
        DiamondFancyColor: {
          type: 'string',
          description: 'Specific fancy colour name. Case-sensitive; only relevant when fancy_color=true.',
          enum: [
            'Black', 'Blue', 'Brown', 'Chameleon', 'Cognac', 'Gray', 'Green',
            'Orange', 'Pink', 'Purple', 'White', 'Yellow',
            'Brown-Orange', 'Brown-Pink', 'Brown-Yellow', 'Gray-Blue',
            'Green-Yellow', 'Orange-Yellow', 'Pink-Purple', 'Yellow-Green', 'Yellow-Orange',
          ],
          example: 'Pink',
        },
        DiamondFancyIntensity: {
          type: 'string',
          description: 'Intensity grade for fancy-coloured diamonds, from faintest to most saturated.',
          enum: ['Faint', 'Very Light', 'Light', 'Fancy Light', 'Fancy', 'Fancy Intense', 'Fancy Vivid', 'Fancy Deep', 'Fancy Dark'],
          example: 'Fancy Intense',
        },
        DiamondLab: {
          type: 'string',
          description: 'Grading laboratory that issued the certificate.',
          enum: ['GIA', 'AGS', 'IGI', 'HRD', 'GCAL'],
          example: 'GIA',
        },
        DiamondAvailability: {
          type: 'string',
          description: 'Current availability status of the diamond.',
          enum: ['available', 'on_hold', 'sold', 'unavailable'],
          example: 'available',
        },
        Diamond: {
          type: 'object',
          description: 'Full canonical diamond record.',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Unique record identifier' },
            feed: { type: 'string', description: 'Source feed identifier (e.g. nivoda-natural, nivoda-labgrown, demo)' },
            supplierStoneId: { type: 'string', description: 'Supplier internal stone ID' },
            offerId: { type: 'string', description: 'Supplier offer/listing ID (used for trading operations)' },
            shape: { $ref: '#/components/schemas/DiamondShape' },
            carats: { type: 'number', format: 'float', description: 'Carat weight', example: 1.52 },
            color: { $ref: '#/components/schemas/DiamondColor' },
            clarity: { $ref: '#/components/schemas/DiamondClarity' },
            cut: { $ref: '#/components/schemas/DiamondCutGrade' },
            polish: { $ref: '#/components/schemas/DiamondCutGrade' },
            symmetry: { $ref: '#/components/schemas/DiamondCutGrade' },
            fluorescence: { type: 'string', description: 'Raw fluorescence description from supplier' },
            fluorescenceIntensity: { $ref: '#/components/schemas/DiamondFluorescenceIntensity' },
            fancyColor: { $ref: '#/components/schemas/DiamondFancyColor' },
            fancyIntensity: { $ref: '#/components/schemas/DiamondFancyIntensity' },
            fancyOvertone: { type: 'string', description: 'Secondary colour overtone for fancy diamonds' },
            ratio: { type: 'number', format: 'float', description: 'Length-to-width ratio', example: 1.35 },
            labGrown: { type: 'boolean', description: 'true = lab-grown; false = natural/earth-mined' },
            treated: { type: 'boolean', description: 'Whether the diamond has undergone any colour or clarity treatment' },
            feedPrice: { type: 'number', format: 'float', description: 'Cost/feed price in USD' },
            diamondPrice: { type: 'number', format: 'float', description: 'Supplier list price in USD (may differ from feedPrice)' },
            pricePerCarat: { type: 'number', format: 'float', description: 'Feed price divided by carat weight (USD/ct)' },
            priceModelPrice: { type: 'number', format: 'float', description: 'Selling price after pricing rules (USD)' },
            priceNzd: { type: 'number', format: 'float', description: 'Feed price converted to NZD at the current exchange rate (injected at response time, not stored)' },
            priceModelNzd: { type: 'number', format: 'float', description: 'Selling price converted to NZD (injected at response time)' },
            markupRatio: { type: 'number', format: 'float', description: 'Ratio of priceModelPrice to feedPrice' },
            pricingRating: { type: 'number', description: 'Internal pricing quality score (1–10)' },
            rating: { type: 'number', description: 'Overall diamond quality rating (1–10), combining pricing and attribute scores' },
            availability: { $ref: '#/components/schemas/DiamondAvailability' },
            rawAvailability: { type: 'string', description: 'Availability status as returned by the source feed (before normalisation)' },
            holdId: { type: 'string', description: 'Active hold identifier, present when availability = on_hold' },
            imageUrl: { type: 'string', format: 'uri', description: 'Primary diamond image URL' },
            videoUrl: { type: 'string', format: 'uri', description: '360° video URL' },
            metaImages: {
              type: 'array',
              description: 'Additional image assets ordered by displayIndex',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  url: { type: 'string', format: 'uri' },
                  displayIndex: { type: 'integer' },
                },
              },
            },
            certificateLab: { $ref: '#/components/schemas/DiamondLab' },
            certificateNumber: { type: 'string', description: 'Grading report / certificate number' },
            certificatePdfUrl: { type: 'string', format: 'uri', description: 'Direct link to the certificate PDF' },
            tablePct: { type: 'number', format: 'float', description: 'Table percentage (%)' },
            depthPct: { type: 'number', format: 'float', description: 'Depth percentage (%)' },
            lengthMm: { type: 'number', format: 'float', description: 'Length in millimetres' },
            widthMm: { type: 'number', format: 'float', description: 'Width in millimetres' },
            depthMm: { type: 'number', format: 'float', description: 'Depth (height) in millimetres' },
            crownAngle: { type: 'number', format: 'float', description: 'Crown angle in degrees' },
            crownHeight: { type: 'number', format: 'float', description: 'Crown height percentage' },
            pavilionAngle: { type: 'number', format: 'float', description: 'Pavilion angle in degrees' },
            pavilionDepth: { type: 'number', format: 'float', description: 'Pavilion depth percentage' },
            girdle: { type: 'string', description: 'Girdle description (e.g. Medium, Slightly Thick)' },
            culetSize: { type: 'string', description: 'Culet size description (e.g. None, Small)' },
            eyeClean: { type: 'boolean', description: 'Whether the diamond is eye-clean (no inclusions visible to the naked eye)' },
            brown: { type: 'string', description: 'Brown tint level, if any (BGM flag)' },
            green: { type: 'string', description: 'Green tint level, if any (BGM flag)' },
            milky: { type: 'string', description: 'Milky/hazy level, if any (BGM flag)' },
            supplierName: { type: 'string', description: 'Supplier display name' },
            supplierLegalName: { type: 'string', description: 'Supplier legal entity name' },
            status: { type: 'string', enum: ['active', 'inactive', 'deleted'], description: 'Record lifecycle status (active = visible in search)' },
            sourceUpdatedAt: { type: 'string', format: 'date-time', description: 'Timestamp when the supplier last updated this record' },
            createdAt: { type: 'string', format: 'date-time', description: 'Timestamp when the record was first ingested' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Timestamp of last update to this record' },
            deletedAt: { type: 'string', format: 'date-time', description: 'Soft-delete timestamp (null = not deleted)' },
          },
        },
        DiamondSlim: {
          type: 'object',
          description: 'Card-view subset returned when fields=slim. Contains only the fields needed to render a search result card: id, feed, shape, carats, color, clarity, cut, fancyColor, fancyIntensity, labGrown, priceModelNzd, priceNzd, markupRatio, rating, availability, certificateLab, imageUrl, videoUrl, createdAt.',
          properties: {
            id: { type: 'string', format: 'uuid' },
            feed: { type: 'string' },
            shape: { $ref: '#/components/schemas/DiamondShape' },
            carats: { type: 'number', format: 'float' },
            color: { $ref: '#/components/schemas/DiamondColor' },
            clarity: { $ref: '#/components/schemas/DiamondClarity' },
            cut: { $ref: '#/components/schemas/DiamondCutGrade' },
            fancyColor: { $ref: '#/components/schemas/DiamondFancyColor' },
            fancyIntensity: { $ref: '#/components/schemas/DiamondFancyIntensity' },
            labGrown: { type: 'boolean' },
            priceModelNzd: { type: 'number', format: 'float' },
            priceNzd: { type: 'number', format: 'float' },
            markupRatio: { type: 'number', format: 'float' },
            rating: { type: 'number' },
            availability: { $ref: '#/components/schemas/DiamondAvailability' },
            certificateLab: { $ref: '#/components/schemas/DiamondLab' },
            imageUrl: { type: 'string', format: 'uri' },
            videoUrl: { type: 'string', format: 'uri' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        PaginatedDiamondResponse: {
          type: 'object',
          description: 'Paginated list of diamonds.',
          required: ['data', 'pagination'],
          properties: {
            data: {
              type: 'array',
              description: 'Array of Diamond objects (full schema when fields=full) or DiamondSlim objects (when fields=slim).',
              items: {
                oneOf: [
                  { $ref: '#/components/schemas/Diamond' },
                  { $ref: '#/components/schemas/DiamondSlim' },
                ],
              },
            },
            pagination: {
              type: 'object',
              required: ['page', 'limit', 'total', 'totalPages'],
              properties: {
                page: { type: 'integer', example: 1 },
                limit: { type: 'integer', example: 50 },
                total: { type: 'integer', description: 'Total number of matching diamonds', example: 4382 },
                totalPages: { type: 'integer', example: 88 },
              },
            },
          },
          example: {
            data: [
              {
                id: '550e8400-e29b-41d4-a716-446655440000',
                shape: 'ROUND',
                carats: 1.52,
                color: 'G',
                clarity: 'VS1',
                cut: 'EX',
                priceModelNzd: 12500,
                availability: 'available',
              },
            ],
            pagination: { page: 1, limit: 50, total: 4382, totalPages: 88 },
          },
        },
      },
    },
  },
  // Use glob pattern to match both .ts (dev) and .js (production)
  apis: [path.join(__dirname, '../routes/diamonds.{ts,js}')],
};

const spec = swaggerJsdoc(options);

const outputPath = path.join(__dirname, '../../../../swagger.json');
fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));

console.log(`Swagger spec generated at ${outputPath}`);

export { spec };

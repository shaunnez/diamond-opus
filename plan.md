# Diamond E-Commerce Storefront — Implementation Plan

## Overview

A standalone "Shopify-like" storefront app for customers to browse, filter, view, hold, and purchase diamonds. Inspired by the Four Words (fourwords.co.nz) design aesthetic — modern, minimal luxury with warm tones, clean typography, and generous whitespace. Only diamonds with `feed = 'demo'` support hold/purchase actions.

## Tech Stack (mirrors dashboard)

- **React 18** + **TypeScript**
- **Vite 5** (dev server + build)
- **Tailwind CSS 3** (styling)
- **React Router v6** (client-side routing)
- **TanStack React Query 5** (data fetching + caching)
- **Axios** (HTTP client)
- **Lucide React** (icons)

New app at `apps/storefront/` — registered as `@diamond/storefront` workspace.

## Design Theme (Four Words Inspired)

Four Words is a NZ custom jewellery brand with a modern, understated luxury aesthetic — approachable rather than pretentious, design-forward but warm.

**Color Palette:**
- Background: warm off-white `#FAF9F7`
- Surface/cards: white `#FFFFFF` with subtle shadow
- Primary text: charcoal `#1A1A1A`
- Secondary text: warm gray `#6B6B6B`
- Accent/CTA: warm gold `#B8860B` (dark goldenrod)
- Accent hover: `#9A7209`
- Borders: light warm gray `#E8E5E0`
- Success: muted green `#2D6A4F`
- Hold/warning: warm amber `#D4A017`
- Error/sold: muted rose `#9B2335`

**Typography:**
- Headings: serif font (Playfair Display or similar — elegant, editorial)
- Body: clean sans-serif (Inter — modern, highly readable)
- Generous letter-spacing on headings, slightly relaxed line-height

**Layout Principles:**
- Generous whitespace and breathing room
- Full-width hero/header, contained max-width content (~1280px)
- Subtle animations (fade-in on scroll, hover lift on cards)
- Mobile-first responsive design

## Pages & Routes

### 1. Home / Diamond Search (`/`)
- Clean header with brand name/logo and minimal nav
- Filter sidebar (desktop) / slide-out drawer (mobile)
- Diamond grid (3 columns desktop, 2 tablet, 1 mobile)
- Sort dropdown (price, carats, color, clarity, newest)
- Pagination at bottom
- Total results count

### 2. Diamond Detail (`/diamonds/:id`)
- Large media section (video/image)
- Diamond specs in organized sections
- Price display (NZD prominent, USD secondary)
- Action buttons: Hold / Purchase / Cancel Hold
- Certificate link
- Back to search breadcrumb

### 3. Simple static pages
- Header/footer present on all pages

## Filter System (from API search params)

All filters map to `GET /api/v2/diamonds` query parameters. The storefront will always include `feed=demo` (hardcoded filter — only demo feed diamonds are shown).

### Visual Shape Picker (with SVG graphics)
- Round, Oval, Emerald, Cushion, Radiant, Princess, Pear, Marquise, Asscher, Heart
- Each shape rendered as a clean SVG icon in a selectable chip
- Multi-select supported

### Slider/Range Filters
- **Carat**: 0.2 — 10.0 (dual-range slider)
- **Price (NZD)**: min — max (dual-range slider)
- **Table %**: 50 — 80
- **Depth %**: 55 — 75

### Multi-Select Chip Filters
- **Color**: D, E, F, G, H, I, J, K, L, M (chips)
- **Clarity**: FL, IF, VVS1, VVS2, VS1, VS2, SI1, SI2, I1, I2, I3
- **Cut**: Excellent, Very Good, Good, Fair, Poor
- **Polish**: Excellent, Very Good, Good, Fair, Poor
- **Symmetry**: Excellent, Very Good, Good, Fair, Poor
- **Fluorescence**: None, Faint, Medium, Strong, Very Strong
- **Lab**: GIA, AGS, IGI, HRD, etc.

### Toggle Filters
- **Lab Grown**: toggle (default: show all)
- **Eye Clean**: toggle
- **No BGM** (no brown/green/milky): toggle

### Advanced Filters (collapsible "Advanced" section)
- Ratio (L/W): min — max
- Crown Angle: min — max
- Pavilion Angle: min — max
- Length/Width/Depth (mm): min — max
- Fancy Color, Fancy Intensity (multi-select)

## Diamond Card Component

Each card in the grid shows:
- **Media**: v360 video iframe (interactive) if `videoUrl` exists, otherwise `imageUrl`, otherwise a placeholder SVG of the shape
- **Shape + Carats**: e.g. "Round 1.52ct"
- **Specs line**: e.g. "D · VVS1 · Excellent"
- **Price**: NZD price (prominent), USD secondary
- **Availability badge**: Available (green) / On Hold (amber) / Sold (rose)
- **Lab badge**: "GIA" etc. small chip
- Hover: subtle lift shadow + slight scale
- Click anywhere on card → navigates to detail page

## Diamond Detail Page

### Media Section (left/top on mobile)
- Large v360 video player (iframe) or image
- Full-width on mobile, ~60% on desktop

### Info Section (right/bottom on mobile)
- **Title**: Shape + Carats (e.g. "Oval 2.01ct")
- **Price block**: NZD price large, price per carat below
- **Availability status** with colored badge
- **Action buttons**:
  - "Place on Hold" (if available, feed=demo)
  - "Purchase" (if available or on_hold, feed=demo)
  - "Cancel Hold" (if on_hold and has hold_id, feed=demo)
  - Disabled state with tooltip for non-demo diamonds
- **Specifications grid** (2-column):
  - Shape, Carats, Color, Clarity, Cut, Polish, Symmetry
  - Fluorescence, Lab Grown (yes/no), Treated (yes/no)
  - Certificate: Lab + Number (link to PDF if available)
  - Ratio, Table %, Depth %
- **Measurements** (expandable):
  - Length, Width, Depth (mm)
  - Crown Angle, Pavilion Angle
  - Girdle, Culet
- **Additional Attributes** (expandable):
  - Eye Clean, BGM indicators
  - Country of Origin, Mine of Origin
  - Supplier info

### Hold/Purchase Flow
- **Hold**: POST `/api/v2/diamonds/:id/hold` → show success with hold expiry date, or denial message
- **Purchase**: POST `/api/v2/diamonds/:id/purchase` with idempotency key → confirmation modal first, then success/error feedback
- **Cancel Hold**: POST `/api/v2/nivoda/cancel-hold` with hold_id → confirmation modal, then refresh availability
- All actions trigger availability re-check after completion

## API Integration

### Endpoints Used
| Action | Method | Endpoint |
|--------|--------|----------|
| Search diamonds | GET | `/api/v2/diamonds?feed=demo&...filters` |
| Get diamond | GET | `/api/v2/diamonds/:id` |
| Check availability | POST | `/api/v2/diamonds/:id/availability` |
| Place hold | POST | `/api/v2/diamonds/:id/hold` |
| Purchase | POST | `/api/v2/diamonds/:id/purchase` |
| Cancel hold | POST | `/api/v2/nivoda/cancel-hold` |

### Auth
- API key stored in localStorage (same pattern as dashboard)
- Simple login page to enter API key
- Key sent via `X-API-Key` header on all requests

## File Structure

```
apps/storefront/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css               # Tailwind imports + custom fonts + globals
    ├── api/
    │   ├── client.ts           # Axios instance with API key auth
    │   └── diamonds.ts         # Search, detail, hold, purchase, cancel
    ├── components/
    │   ├── layout/
    │   │   ├── Header.tsx      # Nav bar with brand + login state
    │   │   ├── Footer.tsx      # Simple footer
    │   │   └── Layout.tsx      # Wrapper with header + footer
    │   ├── diamonds/
    │   │   ├── DiamondCard.tsx  # Grid card component
    │   │   ├── DiamondGrid.tsx  # Responsive grid container
    │   │   ├── DiamondMedia.tsx # V360 video or image with fallback
    │   │   ├── DiamondSpecs.tsx # Specifications grid
    │   │   ├── DiamondActions.tsx # Hold/Purchase/Cancel buttons
    │   │   └── ShapeSvg.tsx    # SVG icons for each diamond shape
    │   ├── filters/
    │   │   ├── FilterPanel.tsx  # Full filter sidebar/drawer
    │   │   ├── ShapePicker.tsx  # Visual shape selector with SVGs
    │   │   ├── RangeSlider.tsx  # Dual-thumb range slider
    │   │   ├── ChipSelect.tsx   # Multi-select chip group
    │   │   └── ToggleFilter.tsx # Boolean toggle
    │   └── ui/
    │       ├── Badge.tsx        # Status badges
    │       ├── Button.tsx       # Styled buttons
    │       ├── Modal.tsx        # Confirmation modals
    │       ├── Spinner.tsx      # Loading indicator
    │       └── Pagination.tsx   # Page navigation
    ├── hooks/
    │   ├── useAuth.ts          # API key management
    │   ├── useDiamondSearch.ts # Search with React Query + URL sync
    │   └── useDiamondActions.ts # Hold/purchase mutations
    ├── pages/
    │   ├── SearchPage.tsx      # Home — filters + grid
    │   ├── DiamondDetailPage.tsx # Single diamond view
    │   └── LoginPage.tsx       # API key entry
    ├── types/
    │   └── diamond.ts          # Frontend type definitions
    └── utils/
        ├── format.ts           # Price formatting, carat display
        └── shapes.ts           # Shape SVG path data
```

## Implementation Order

1. **Scaffold**: Create app, configs (vite, tailwind, tsconfig, package.json), index.html, entry point
2. **Theme & Layout**: Tailwind theme config, global styles, fonts, Header, Footer, Layout
3. **API Layer**: Axios client, diamond API functions, types
4. **Auth**: Login page, useAuth hook, protected route wrapper
5. **Shape SVGs**: Create clean SVG icons for all 10+ diamond shapes
6. **Filter Components**: ShapePicker, RangeSlider, ChipSelect, ToggleFilter, FilterPanel
7. **Diamond Card & Grid**: DiamondCard, DiamondMedia (v360 + fallback), DiamondGrid
8. **Search Page**: Wire filters → API → grid with React Query, URL state sync, pagination, sorting
9. **Diamond Detail Page**: Media section, specs, measurements, attributes
10. **Diamond Actions**: Hold, purchase, cancel-hold with confirmation modals and feedback
11. **Polish**: Loading states, empty states, error handling, responsive tweaks, animations
12. **Workspace Integration**: Add to root package.json scripts, verify build

## Notes

- The v360 video URLs are typically iframe-embeddable links — we'll render them in an `<iframe>` that allows user interaction (rotate, zoom)
- Filter state syncs to URL query params so searches are shareable/bookmarkable
- All search requests include `feed=demo` filter to scope to demo diamonds only
- Hold/purchase/cancel actions only enabled for demo feed diamonds (checked via `diamond.feed === 'demo'`)
- NZD pricing uses the `priceNzd` field from the API (already computed server-side)

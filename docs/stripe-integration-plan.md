# Stripe Payment Integration Plan

## Context

The storefront currently has a "Purchase" button on the diamond detail page that directly places an order with the feed adapter (Nivoda/demo). There is no payment collection step — clicking "Confirm Purchase" immediately calls the feed's `createOrder` endpoint.

**Goal:** Add Stripe Checkout so users pay before the feed order is placed. After payment, the webhook attempts the feed order. If the feed order fails, the customer sees "Payment successful, order processing" (never sees the error), the errors Slack channel is notified, and the dashboard clearly shows the order needs attention.

**Decisions:**
- **Stripe Checkout** (redirect to Stripe-hosted page) — simplest, PCI-compliant
- **Currency:** NZD (matching displayed `priceModelNzd`)
- **UX:** Replace the existing Purchase button flow (minimal UI change)
- **Order number:** Sequential `DO-YYYYMMDD-NNNN` assigned at checkout creation, traceable end-to-end
- **Error handling:** Feed order failures are silent to customer, surfaced via Slack + dashboard

---

## Flow

```
Purchase button → Confirmation modal ("Confirm & Pay")
  → POST /api/v2/checkout/create { diamond_id }
  → API: validate diamond, generate order number, create purchase_history (pending_payment),
         create Stripe Checkout Session with order_number as client_reference_id
  → Return { checkoutUrl, orderNumber }
  → Frontend redirects to Stripe Checkout URL

  → User pays on Stripe
  → Stripe redirects to /checkout/success?order=DO-20260220-0042
  → Success page shows: "Payment Successful — Order DO-20260220-0042" (always optimistic)

  → Stripe fires checkout.session.completed webhook
  → Webhook: verify signature
         → update status=paid, payment_status=paid
         → attempt adapter.createOrder()
            → SUCCESS: status=confirmed, feed_order_status=success, diamond=sold
            → FAILURE: status=paid, feed_order_status=failed, Slack #errors notified
  → Webhook always returns 200

  → Dashboard Orders page shows order with payment/feed status badges
     → Rows with payment=paid + feed_order=failed are highlighted for attention
```

---

## Status Model

Replaces the existing `pending | confirmed | failed | cancelled` with a split model:

| Column | Values | Purpose |
|--------|--------|---------|
| `status` | `pending_payment`, `paid`, `confirmed`, `failed`, `expired`, `cancelled` | Overall order lifecycle |
| `payment_status` | `pending`, `paid`, `failed`, `expired`, `refunded` | Stripe payment state |
| `feed_order_status` | `not_attempted`, `pending`, `success`, `failed` | Feed/supplier order state |

**Transitions:**
```
Checkout created       → status=pending_payment  payment_status=pending  feed_order_status=not_attempted
Payment succeeds       → status=paid             payment_status=paid     feed_order_status=pending
Feed order succeeds    → status=confirmed        payment_status=paid     feed_order_status=success
Feed order fails       → status=paid             payment_status=paid     feed_order_status=failed ← needs attention
Checkout expires       → status=expired          payment_status=expired  feed_order_status=not_attempted
```

The critical "needs attention" state: `status=paid` + `feed_order_status=failed` — payment went through but the feed order could not be placed.

---

## Implementation Steps

### Step 1 — Database Migration

**New file:** `sql/migrations/009_stripe_payments.sql`

```sql
-- Order number sequence
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1 INCREMENT BY 1 NO MAXVALUE CACHE 1;

-- Generate order number function
CREATE OR REPLACE FUNCTION generate_order_number() RETURNS text AS $$
DECLARE seq_val bigint;
BEGIN
  seq_val := nextval('order_number_seq');
  RETURN 'DO-' || to_char(NOW() AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' || lpad(seq_val::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- New columns on purchase_history
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS order_number text UNIQUE;
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS feed_order_status text NOT NULL DEFAULT 'not_attempted';
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text UNIQUE;
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS amount_cents integer;
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS currency text DEFAULT 'nzd';
ALTER TABLE purchase_history ADD COLUMN IF NOT EXISTS feed_order_error text;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_history_order_number ON purchase_history(order_number);
CREATE INDEX IF NOT EXISTS idx_purchase_history_stripe_session ON purchase_history(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_needs_attention
  ON purchase_history(payment_status, feed_order_status)
  WHERE payment_status = 'paid' AND feed_order_status = 'failed';
```

**Also modify:** `sql/full_schema.sql` — add same columns to the `CREATE TABLE purchase_history` definition.

### Step 2 — Install Dependencies

```bash
npm install -w packages/api stripe
npm install -w apps/storefront @stripe/stripe-js
```

### Step 3 — Environment Variables

**Modify:** `.env.example` — append:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STOREFRONT_URL=http://localhost:5174
```

### Step 4 — Shared Types

**Modify:** `packages/shared/src/types/api.ts`

Update `PurchaseHistory` interface:
```typescript
export interface PurchaseHistory {
  id: string;
  orderNumber?: string;                    // NEW — DO-YYYYMMDD-NNNN
  diamondId: string;
  feed: string;
  feedOrderId?: string;
  offerId: string;
  idempotencyKey: string;
  status: 'pending_payment' | 'paid' | 'confirmed' | 'failed' | 'expired' | 'cancelled';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';      // NEW
  feedOrderStatus: 'not_attempted' | 'pending' | 'success' | 'failed';        // NEW
  stripeCheckoutSessionId?: string;        // NEW
  stripePaymentIntentId?: string;          // NEW
  amountCents?: number;                    // NEW
  currency?: string;                       // NEW
  feedOrderError?: string;                 // NEW — stored for dashboard/debugging
  reference?: string;
  comments?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Step 5 — Slack Notification Categories

**Modify:** `packages/shared/src/utils/slack.ts`

Add to `NotifyCategory` enum:
```typescript
// Orders
ORDER_FEED_FAILURE = 'order_feed_failure',
ORDER_COMPLETED = 'order_completed',
```

Add to `CATEGORY_CHANNEL_MAP`:
```typescript
[NotifyCategory.ORDER_FEED_FAILURE]: NotifyChannel.ERRORS,   // Needs immediate attention
[NotifyCategory.ORDER_COMPLETED]: NotifyChannel.OPS,          // Informational
```

Add to `CATEGORY_COLOR_MAP`:
```typescript
[NotifyCategory.ORDER_FEED_FAILURE]: '#dc3545',  // Red — error
[NotifyCategory.ORDER_COMPLETED]: '#28a745',      // Green — success
```

### Step 6 — Database Queries

**Modify:** `packages/database/src/queries/history.ts`

Update `PurchaseHistoryRow` interface to include all new columns:
```typescript
interface PurchaseHistoryRow {
  // ... existing fields ...
  order_number: string | null;
  payment_status: string;
  feed_order_status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  amount_cents: number | null;
  currency: string | null;
  feed_order_error: string | null;
}
```

Update `mapRowToPurchaseHistory()` to map the new fields.

Add new functions:

```typescript
// Create purchase with generated order number (called from checkout/create)
export async function createCheckoutPurchase(params: {
  diamondId: string; feed: string; offerId: string; idempotencyKey: string;
  stripeCheckoutSessionId: string; amountCents: number; currency: string;
  reference?: string; comments?: string;
}): Promise<PurchaseHistory>
// INSERT with generate_order_number(), status='pending_payment',
//   payment_status='pending', feed_order_status='not_attempted'

// Lookup by Stripe session ID (called from webhook)
export async function getPurchaseByStripeSessionId(sessionId: string): Promise<PurchaseHistory | null>

// Payment confirmed — update Stripe fields (called from webhook step 1)
export async function updatePurchasePaymentCompleted(
  id: string, paymentIntentId: string
): Promise<void>
// SET status='paid', payment_status='paid', feed_order_status='pending'

// Feed order succeeded (called from webhook step 2 on success)
export async function updatePurchaseFeedOrderSuccess(
  id: string, feedOrderId: string
): Promise<void>
// SET status='confirmed', feed_order_status='success', feed_order_id=$2

// Feed order failed (called from webhook step 2 on failure)
export async function updatePurchaseFeedOrderFailed(
  id: string, errorMessage: string
): Promise<void>
// SET feed_order_status='failed', feed_order_error=$2 (status stays 'paid')

// Checkout expired (called from webhook on checkout.session.expired)
export async function updatePurchaseExpired(id: string): Promise<void>
// SET status='expired', payment_status='expired'
```

The existing `getPurchaseHistoryList()` uses `SELECT *` so it automatically picks up the new columns — no change needed to the query itself, only to the row mapping.

### Step 7 — API: Stripe Service

**New file:** `packages/api/src/services/stripe.ts`

- Initialize `Stripe` client with `process.env.STRIPE_SECRET_KEY`
- `createCheckoutSession(params)` — wraps `stripe.checkout.sessions.create()`
- `constructWebhookEvent(rawBody, signature)` — wraps `stripe.webhooks.constructEvent()`

### Step 8 — API: Zod Validators

**New file:** `packages/api/src/validators/payments.ts`

```typescript
export const createCheckoutSchema = z.object({
  diamond_id: z.string().uuid(),
  reference: z.string().optional(),
  comments: z.string().optional(),
});
```

**Modify:** `packages/api/src/validators/index.ts` — add `export * from './payments.js'`

### Step 9 — API: Checkout Route

**New file:** `packages/api/src/routes/checkout.ts`

**`POST /api/v2/checkout/create`** (auth required):
1. Validate body with `createCheckoutSchema`
2. Fetch diamond by `diamond_id` via `getDiamondById()`, verify exists and `availability === 'available'`
3. Check live availability via `getTradingAdapter(diamond.feed).checkAvailability(diamond)`
4. Compute NZD amount: `amountCents = Math.round((diamond.priceModelNzd ?? diamond.priceNzd) * 100)` — fail if no valid NZD price
5. Generate idempotency key: `stripe-${diamondId}-${Date.now()}`
6. Call `createCheckoutPurchase(...)` — returns record with generated `order_number`
7. Create Stripe Checkout Session:
   - `mode: 'payment'`, `currency: 'nzd'`
   - `client_reference_id: orderNumber` (shows on Stripe dashboard)
   - `line_items`: 1 item — `{shape} {carats}ct Diamond`, amountCents, qty 1
   - `metadata: { diamond_id, purchase_id, order_number }`
   - `success_url: ${STOREFRONT_URL}/checkout/success?order=${orderNumber}`
   - `cancel_url: ${STOREFRONT_URL}/diamonds/${diamondId}`
8. Return `{ checkoutUrl: session.url, orderNumber }`

Reuse the `getTradingAdapter()` helper from the existing `diamonds.ts` route by extracting it to a shared utility, or duplicate it in the checkout route (it's a small function).

### Step 10 — API: Webhook Route

**New file:** `packages/api/src/routes/webhooks.ts`

**`POST /api/v2/webhooks/stripe`** (NO auth middleware — uses Stripe signature):
1. `constructWebhookEvent(req.rawBody, req.headers['stripe-signature'])` — reject 400 on invalid
2. Switch on `event.type`:

**`checkout.session.completed`:**
  a. Lookup: `getPurchaseByStripeSessionId(session.id)` — if not found or already `confirmed`, return 200
  b. Update payment: `updatePurchasePaymentCompleted(purchase.id, session.payment_intent)`
  c. Try feed order:
  ```typescript
  try {
    const diamond = await getDiamondById(purchase.diamondId);
    const adapter = getTradingAdapter(diamond.feed);
    const result = await adapter.createOrder(diamond, {
      reference: purchase.orderNumber,
      comments: purchase.comments,
    });
    await updatePurchaseFeedOrderSuccess(purchase.id, result.id);
    await updateDiamondAvailability(diamond.id, 'sold');
    await notify({
      category: NotifyCategory.ORDER_COMPLETED,
      title: 'Order Completed',
      message: `Order ${purchase.orderNumber} confirmed.`,
      context: { orderNumber: purchase.orderNumber, feed: diamond.feed },
    });
  } catch (feedError) {
    await updatePurchaseFeedOrderFailed(
      purchase.id,
      feedError instanceof Error ? feedError.message : String(feedError)
    );
    await notify({
      category: NotifyCategory.ORDER_FEED_FAILURE,
      title: 'Feed Order Failed After Payment',
      message: `Payment succeeded for ${purchase.orderNumber} but feed order failed. Manual intervention required.`,
      context: {
        orderNumber: purchase.orderNumber,
        diamondId: purchase.diamondId,
        feed: purchase.feed,
        offerId: purchase.offerId,
      },
      error: feedError,
    });
  }
  ```
  d. Return 200 (always — even on feed failure, Stripe must get 200)

**`checkout.session.expired`:**
  a. Lookup purchase, if found: `updatePurchaseExpired(purchase.id)`
  b. Return 200

**Default:** return 200

### Step 11 — API: Route Registration

**Modify:** `packages/api/src/routes/index.ts`

```typescript
import checkoutRouter from './checkout.js';
import webhooksRouter from './webhooks.js';

// Webhook route — no auth (Stripe signature verification only)
router.use('/api/v2/webhooks', webhooksRouter);

// Checkout route — auth required
router.use('/api/v2/checkout', authMiddleware, checkoutRouter);
```

Webhook route registered **before** auth-protected routes, with no `authMiddleware`.

### Step 12 — Storefront: API Client

**Modify:** `apps/storefront/src/api/diamonds.ts`

Add:
```typescript
export async function createCheckout(
  diamondId: string
): Promise<{ checkoutUrl: string; orderNumber: string }> {
  const response = await api.post<{ data: { checkoutUrl: string; orderNumber: string } }>(
    '/checkout/create',
    { diamond_id: diamondId }
  );
  return response.data.data;
}
```

No `getPaymentStatus` needed — the success page does not poll (see Step 14).

### Step 13 — Storefront: Update DiamondActions

**Modify:** `apps/storefront/src/components/diamonds/DiamondActions.tsx`

1. Import `createCheckout` from API client
2. Replace `handlePurchase`:
   ```typescript
   const handlePurchase = async () => {
     clearMessages();
     setPurchaseModalOpen(false);
     try {
       const { checkoutUrl } = await createCheckout(diamond.id);
       window.location.href = checkoutUrl;
     } catch (err) {
       setErrorMessage(err instanceof Error ? err.message : 'Failed to start checkout');
     }
   };
   ```
3. Update modal copy:
   - Title: `"Confirm & Pay"`
   - Body: `"You'll be redirected to our secure payment provider to complete your purchase of this {shape} {carats} diamond for {price} NZD."`
   - Confirm button: `"Proceed to Payment"`
4. Remove the `purchaseDiamond` import and the direct purchase mutation from `useDiamondActions` (or keep for backward compat with demo feed — see note below)

**Note:** The existing `POST /api/v2/diamonds/purchase` endpoint remains unchanged for non-Stripe flows. The storefront simply stops calling it.

### Step 14 — Storefront: Success Page

**New file:** `apps/storefront/src/pages/CheckoutSuccessPage.tsx`

**No polling.** Always shows an optimistic message. If the feed order fails, the customer never sees it — the Slack notification handles it for the team.

```typescript
export function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const orderNumber = searchParams.get('order');

  return (
    <div className="max-w-content mx-auto px-4 py-16 text-center">
      <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
      <h1 className="font-serif text-3xl text-charcoal mb-2">Payment Successful</h1>
      {orderNumber && (
        <p className="text-lg text-warm-gray-600 mb-2">
          Order <span className="font-mono font-semibold">{orderNumber}</span>
        </p>
      )}
      <p className="text-warm-gray-500 mb-8">
        Your diamond order is being processed.
      </p>
      <Link to="/" className="btn-primary inline-block">
        Continue Shopping
      </Link>
    </div>
  );
}
```

### Step 15 — Storefront: Router Update

**Modify:** `apps/storefront/src/App.tsx`

Add route before the catch-all `*` route:
```tsx
<Route path="/checkout/success" element={
  <ProtectedRoute><Layout><CheckoutSuccessPage /></Layout></ProtectedRoute>
} />
```

### Step 16 — Dashboard: Update Orders Page

**Modify:** `apps/dashboard/src/api/analytics.ts`

Update `PurchaseHistoryItem` interface with new fields:
```typescript
export interface PurchaseHistoryItem {
  id: string;
  orderNumber?: string;          // NEW
  diamondId: string;
  feed: string;
  feedOrderId?: string;
  offerId: string;
  idempotencyKey: string;
  status: string;
  paymentStatus: string;         // NEW
  feedOrderStatus: string;       // NEW
  amountCents?: number;          // NEW
  currency?: string;             // NEW
  feedOrderError?: string;       // NEW
  reference?: string;
  comments?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Modify:** `apps/dashboard/src/pages/Orders.tsx`

Update table columns:

| Column | Shows |
|--------|-------|
| Order # | `order_number` displayed as-is (or truncated UUID fallback for old rows) |
| Feed | existing |
| Diamond | existing truncated UUID |
| Amount | `amountCents / 100` formatted with currency, e.g. "$1,234 NZD" |
| Payment | `payment_status` badge (paid=green, pending=yellow, expired/failed=red) |
| Feed Order | `feed_order_status` badge (success=green, pending=yellow, failed=red, n/a=gray) |
| Status | existing `status` badge (updated values) |
| Feed Order ID | existing |
| Created | existing |

Add row highlighting for "needs attention" state:
```typescript
<tr className={
  order.paymentStatus === 'paid' && order.feedOrderStatus === 'failed'
    ? 'bg-red-50 border-l-4 border-l-red-400' : ''
}>
```

Update `OrderStatusBadge` to handle new status values (`pending_payment`, `paid`, `expired`).

Add new `PaymentStatusBadge` and `FeedOrderStatusBadge` components.

### Step 17 — Shared Constants

**Modify:** `packages/shared/src/constants.ts`

No polling constants needed (success page is static). Nothing to add here unless needed later.

---

## Files Summary

| Action | File | What changes |
|--------|------|-------------|
| **New** | `sql/migrations/009_stripe_payments.sql` | Sequence, function, columns, indexes |
| **New** | `packages/api/src/services/stripe.ts` | Stripe client init, checkout session helper |
| **New** | `packages/api/src/routes/checkout.ts` | POST /checkout/create |
| **New** | `packages/api/src/routes/webhooks.ts` | POST /webhooks/stripe (signature-verified) |
| **New** | `packages/api/src/validators/payments.ts` | Zod schema for checkout |
| **New** | `apps/storefront/src/pages/CheckoutSuccessPage.tsx` | Static success page with order number |
| Modify | `sql/full_schema.sql` | Add new columns to purchase_history definition |
| Modify | `packages/shared/src/types/api.ts` | Update PurchaseHistory with new fields + statuses |
| Modify | `packages/shared/src/utils/slack.ts` | Add ORDER_FEED_FAILURE, ORDER_COMPLETED categories |
| Modify | `packages/api/package.json` | Add `stripe` dependency |
| Modify | `apps/storefront/package.json` | Add `@stripe/stripe-js` dependency |
| Modify | `packages/api/src/routes/index.ts` | Register checkout + webhook routes |
| Modify | `packages/api/src/validators/index.ts` | Export payment validators |
| Modify | `packages/database/src/queries/history.ts` | New row type fields, new query functions, updated mapper |
| Modify | `apps/storefront/src/api/diamonds.ts` | Add createCheckout() function |
| Modify | `apps/storefront/src/components/diamonds/DiamondActions.tsx` | Redirect to Stripe instead of direct purchase |
| Modify | `apps/storefront/src/App.tsx` | Add /checkout/success route |
| Modify | `apps/dashboard/src/api/analytics.ts` | Update PurchaseHistoryItem type |
| Modify | `apps/dashboard/src/pages/Orders.tsx` | New columns, badges, row highlighting |
| Modify | `.env.example` | Add Stripe env vars |

---

## Error Handling Summary

| Scenario | Customer sees | Team notified | DB state |
|----------|--------------|---------------|----------|
| Payment succeeds, feed order succeeds | "Payment Successful" (success page) | Slack #ops: ORDER_COMPLETED | status=confirmed, feed=success |
| Payment succeeds, feed order fails | "Payment Successful" (same page) | Slack #errors: ORDER_FEED_FAILURE with full context + stack trace | status=paid, feed=failed, feed_order_error populated |
| Checkout expires (user abandons) | Nothing (stays on Stripe or returns to diamond page) | None | status=expired |
| Webhook signature invalid | N/A | API logs 400 error | No change |

## Security Notes

- **Webhook signature verification** via `stripe.webhooks.constructEvent()` using `req.rawBody` (already captured in `server.ts:32-34`)
- **Webhook bypasses API key auth** — uses Stripe's signing scheme instead
- **Amount computed server-side** from `priceModelNzd` — client never sends price
- **Idempotency**: `stripe_checkout_session_id` UNIQUE constraint prevents duplicate orders; webhook checks existing status before processing
- **Order number generated server-side** via PostgreSQL sequence — cannot be guessed or tampered with
- **Feed errors never exposed to customer** — stored in `feed_order_error` for internal use only

## Verification

1. **Typecheck:** `npm run typecheck`
2. **Build:** `npm run build`
3. **Manual test with Stripe test keys:**
   - `stripe listen --forward-to localhost:3000/api/v2/webhooks/stripe` (forwards webhook events)
   - Start API: `npm run dev:api`, storefront: `npm run dev:storefront`
   - Navigate to diamond, click Purchase → Confirm & Pay
   - Verify redirect to Stripe Checkout with correct NZD amount and order number
   - Pay with test card `4242 4242 4242 4242`
   - Verify redirect to success page showing order number
   - Check API logs: webhook received, feed order placed
   - Check DB: `purchase_history` row with status=confirmed, order_number populated
   - Check dashboard /orders page: new columns visible
4. **Test feed failure path:**
   - Temporarily break the feed adapter (e.g. wrong credentials)
   - Complete a Stripe payment
   - Verify success page still shows "Payment Successful"
   - Verify Slack #errors receives ORDER_FEED_FAILURE notification
   - Verify dashboard shows row highlighted with payment=paid, feed_order=failed
   - Verify `feed_order_error` is populated in DB

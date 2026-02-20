import Stripe from 'stripe';

let _stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!_stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripeClient = new Stripe(key, { apiVersion: '2026-01-28.clover' });
  }
  return _stripeClient;
}

export interface CreateCheckoutSessionParams {
  orderNumber: string;
  purchaseId: string;
  diamondId: string;
  description: string;
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<Stripe.Checkout.Session> {
  return getStripeClient().checkout.sessions.create({
    mode: 'payment',
    currency: params.currency,
    client_reference_id: params.orderNumber,
    line_items: [
      {
        price_data: {
          currency: params.currency,
          product_data: {
            name: params.description,
          },
          unit_amount: params.amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      diamond_id: params.diamondId,
      purchase_id: params.purchaseId,
      order_number: params.orderNumber,
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

export function constructWebhookEvent(
  rawBody: string,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  return getStripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
}

import Stripe from 'stripe';
import { config } from '../../config/env';
import { db } from './pg';
import { purchases } from './schema';
import { v4 as uuidv4 } from 'uuid';
import { addCredits } from './users';
import { eq, sql } from 'drizzle-orm';

const stripe = new Stripe(config.stripeSecretKey || 'sk_test_placeholder');

export const CREDIT_PACKAGES = [
  { id: 'credits_100', credits: 100, price: 990, name: 'Starter' },
  { id: 'credits_500', credits: 500, price: 3990, name: 'Pro' },
  { id: 'credits_1000', credits: 1000, price: 6990, name: 'Business' },
  { id: 'credits_5000', credits: 5000, price: 24990, name: 'Enterprise' },
];

export async function createCheckoutSession(userId: string, packageId: string) {
  const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
  if (!pkg) throw new Error('Invalid package');

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${pkg.name} - ${pkg.credits} Credits`,
            description: `WebCastle.ai ${pkg.credits} API credits`,
          },
          unit_amount: pkg.price,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${config.publicUrl}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.publicUrl}/dashboard?canceled=true`,
    metadata: {
      userId,
      packageId,
      credits: pkg.credits.toString(),
    },
  });

  const id = uuidv4();
  await db.insert(purchases).values({
    id,
    userId,
    stripeSessionId: session.id,
    amountPaid: pkg.price / 100,
    creditsPurchased: pkg.credits,
    status: 'pending',
    createdAt: new Date(),
  });

  return session;
}

export async function handleStripeWebhook(payload: string, signature: string): Promise<void> {
  const webhookSecret = config.stripeWebhookSecret;
  if (!webhookSecret) {
    console.error('Stripe webhook secret not configured');
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    throw err;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { userId, credits } = session.metadata || {};

    if (userId && credits) {
      await db.update(purchases)
        .set({ 
          status: 'completed',
          completedAt: new Date(),
          stripePaymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        })
        .where(eq(purchases.stripeSessionId, session.id));

      addCredits(userId, parseInt(credits));
      console.log(`Added ${credits} credits to user ${userId}`);
    }
  }
}

export async function getPurchaseHistory(userId: string): Promise<any[]> {
  const result = await db.select({
    id: purchases.id,
    amountPaid: purchases.amountPaid,
    creditsPurchased: purchases.creditsPurchased,
    status: purchases.status,
    createdAt: purchases.createdAt,
    completedAt: purchases.completedAt,
  })
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .orderBy(sql`${purchases.createdAt} DESC`);

  return result.map(p => ({
    id: p.id,
    amountPaid: p.amountPaid,
    creditsPurchased: p.creditsPurchased,
    status: p.status,
    createdAt: p.createdAt.getTime(),
    completedAt: p.completedAt?.getTime() || null,
  }));
}

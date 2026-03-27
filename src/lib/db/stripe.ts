import Stripe from 'stripe';
import { config } from '../../config/env';
import { db } from './index';
import { v4 as uuidv4 } from 'uuid';
import { addCredits } from './users';

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
    success_url: `${config.publicUrl || 'http://localhost:3052'}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.publicUrl || 'http://localhost:3052'}/dashboard?canceled=true`,
    metadata: {
      userId,
      packageId,
      credits: pkg.credits.toString(),
    },
  });

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO purchases (id, user_id, stripe_session_id, amount_paid, credits_purchased, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `);
  stmt.run(id, userId, session.id, pkg.price / 100, pkg.credits, Date.now());

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
      const stmt = db.prepare(`
        UPDATE purchases SET status = 'completed', completed_at = ?, stripe_payment_intent = ?
        WHERE stripe_session_id = ?
      `);
      stmt.run(Date.now(), session.payment_intent, session.id);

      addCredits(userId, parseInt(credits));
      console.log(`Added ${credits} credits to user ${userId}`);
    }
  }
}

export function getPurchaseHistory(userId: string): any[] {
  const stmt = db.prepare(`
    SELECT id, amount_paid, credits_purchased, status, created_at as createdAt, completed_at as completedAt
    FROM purchases WHERE user_id = ? ORDER BY created_at DESC
  `);
  return stmt.all(userId);
}

import { pgTable, text, timestamp, integer, real, boolean, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
}, (table) => ({
  emailIdx: index('idx_users_email').on(table.email),
}));

export const credits = pgTable('credits', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at').notNull(),
}, (table) => ({
  userIdIdx: index('idx_credits_user').on(table.userId),
}));

export const purchases = pgTable('purchases', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stripeSessionId: text('stripe_session_id'),
  stripePaymentIntent: text('stripe_payment_intent'),
  amountPaid: real('amount_paid').notNull(),
  creditsPurchased: integer('credits_purchased').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at').notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  userIdIdx: index('idx_purchases_user').on(table.userId),
  sessionIdIdx: index('idx_purchases_session').on(table.stripeSessionId),
}));

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: text('key').unique().notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull(),
  lastUsedAt: timestamp('last_used_at'),
  isActive: boolean('is_active').default(true).notNull(),
  rateLimitMinute: integer('rate_limit_minute').default(60).notNull(),
  rateLimitDay: integer('rate_limit_day').default(5000).notNull(),
}, (table) => ({
  userIdIdx: index('idx_api_keys_user').on(table.userId),
  keyIdx: index('idx_api_keys_key').on(table.key),
}));

export const usageLogs = pgTable('usage_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  apiKeyId: text('api_key_id').references(() => apiKeys.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  creditsUsed: integer('credits_used').notNull(),
  latencyMs: integer('latency_ms'),
  statusCode: integer('status_code'),
  createdAt: timestamp('created_at').notNull(),
}, (table) => ({
  userIdIdx: index('idx_usage_logs_user').on(table.userId),
  createdAtIdx: index('idx_usage_logs_created').on(table.createdAt),
  endpointIdx: index('idx_usage_logs_endpoint').on(table.endpoint),
}));

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  plan: text('plan').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id'),
  status: text('status').notNull(),
  currentPeriodStart: timestamp('current_period_start').notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  creditsPerMonth: integer('credits_per_month').default(0).notNull(),
  createdAt: timestamp('created_at').notNull(),
  cancelledAt: timestamp('cancelled_at'),
}, (table) => ({
  userIdIdx: index('idx_subscriptions_user').on(table.userId),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Credit = typeof credits.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type UsageLog = typeof usageLogs.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;

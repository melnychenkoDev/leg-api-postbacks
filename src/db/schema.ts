import { pgTable, serial, text, timestamp, numeric, boolean, jsonb } from 'drizzle-orm/pg-core';

export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(), // REG, FTD, DEP, WTD
  trader_id: text('trader_id'),
  country: text('country'),
  sumdep: numeric('sumdep'),
  tg_id: text('tg_id'),
  click_id: text('click_id'),
  partner: text('partner'),
  created_at: timestamp('created_at').defaultNow(),
});

export const telegramRules = pgTable('telegram_rules', {
  id: serial('id').primaryKey(),
  partner: text('partner').notNull(),
  conversion_type: text('conversion_type'), // '*', 'REG', 'FTD', 'DEP', 'WTD'
  target_chat_id: text('target_chat_id').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});

export const telegramChats = pgTable('telegram_chats', {
  id: serial('id').primaryKey(),
  chat_id: text('chat_id').notNull().unique(),
  title: text('title'),
  type: text('type'), // channel | group | supergroup
  is_active: boolean('is_active').default(true),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  tg_id: text('tg_id').notNull().unique(),
  role: text('role').notNull().default('admin'), // superadmin | admin | viewer
  name: text('name'),
  permissions: jsonb('permissions'), // override role defaults
  created_at: timestamp('created_at').defaultNow(),
});

export const adminLogs = pgTable('admin_logs', {
  id: serial('id').primaryKey(),
  admin_tg_id: text('admin_tg_id').notNull(),
  action: text('action').notNull(),
  details: jsonb('details'),
  created_at: timestamp('created_at').defaultNow(),
});

export const apiTokens = pgTable('api_tokens', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  token: text('token').notNull().unique(),
  permissions: jsonb('permissions').default(['read_leads']),
  created_by: text('created_by'),
  is_active: boolean('is_active').default(true),
  last_used_at: timestamp('last_used_at'),
  created_at: timestamp('created_at').defaultNow(),
});

export const analyticsIntegrations = pgTable('analytics_integrations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  webhook_url: text('webhook_url').notNull(),
  events: jsonb('events').default(['*']),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at').defaultNow(),
});

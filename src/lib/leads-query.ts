import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { leads } from '../db/schema.js';

export interface LeadFilters {
  date_from?: string;
  date_to?: string;
  country?: string;
  tg_id?: string;
  trader_id?: string;
  click_id?: string;
  partner?: string;
  type?: string;
}

export async function queryLeads(filters: LeadFilters = {}) {
  const conditions = [];

  if (filters.date_from) conditions.push(gte(leads.created_at, new Date(filters.date_from)));
  if (filters.date_to) conditions.push(lte(leads.created_at, new Date(filters.date_to)));
  if (filters.country) conditions.push(eq(leads.country, filters.country));
  if (filters.tg_id) conditions.push(eq(leads.tg_id, filters.tg_id));
  if (filters.trader_id) conditions.push(eq(leads.trader_id, filters.trader_id));
  if (filters.click_id) conditions.push(eq(leads.click_id, filters.click_id));
  if (filters.partner) conditions.push(eq(leads.partner, filters.partner));
  if (filters.type) conditions.push(eq(leads.type, filters.type));

  const query = db.select().from(leads).orderBy(desc(leads.created_at));

  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }

  return query;
}

export function parseLeadFilters(query: Record<string, unknown>): LeadFilters {
  const pick = (key: keyof LeadFilters) => {
    const value = query[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };

  return {
    date_from: pick('date_from'),
    date_to: pick('date_to'),
    country: pick('country'),
    tg_id: pick('tg_id'),
    trader_id: pick('trader_id'),
    click_id: pick('click_id'),
    partner: pick('partner'),
    type: pick('type'),
  };
}

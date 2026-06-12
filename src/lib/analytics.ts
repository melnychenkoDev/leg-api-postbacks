import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { analyticsIntegrations } from '../db/schema.js';

export interface LeadPayload {
  type: string;
  trader_id: string;
  country: string;
  sumdep: string;
  tg_id: string;
  click_id: string;
  partner: string;
  created_at?: Date;
}

export async function forwardToAnalytics(lead: LeadPayload) {
  try {
    const integrations = await db
      .select()
      .from(analyticsIntegrations)
      .where(eq(analyticsIntegrations.is_active, true));

    for (const integration of integrations) {
      const events = (integration.events as string[]) || ['*'];
      if (!events.includes('*') && !events.includes(lead.type)) continue;

      fetch(integration.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: lead.type,
          trader_id: lead.trader_id,
          country: lead.country,
          amount: lead.sumdep,
          tg_id: lead.tg_id,
          click_id: lead.click_id,
          partner: lead.partner,
          timestamp: lead.created_at?.toISOString() || new Date().toISOString(),
        }),
      }).catch((err) => console.error(`Analytics webhook ${integration.name} failed:`, err));
    }
  } catch (error) {
    console.error('Analytics forwarding error:', error);
  }
}

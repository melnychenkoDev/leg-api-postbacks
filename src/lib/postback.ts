import { eq } from 'drizzle-orm';
import TelegramBot from 'node-telegram-bot-api';
import { db } from '../db/index.js';
import { telegramRules } from '../db/schema.js';

export function formatPostbackMessage(params: {
  type: string;
  trader_id: string;
  country: string;
  sumdep: string;
  tg_id: string;
}) {
  const { type, trader_id, country, sumdep, tg_id } = params;

  if (type === 'REG') {
    return `☑️REG 🆔${trader_id} 🌍${country} 👥TG:${tg_id}`;
  }
  if (type === 'FTD') {
    return `✅FTD 💰${sumdep} 🆔${trader_id} 🌍${country} 👥TG:${tg_id}`;
  }
  if (type === 'DEP') {
    return `✅🔄DEP 💰${sumdep} 🆔${trader_id} 🌍${country} 👥TG:${tg_id}`;
  }
  if (type === 'WTD') {
    return `💸WTD 💰${sumdep} 🆔${trader_id} 🌍${country} 👥TG:${tg_id}`;
  }

  return `❓${type} 💰${sumdep} 🆔${trader_id} 🌍${country} 👥TG:${tg_id}`;
}

export async function routeTelegramNotifications(
  bot: TelegramBot | null,
  botToken: string,
  partner: string,
  type: string,
  text: string
) {
  if (!bot || !botToken) return;

  const rules = await db.select().from(telegramRules).where(eq(telegramRules.partner, partner));
  const sentChats = new Set<string>();

  for (const rule of rules) {
    if (rule.conversion_type !== '*' && rule.conversion_type !== type) continue;
    if (sentChats.has(rule.target_chat_id)) continue;

    try {
      await bot.sendMessage(rule.target_chat_id, text);
      sentChats.add(rule.target_chat_id);
    } catch (error) {
      console.error(`Error sending TG to ${rule.target_chat_id}:`, error);
    }
  }
}

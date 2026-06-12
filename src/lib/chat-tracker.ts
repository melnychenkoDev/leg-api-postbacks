import type TelegramBot from 'node-telegram-bot-api';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { telegramChats } from '../db/schema.js';

const ACTIVE_STATUSES = ['administrator', 'creator', 'member'];
const INACTIVE_STATUSES = ['left', 'kicked', 'restricted'];

async function upsertChat(chatId: string, title: string | null, type: string | null, isActive: boolean) {
  await db
    .insert(telegramChats)
    .values({ chat_id: chatId, title, type, is_active: isActive, updated_at: new Date() })
    .onConflictDoUpdate({
      target: telegramChats.chat_id,
      set: { title, type, is_active: isActive, updated_at: new Date() },
    });
}

export function registerChatTracker(bot: TelegramBot) {
  bot.on('my_chat_member', async (update: any) => {
    try {
      const chat = update.chat;
      const status: string = update.new_chat_member?.status || '';

      if (!chat || !['channel', 'group', 'supergroup'].includes(chat.type)) return;

      const chatId = String(chat.id);
      const title = chat.title || chat.username || chatId;

      if (ACTIVE_STATUSES.includes(status)) {
        await upsertChat(chatId, title, chat.type, true);
        console.log(`Chat tracked: ${title} (${chatId}) status=${status}`);
      } else if (INACTIVE_STATUSES.includes(status)) {
        await upsertChat(chatId, title, chat.type, false);
        console.log(`Chat deactivated: ${title} (${chatId}) status=${status}`);
      }
    } catch (error) {
      console.error('chat tracker error', error);
    }
  });

  bot.on('polling_error', (error: any) => {
    console.error('Telegram polling error:', error?.message || error);
  });
}

export async function listActiveChats() {
  return db.select().from(telegramChats).where(eq(telegramChats.is_active, true));
}

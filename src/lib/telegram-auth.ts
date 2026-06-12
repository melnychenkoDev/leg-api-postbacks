import { createHmac } from 'crypto';

export function verifyTelegramWebAppData(telegramInitData: string, botToken: string): any {
  try {
    const initData = new URLSearchParams(telegramInitData);
    const hash = initData.get('hash');
    
    if (!hash) return null;
    
    initData.delete('hash');
    
    const dataToCheck = [...initData.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');
      
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = createHmac('sha256', secretKey).update(dataToCheck).digest('hex');
    
    if (calculatedHash === hash) {
      // In a real widget login, it's slightly different, but the principle of verifying the hash
      // using the bot token stands.
      // Often Telegram Login Widget returns data where we check the sha256 of the bot token.
      
      const user = initData.get('user');
      if (user) {
         return JSON.parse(user);
      }
      return null;
    }
  } catch (e) {
    console.error("TG verify error", e);
  }
  return null;
}

export function verifyTelegramLoginWidget(data: any, botToken: string) {
    const { hash, ...userData } = data;
    
    const dataCheckString = Object.keys(userData)
        .sort()
        .map(key => `${key}=${userData[key]}`)
        .join('\n');
        
    const secretKey = createHmac('sha256', botToken).digest();
    const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    return calculatedHash === hash;
}

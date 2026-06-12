import { useEffect, useState } from 'react';

const TG_BOT_NAME = import.meta.env.VITE_TG_BOT_NAME || 'YOUR_BOT_USERNAME';

export function TelegramLoginWidget({ onAuth }: { onAuth: (user: any) => void }) {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', TG_BOT_NAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-auth-url', '');
    script.setAttribute('data-request-access', 'write');

    window.onTelegramAuth = function (user) {
      onAuth(user);
    };

    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    document.getElementById('telegram-login-container')?.appendChild(script);

    return () => {
      delete window.onTelegramAuth;
      const el = document.getElementById('telegram-login-container');
      if (el) el.innerHTML = '';
    };
  }, [onAuth]);

  return <div id="telegram-login-container" className="flex justify-center my-4"></div>;
}

declare global {
  interface Window {
    onTelegramAuth: (user: any) => void;
  }
}

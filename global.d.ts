import type { WebApp } from 'telegram-web-app';
// The Telegram WebApp object is injected globally by Telegram's script
// We check for its existence before use, as TypeScript types assume it exists
declare global {
  interface Window {
    Telegram: {
      WebApp: WebApp; // WebApp is the main interface provided by @types/telegram-web-app
    };
    setUpTelegramWebApp: VoidFunction;
  }
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      BOT_TOKEN?: string;
      WEB_APP_URL?: string;
      WL_PUBLIC_URL?: string;
      WL_COOKIE?: string;
      WL_MEMBERS_LIST?: string;
      CONTAINER_CONTROLLER?: string;
      VERCEL_PUBLIC_URL?: string;
      ADMIN?: string;
      ADMIN_ID?: string;
    }
  }
}

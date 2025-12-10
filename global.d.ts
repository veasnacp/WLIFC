import type { WebApp } from 'telegram-web-app';
// The Telegram WebApp object is injected globally by Telegram's script
// We check for its existence before use, as TypeScript types assume it exists
declare global {
  interface Window {
    Telegram: {
      WebApp: WebApp; // WebApp is the main interface provided by @types/telegram-web-app
    };
  }
}

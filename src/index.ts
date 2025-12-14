import TelegramBot from 'node-telegram-bot-api';
import { runBot } from './bot';

const isDev = process.env.NODE_ENV && process.env.NODE_ENV === 'development';
const port: number = parseInt(process.env.PORT || '3000', 10);
const token: string | undefined = process.env.BOT_TOKEN;
const WEBHOOK_PATH = `/webhook/${token}`;
const WEBHOOK_URL = `${process.env.VERCEL_URL}/webhook`;
const webAppUrl: string | undefined = process.env.WEB_APP_URL;
const WL_PUBLIC_URL: string | undefined = process.env.WL_PUBLIC_URL;

if (!token || !webAppUrl) {
  throw new Error(
    'BOT_TOKEN and WEB_APP_URL must be defined in the .env file.'
  );
}

// Initialize Telegram Bot
const bot = new TelegramBot(
  token,
  isDev ? { polling: true } : { webHook: true }
);
async function init() {
  const info = await bot.getWebHookInfo();
  if (info.url !== WEBHOOK_URL) {
    bot.setWebHook(WEBHOOK_URL);
  }
}

if (!isDev) {
  init();
}

runBot(bot, { webAppUrl });
export default bot;

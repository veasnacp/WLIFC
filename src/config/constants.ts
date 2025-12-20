export const NODE_ENV = process.env.NODE_ENV;
export const IS_DEV =
  process.env.NODE_ENV && process.env.NODE_ENV !== 'production';

export const VERCEL_URL = process.env.VERCEL_URL;
export const VERCEL_PUBLIC_URL = process.env.VERCEL_PUBLIC_URL;
export const PORT = parseInt(process.env.PORT || '3000', 10);
export const PUBLIC_URL = VERCEL_PUBLIC_URL
  ? VERCEL_PUBLIC_URL
  : `http://localhost:${PORT}`;

export const TOKEN = process.env.BOT_TOKEN;
export const WEB_APP_URL = process.env.WEB_APP_URL;

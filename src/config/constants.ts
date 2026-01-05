export const NODE_ENV = process.env.NODE_ENV;
export const IS_DEV = NODE_ENV && NODE_ENV === 'development';

export const VERCEL_PUBLIC_URL = process.env.VERCEL_PUBLIC_URL;
export const PORT = parseInt(process.env.PORT || '3000', 10);
export const PUBLIC_URL = VERCEL_PUBLIC_URL
  ? VERCEL_PUBLIC_URL
  : `http://localhost:${PORT}`;

export const TOKEN = process.env.BOT_TOKEN;
export const WEB_APP_URL = process.env.WEB_APP_URL;

export const WL_PUBLIC_URL = process.env.WL_PUBLIC_URL;
export const WL_LOGIN_URL = `${WL_PUBLIC_URL}/admin/index/login.html`;
export const WL_PRIVATE_API_PATH = process.env.WL_PRIVATE_API_PATH;
export const WL_PRIVATE_API = `${WL_PUBLIC_URL}${WL_PRIVATE_API_PATH}`;
export const WL_COOKIE = process.env.WL_COOKIE;

export const WL_MEMBERS_LIST = process.env.WL_MEMBERS_LIST;
export const ADMIN_LIST = process.env.ADMIN;
export const CONTAINER_CONTROLLER_LIST = process.env.CONTAINER_CONTROLLER;
export const WL_ALLOWED_MEMBERS = process.env.WL_ALLOWED_MEMBERS;

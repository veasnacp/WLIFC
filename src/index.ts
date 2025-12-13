import { Elysia } from 'elysia';
import { staticPlugin } from '@elysiajs/static';
import { html, Html } from '@elysiajs/html';
import { WLLogistic } from './wl/edit';
import { isNumber } from './utils/is';
import TelegramBot from 'node-telegram-bot-api';
import { runBot } from './bot';

const port: number = parseInt(process.env.PORT || '3000', 10);
const token: string | undefined = process.env.BOT_TOKEN;
const webAppUrl: string | undefined = process.env.WEB_APP_URL;
const WL_PUBLIC_URL: string | undefined = process.env.WL_PUBLIC_URL;

if (!token || !webAppUrl) {
  throw new Error(
    'BOT_TOKEN and WEB_APP_URL must be defined in the .env file.'
  );
}

// Initialize Telegram Bot
const bot = new TelegramBot(token, { polling: true });

const app = new Elysia()
  .use(
    staticPlugin({
      prefix: '/',
    })
  )
  .use(html())
  .get('/wl/*', async ({ params }) => {
    const logCode = params['*'];
    const isNumeric = isNumber(logCode);
    if (!isNumeric) {
      return { message: 'Invalid ID', errorCode: 1 };
    }
    const cookie = process.env.WL_COOKIE || '';
    const wl = new WLLogistic(logCode, cookie);
    const data = await wl.getDataFromLogCode();
    let photos = [] as string[];
    if (data && 'message' in data) {
      return { message: data.message, errorCode: 1 };
    }
    if (data && typeof data.warehousing_pic === 'string') {
      photos = wl.getPhotoFromData(data);
    }

    return {
      message: data ? 'successful' : 'failed',
      picLinks: photos,
      totalPic: photos.length,
      logCode: logCode,
      data: !data
        ? null
        : ({
            id: data.id,
            pid: data.pid,
            unit_price: data.unit_price,
            sub_order: data.sub_order,
            sub_total: data.sub_total,
            total: data.total,
            goods_name: data.goods_name,
            goods_number: data.goods_number,
            member_name: data.member_name,
            material: data.material,
            volume: data.volume,
            volume_record: data.volume_record,
            weight: data.weight,
            expresstracking: data.expresstracking,
            deliveryway: data.deliveryway,
            desc: data.desc,
          } as typeof data),
    };
  })
  .get('/static/*', async ({ path, query, set, redirect }) => {
    if (WL_PUBLIC_URL) {
      let queryString = Object.entries(query)
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
      queryString = queryString ? `?${queryString}` : '';
      const WL_URL = `${WL_PUBLIC_URL}${path}${queryString}`;
      let type = '';
      if (path.endsWith('.css')) {
        set.headers['Content-Type'] = 'text/css';
      } else if (path.endsWith('.js')) {
        set.headers['Content-Type'] = 'text/javascript';
        return redirect(WL_URL);
      } else if (
        ['png', 'jpg', 'jpeg', 'ico'].some((t) => {
          type = t;
          return path.endsWith('.' + type);
        })
      ) {
        set.headers['Content-Type'] = `image/${type}`;
        return redirect(WL_URL);
      }
      const data = await fetch(WL_URL)
        .then(async (r) => await r.text())
        .catch((err) => (err as Error).message);
      return data;
    }
    return 'testing_static';
  })
  .get('/admin/*', async ({ path, query, html, set, redirect }) => {
    if (WL_PUBLIC_URL) {
      let queryString = Object.entries(query)
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
      queryString = queryString ? `?${queryString}` : '';
      const WL_URL = `${WL_PUBLIC_URL}${path}${queryString}`;
      const data = await fetch(WL_URL)
        .then(async (r) => await r.text())
        .catch((err: Error) => {
          console.error(err.message);
          return err.message;
        });
      if (path.includes('/admin/verify/')) {
        return redirect(WL_URL);
      }
      return data
        .substring(0, 20)
        .toLowerCase()
        .trim()
        .startsWith('<!doctype html>')
        ? html(data)
        : data;
    }
    return 'testing_admin';
  })
  .get('/wl-admin', async () => {})
  .listen(port, ({ hostname, port }) => {
    console.log(`🦊 Elysia server listening at http://${hostname}:${port}`);
  });

runBot(bot, { webAppUrl });

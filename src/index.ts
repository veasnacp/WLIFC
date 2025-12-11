import { Elysia } from 'elysia';
import { staticPlugin } from '@elysiajs/static';
import { WLLogistic } from './wl/edit';
import { isNumber } from './utils/is';
import TelegramBot from 'node-telegram-bot-api';
import { runBot } from './bot';

const port: number = parseInt(process.env.PORT || '3000', 10);
const token: string | undefined = process.env.BOT_TOKEN;
const webAppUrl: string | undefined = process.env.WEB_APP_URL;

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
  .listen(port, ({ hostname, port }) => {
    console.log(`🦊 Elysia server listening at http://${hostname}:${port}`);
  });

runBot(bot, { webAppUrl });

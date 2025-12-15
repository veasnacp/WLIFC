import { Elysia, t } from 'elysia';
import { staticPlugin } from '@elysiajs/static';
import { html } from '@elysiajs/html';
import { WLLogistic } from './wl/edit';
import { isNumber } from './utils/is';
import TelegramBot from 'node-telegram-bot-api';
import { runBot } from './bot';
import {
  IS_DEV,
  PORT,
  PUBLIC_URL,
  TOKEN,
  WEB_APP_URL,
} from './config/constants';

const NODE_ENV = process.env.NODE_ENV;
const WEBHOOK_URL = `${PUBLIC_URL}/webhook`;
const webAppUrl = WEB_APP_URL;

if (!TOKEN || !webAppUrl) {
  throw new Error(
    'BOT_TOKEN and WEB_APP_URL must be defined in the .env file.'
  );
}

// Initialize Telegram Bot
const bot = new TelegramBot(
  TOKEN,
  IS_DEV ? { polling: true } : { webHook: true }
);
runBot(bot, { webAppUrl });

const app = new Elysia()
  .use(
    staticPlugin({
      prefix: '/',
    })
  )
  .use(html())
  // Health check endpoint
  .get('/api/health', () => ({
    status: 'healthy',
    service: 'Telegram WL Checker Bot',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  }))
  // Webhook info endpoint
  .get('/api/webhook-info', async () => {
    try {
      const info = await bot.getWebHookInfo();
      return {
        success: true,
        info,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  })
  // Set webhook endpoint
  .get('/api/set-webhook', async () => {
    try {
      await bot.setWebHook(WEBHOOK_URL);
      return {
        success: true,
        message: `Webhook set to ${WEBHOOK_URL}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  })
  // Delete webhook endpoint
  .get('/api/delete-webhook', async () => {
    try {
      const result = await bot.deleteWebHook();
      return {
        success: true,
        message: 'Webhook deleted',
        result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  })
  .post(
    'webhook',
    async ({ body, set }) => {
      set.status = 200;
      try {
        await (bot.processUpdate(
          body as TelegramBot.Update
        ) as any as Promise<void>);
        return { ok: true };
      } catch (error: any) {
        console.error('Error processing webhook:', error.message);
        return {
          ok: false,
          error: error.message,
        };
      }
    },
    {
      body: t.Any(),
    }
  )
  .get('/', ({ html }) => {
    return html('<b>Welcome to WL Checker!!!</b>');
  })
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
  .get('/wl/display-image', ({ query, html }) => {
    let { image = '', path = '' } = query;
    if (path.trim().startsWith('http')) {
      path = path.split('://')[1]?.trim() || '';
    }
    path = path.trim() ? `https://${path.trim()}/` : '';
    const noImage = /*html*/ `<span style="color:blue;font-size:18px;font-weight:bold;">No Image</span>`;
    let img = noImage;
    if (image.trim()) {
      const images = image
        .trim()
        .split(',')
        .filter((v) => Boolean(v.trim()));
      if (images.length) {
        img = ''.concat(
          images
            .map((p) => {
              return /*html*/ `<img src="${path.concat(
                p.trim()
              )}" width="500" height="500" style="width:100%;height:auto;">`;
            })
            .join('\n')
        );
      }
    }

    return html(
      /*html*/ `<div style="display:flex;gap:4px;padding:16px;flex-wrap:wrap;align-items:center;justify-content:center;">${img}</div>`
    );
  })
  // Handle 404
  .onError(({ code, error }) => {
    if (code === 'NOT_FOUND') {
      return {
        success: false,
        error: 'Endpoint not found',
        message: 'Check the API documentation at the root endpoint',
      };
    }
    console.error('Unhandled error:', error);
    return {
      success: false,
      error: 'Internal server error',
    };
  })
  .compile();

// Start server in development
if (IS_DEV) {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🌐 Webhook URL: ${WEBHOOK_URL}`);
    console.log(`📝 Set webhook: http://localhost:${PORT}/api/set-webhook`);
  });
}

export default app;

import { Elysia, file, t } from 'elysia';
import { staticPlugin } from '@elysiajs/static';
import { html } from '@elysiajs/html';
import crypto from 'crypto';

import { DataExpand, WLLogistic } from './wl/edit';
import { isNumber } from './utils/is';
import TelegramBot from 'node-telegram-bot-api';
import {
  cacheData,
  config,
  getValidationOptions,
  isMemberAsContainerController,
  runBot,
  ShowDataMessageAndPhotos,
} from './bot';
import {
  IS_DEV,
  PORT,
  PUBLIC_URL,
  TOKEN,
  WEB_APP_URL,
  WL_PUBLIC_URL,
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
  IS_DEV ? { polling: true } : { webHook: true, polling: false }
);

function validateTelegramData(initData: string, botToken: string) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');

  const dataCheckString = Array.from(urlParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return hmac === hash;
}

const app = new Elysia({
  serve: {
    idleTimeout: 60,
  },
  allowUnsafeValidationDetails: true,
})
  .use(
    staticPlugin({
      prefix: '/',
      alwaysStatic: true,
    })
  )
  .use(html())
  .onStart(async () => {
    if (!IS_DEV)
      try {
        await bot.setWebHook(WEBHOOK_URL, {
          max_connections: 40,
          // @ts-ignore
          drop_pending_updates: true,
        });
        console.log(`🚀 Webhook set to: ${WEBHOOK_URL}`);
      } catch (error) {
        console.error('❌ Failed to set webhook on startup:', error);
      }
  })
  .onStop(async () => {
    if (!IS_DEV)
      try {
        await bot.deleteWebHook();
        console.log('🛑 Webhook deleted. Bot shutting down safely.');
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
      }
  })
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
  .get('/api/set-webhook', async ({ query, request }) => {
    try {
      if (!process.env.ADMIN?.split(',').some((u) => u === query.user)) {
        throw new Error('Unauthenticated!');
      }
      const { protocol, host } = new URL(request.url);
      const WEBHOOK_URL = `${protocol}//${host}/webhook`;
      await bot.setWebHook(WEBHOOK_URL, {
        max_connections: 40,
        // @ts-ignore
        drop_pending_updates: true,
      });
      if (query.polling === 'false') {
        await bot.startPolling();
      }
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
  .get('/api/delete-webhook', async ({ query }) => {
    try {
      const result = await bot.deleteWebHook();
      if (query.polling === 'true') {
        await bot.startPolling();
      }
      return {
        success: true,
        message: 'Webhook deleted',
        result,
        timestamp: new Date().toISOString(),
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
  .post(
    '/api/submit-app-data',
    async ({ body, set }) => {
      let { initData, result, logCode, message_id, message } = body;
      message_id = isNumber(message_id)
        ? Number(message_id)
        : new Date().getTime();
      set.status = 200;

      // 1. Security Check
      if (!validateTelegramData(initData, TOKEN as string)) {
        return { success: false, error: 'Invalid data source' };
      }

      const urlParams = new URLSearchParams(initData);
      const user = JSON.parse(urlParams.get('user') || '{}');
      const chatId = user.id;

      if (message === 'not found') {
        await bot.sendMessage(chatId, `សូមព្យាយាមម្តងទៀត។`);
        return { success: true };
      }
      if (logCode)
        try {
          const asMemberContainerController =
            isMemberAsContainerController(user);
          const data = JSON.parse(result);
          const wl = new WLLogistic(logCode);
          // 3. Send message to Telegram chat
          const options = getValidationOptions(logCode, bot, chatId);
          if (typeof options === 'object') {
            await ShowDataMessageAndPhotos(
              bot,
              { chat: user, message_id: Number(message_id) } as any,
              data,
              wl,
              {
                logCode,
                isTrackingNumber: !!options.isTrackingNumber,
                hasSubLogCodeCache: options?.isSubLogCode,
                asMemberContainerController,
                // loadingMsgId,
                // withMore,
              }
            );
          }
        } catch (error: any) {
          console.error(error.message);
        }
      else {
        await bot.sendMessage(chatId, `Code is require.`);
      }

      return { success: true };
    },
    {
      body: t.Any(),
    }
  )
  .get('/', ({ html }) => {
    return html('<b>Welcome to WL Checker!!!</b>');
  })
  .get('/favicon.ico', () => file('./public/favicon.ico'))
  .get('/bot.js', () => file('./public/bot.js'))
  .get('/wl/set-cookie', async ({ query, set }) => {
    set.status = 200;
    let cookie = query.cookie || '';
    const hasCookie = Boolean(cookie);
    cookie = !cookie.startsWith('PHPSESSID=')
      ? 'PHPSESSID='.concat(cookie)
      : cookie;
    if (hasCookie) config.set('cookie', cookie);
    return { success: true, hasCookie };
  })
  .get('/wl/*', async ({ params, query, set }) => {
    set.status = 200;
    if (query.web === 'html') {
      return file('./public/web-app.html');
    }
    const logCode = params['*'];
    const isNumeric = isNumber(logCode);
    const isTrackingNumber = !logCode.startsWith('25');
    const isValidSmallPackageOrTrackingLogCode = logCode.startsWith('1757')
      ? logCode.length === 10
      : logCode.length >= 12 && logCode.length <= 16;
    if (
      (isTrackingNumber && !isValidSmallPackageOrTrackingLogCode) ||
      (!isTrackingNumber && !isNumeric && logCode.length !== 12)
    ) {
      return { message: 'Invalid ID', errorCode: 1 };
    }
    const showAllSmallPackage = query.showAll === 'true';
    const isSubLogCode =
      isTrackingNumber && !isValidSmallPackageOrTrackingLogCode;
    const cookie = config.get('cookie') || process.env.WL_COOKIE || '';
    const wl = new WLLogistic(logCode, cookie);

    let data: DataExpand | undefined;
    let _logCode = logCode;

    const _data = cacheData.get(_logCode) as typeof data;
    if (!_data && !isTrackingNumber) {
      data = cacheData.values().find((d) => {
        if (d.logcode === logCode) {
          _logCode = d.logcode;
        }
        return d;
      });
    }
    let refetchData = true;
    let hasSubLogCodeCache = false;
    if (
      _data &&
      typeof _data === 'object' &&
      Object.values(_data).length &&
      !('message' in _data)
    ) {
      refetchData = false;
      data = _data;
      if (showAllSmallPackage && !_data.smallPackageGoodsNames) {
        refetchData = true;
      }
    } else if (isSubLogCode) {
      const _data = [...cacheData.values()].find((d) =>
        d.sub_logcode?.includes(logCode)
      );
      if (_data && !('message' in _data)) {
        refetchData = false;
        data = _data;
        if (showAllSmallPackage && !_data.smallPackageGoodsNames) {
          refetchData = true;
        } else {
          hasSubLogCodeCache = true;
        }
      }
    }

    if (refetchData) {
      const wl_data = (await wl.getDataFromLogCode(
        undefined,
        showAllSmallPackage,
        isSubLogCode
      )) as typeof data;
      data = wl_data;
    }
    if (data && 'message' in data) {
      return { message: data.message, errorCode: 1 };
    }

    return {
      message: data && !('message' in data) ? 'successful' : 'failed',
      logCode,
      data,
    };
  })
  .get('/wl/display-image', ({ query, html }) => {
    let { image = '', path = '', wl = '' } = query;
    if (wl === 'true') {
      path = `${WL_PUBLIC_URL}/upload/`;
    } else {
      if (path.trim().startsWith('http')) {
        path = path.split('://')[1]?.trim() || '';
      }
      path = path.trim() ? `https://${path.trim()}/` : '';
    }
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
  // Fetch the external image
  .get('/blob/image', async ({ query, set }) => {
    let { url, wl } = query;
    try {
      if (!url?.trim()) {
        throw new Error('Image URL is require.');
      }
      if (wl === 'true') {
        url = `${WL_PUBLIC_URL}/upload/${url}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        set.status = 502;
        return 'Failed to fetch image from external source.';
      }
      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      console.log(
        'contentType',
        contentType,
        '===',
        response.headers.get('content-type')
      );
      set.headers['Content-Type'] = contentType;

      return response.arrayBuffer();
    } catch (error) {
      console.error('Error serving external image:', (error as Error).message);
      set.status = 500;
      return 'Internal Server Error';
    }
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
runBot(bot, { webAppUrl });

export default app;

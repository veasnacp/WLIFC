import express, { Request, Response, NextFunction } from 'express';
import * as path from 'path'; // Needed for serving static files
import TelegramBot from 'node-telegram-bot-api';
import { WLLogistic } from './wl/edit';
import { isNumber } from './utils/is';
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

const app = express();
const bot = new TelegramBot(token, { polling: true });

app.use(express.static('public'));

app.get('/wl/:logCodeId', async (req: Request, res: Response) => {
  const fullParam = req.params.logCodeId;
  const logCode = fullParam.split('/')[0];

  const isNumeric = isNumber(logCode);
  if (!isNumeric) {
    return res.status(200).json({ message: 'Invalid ID', errorCode: 1 });
  }

  const cookie = process.env.WL_COOKIE || '';
  const wl = new WLLogistic(logCode, cookie);
  const data = await wl.getDataFromLogCode();

  let photos = [] as string[];

  if (data && 'message' in data) {
    return res.status(200).json({ message: data.message, errorCode: 1 });
  }

  if (data && typeof data.warehousing_pic === 'string') {
    photos = wl.getPhotoFromData(data);
  }

  const responseData = data
    ? ({
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
      } as typeof data)
    : null;

  return res.status(200).json({
    message: data ? 'successful' : 'failed',
    picLinks: photos,
    totalPic: photos.length,
    logCode: logCode,
    data: responseData,
  });
});

async function fetchAndServeExternal(
  req: Request,
  res: Response,
  isHtml: boolean = false
) {
  if (!WL_PUBLIC_URL) {
    return res.status(200).send(isHtml ? 'testing_admin' : 'testing_static');
  }

  const requestPath = req.path;

  const queryString = Object.entries(req.query)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const query = queryString ? `?${queryString}` : '';
  const WL_URL = `${WL_PUBLIC_URL}${requestPath}${query}`;

  const pathSegments = requestPath.split('/').pop() || '';

  if (!isHtml) {
    if (requestPath.endsWith('.js')) {
      return res.redirect(WL_URL);
    } else if (
      ['png', 'jpg', 'jpeg', 'ico'].some((t) => pathSegments.endsWith('.' + t))
    ) {
      const ext = pathSegments.split('.').pop();
      res.setHeader('Content-Type', `image/${ext}`);
      return res.redirect(WL_URL);
    }
  }

  if (isHtml && requestPath.includes('/admin/verify/')) {
    return res.redirect(WL_URL);
  }

  try {
    const fetchResponse = await fetch(WL_URL);
    const data = await fetchResponse.text();

    if (
      isHtml &&
      data.substring(0, 20).toLowerCase().trim().startsWith('<!doctype html>')
    ) {
      // Send HTML
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(data);
    } else if (!isHtml && requestPath.endsWith('.css')) {
      // Send CSS
      res.setHeader('Content-Type', 'text/css');
      return res.status(200).send(data);
    }

    return res.status(200).send(data);
  } catch (err) {
    console.error('External fetch error:', (err as Error).message);
    return res.status(500).send((err as Error).message);
  }
}

app.get('/static/', (req: Request, res: Response) => {
  fetchAndServeExternal(req, res, false);
});

app.get('/admin/', (req: Request, res: Response) => {
  fetchAndServeExternal(req, res, true);
});

app.get('/wl-admin/', (req: Request, res: Response) => {
  res.status(200).send();
});

app.listen(port, () => {
  console.log(`🚀 Express server listening at http://localhost:${port}`);
});

runBot(bot, { webAppUrl });

export default app;

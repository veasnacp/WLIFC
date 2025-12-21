type Data = Record<string, any>;

type DT = {
  message: string;
  picLinks: string[];
  totalPic: number;
  logCode: string;
  data: Data;
};

var dataJson: DT | undefined;
window.setUpTelegramWebApp = async function () {
  const path = window.location.pathname;
  if (path.startsWith('/wl/') && window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.expand();
    try {
      const res = await fetch(path, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      console.log(path, data.message);
      await fetch('/api/submit-app-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: tg.initData,
          logCode: path.split('/').at(-1),
          result: JSON.stringify(data.data),
        }),
      });
      tg.close();
    } catch (error: any) {
      console.error(error.message);
    }
  } else {
    console.error(
      'Telegram WebApp object not found. Running outside the Telegram client.'
    );
  }
};

window.setUpTelegramWebApp();

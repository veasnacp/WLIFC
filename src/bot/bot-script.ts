import { Data } from '../wl/types';

type DT = {
  message: string;
  picLinks: string[];
  totalPic: number;
  logCode: string;
  data: Data;
};

var dataJson: DT | undefined;
function displayData(dt: DT, $displayData: Element) {
  console.log(dt);
  const picLinks = dt.picLinks;
  if (Array.isArray(picLinks) && picLinks.length) {
    const imgs = picLinks
      .map((l) => {
        return `<img src="${l}" width="500" height="400" class="w-100">`;
      })
      .join('');
    const data = dt.data;
    $displayData.innerHTML = ''.concat(
      '<div><span>',
      `<b>ចំនួន:</b> ${data.goods_number}<br>`,
      `<b>ម៉ែត្រគូប:</b> ${data.volume}<br>`,
      `<b>ទម្ងន់:</b> ${data.weight}<br>`,
      `<b>កំណត់ត្រាគណនាបរិមាណ:</b> ${
        data.volume_record?.replace(/\<br\>/g, '') || 'N/A'
      }<br>`,
      `<b>ផ្សេងៗ:</b> ${data.desc}<br>`,
      '</span></div>',
      imgs
    );
  }
}
function getData(logCode: string, $displayData: Element) {
  window
    .fetch('/wl/'.concat(logCode))
    .then(async (r) => {
      const dt = await r.json();
      dt.logCode = logCode;
      dataJson = dt;
      displayData(dataJson as DT, $displayData);
    })
    .catch(console.error);
}

if (window.Telegram && window.Telegram.WebApp) {
  const tg = window.Telegram.WebApp;

  // 1. Inform Telegram the app is loaded and ready
  // TypeScript now enforces the correct methods and properties exist on 'tg'
  tg.ready();

  // 2. Set up the Main Button
  // We can safely access properties like MainButton
  tg.MainButton.setText('Search');
  tg.MainButton.show();

  // 3. Handle the Main Button click using a typed listener
  // The 'subscribe' method adds an event listener
  tg.MainButton.onClick(() => {
    // Construct the data payload
    const logCode =
      document.querySelector<HTMLInputElement>('input#log-code')?.value;
    const data = {
      action: 'button_click',
      timestamp: new Date().toISOString(),
      // Accessing initDataUnsafe with type safety
      user_id: tg.initDataUnsafe.user?.id || 'unknown',
      logCode: logCode || '',
    };
    const $displayData = document.querySelector('.display-data');
    if (logCode && $displayData) {
      $displayData.innerHTML = ''.concat(
        '<div class="d-flex justify-content-center">',
        '<div class="spinner-border" role="status">',
        '<span class="visually-hidden">Loading...</span>',
        '</div>',
        '</div>'
      );
      if (!dataJson) {
        getData(logCode, $displayData);
      } else if (typeof dataJson == 'object') {
        if (dataJson.logCode === logCode) {
          displayData(dataJson, $displayData);
        } else {
          getData(logCode, $displayData);
        }
      }
    }

    // Use sendData method to send JSON string back to the bot
    tg.sendData(JSON.stringify(data));

    // tg.showAlert('Data sent! Closing Mini App...');

    // setTimeout(() => tg.close(), 3000);
  });

  // 4. Example: Reading User Data safely
  const user = tg.initDataUnsafe.user;
  if (user) {
    // User is typed as WebAppUser, so we know 'first_name' exists
    const greetingElement = document.querySelector('h1');
    if (greetingElement) {
      greetingElement.textContent = `Hello, ${user.first_name || 'User'}`;
    }
  }

  // 5. Example: Theme changes
  // Subscribe to a typed event
  tg.onEvent('themeChanged', () => {
    // You can update CSS variables here based on tg.colorScheme or tg.themeParams
    console.log(`Theme changed to ${tg.colorScheme}`);
  });
} else {
  // Fallback for testing outside Telegram (optional)
  console.error(
    'Telegram WebApp object not found. Running outside the Telegram client.'
  );
}

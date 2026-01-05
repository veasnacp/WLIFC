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
  const search = window.location.search;
  if (path.startsWith('/wl/') && window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    const params = new URLSearchParams(search);
    let message_id = params.get('message_id');
    let isSearch = params.get('search') === 'true';
    if (isSearch) {
      const $loading = document.querySelector('#loading')!;
      const loadingHTML = $loading.innerHTML;
      $loading.innerHTML = /*html*/ `
        <div class="search-section">
          <div class="d-flex justify-content-center">
            <input id="logCode" type="text" placeholder="សូមបញ្ចូលលេងបុង...">
            <button id="search" class="btn-primary">Search</button>
          </div>
          <div class="loading"></div>
        </div>
      `;
      const $searchBtn =
        document.querySelector<HTMLButtonElement>('button#search');
      if ($searchBtn) {
        $searchBtn.addEventListener('click', async function () {
          const $loading = document.querySelector('.search-section .loading')!;
          $loading.innerHTML = loadingHTML;
          const logCode =
            document.querySelector<HTMLInputElement>('input#logCode')?.value;
          if (logCode) {
            await load_data(`${window.origin}/wl/${logCode}`);
          }
          $loading.innerHTML = '';
        });
      }
    } else {
      load_data(path);
    }
    async function load_data(path: string) {
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
            message_id,
            message: data.message,
          }),
        });
        tg.close();
      } catch (error: any) {
        console.error(error.message);
      }
    }
  } else {
    console.error(
      'Telegram WebApp object not found. Running outside the Telegram client.'
    );
  }
};

window.setUpTelegramWebApp();

import { Data } from './types';

export class WLLogistic {
  private _currentLogCode: string | number = '';
  private _cookie: string = '';
  headers: HeadersInit = {};
  constructor(logCode: string, cookie: string) {
    this._currentLogCode = logCode;
    this._cookie = cookie;
    this.headers = {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'accept-language': 'en-US,en;q=0.9,km;q=0.8',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      priority: 'u=1, i',
      'sec-ch-ua':
        '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'x-requested-with': 'XMLHttpRequest',
      cookie: this._cookie,
      Referer: `${process.env.WL_PUBLIC_URL}/admin/index/index.html`,
    };
  }
  apiUrlLogCode(id?: string | number) {
    const pid = id ? `&pid=${id}` : '';
    return `${process.env.WL_PUBLIC_URL}/index.php/admin/order/warehouse?do=list&spot_id=1000&spot_code=JPZ&page=1&limit=10&logcode=${this._currentLogCode}&mark_name=&goods_name=&date=&sub_type=&container_num=${pid}&status=0`;
  }
  /**
   * Get id from pid
   * @returns number or string
   */
  async getDataFromLogCode(logCode?: string | number) {
    if (logCode) {
      this._currentLogCode = logCode;
    }
    try {
      const res = await fetch(this.apiUrlLogCode(), {
        headers: this.headers,
        body: null,
        method: 'GET',
      });
      const dataList = (await res.json()).data as Array<Data>;
      const data_0 = dataList[0] || {};
      const id = data_0.id;
      if (id) {
        const res = await fetch(this.apiUrlLogCode(id), {
          headers: this.headers,
          body: null,
          method: 'GET',
        });
        const dataList = (await res.json()).data as Array<Data>;
        const dataUpdate = {
          goods_number: [] as number[],
          weight: [] as number[],
          volume: [] as number[],
          volume_record: [] as string[],
          warehousing_pic: [] as string[],
        }
        let hasUpdateData = false
        const data = dataList[0] || {};
        if(Object.keys(data).length)
        dataList.reduce((acc, d) => {
          if(Object.keys(dataUpdate).some(k => k in d)){
            hasUpdateData = true
            Object.keys(dataUpdate).map(k => {
              // @ts-ignore
              dataUpdate[k as keyof typeof dataUpdate].push(k === 'volume_record' || k === 'warehousing_pic' ? d[k] : Number(d[k]))
            })
          }
          return acc
        }, {} as Data);
        (Object.keys(data) as (keyof Data)[]).forEach((k) => {
          if (k in data_0 && !data[k] && data_0[k]) {
            // @ts-ignore
            data[k] = data_0[k];
          }
        });
        // console.log(data)
        if(hasUpdateData){
          (Object.keys(dataUpdate) as (keyof typeof dataUpdate)[]).map(k => {
              if(['volume_record' ,'warehousing_pic'].some(v => v === k)){
                // @ts-ignore
                data[k] = dataUpdate[k].join(k === 'warehousing_pic' ? ',' : '')
              } else {
                // @ts-ignore
                data[k] = String(dataUpdate[k].reduce((acc,d)=> acc + d, 0))
              }
            })
            // console.log('dataupdate', data)
        }
        return data;
      }
    } catch (error) {
      throw new Error((error as Error).message);
    }
  }
  getPhotoFromData(data: Data) {
    return data.warehousing_pic
      .split(',').filter(Boolean)
      .map((p) => `${process.env.WL_PUBLIC_URL}/upload/${p}`);
  }
}

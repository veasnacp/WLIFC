import { removeDuplicateArray } from '../utils/is';
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
  async getDataFromLogCode(
    logCode?: string | number,
    showAllSmallPackage = false,
    isSubLogCode = false
  ) {
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
      const data_0 =
        showAllSmallPackage || isSubLogCode
          ? dataList[0]
          : (dataList.find(
              (d) => d.logcode === String(this._currentLogCode)
            ) as Data) || {};

      const id = data_0.id;
      const isSmallPackage = data_0.goods_name?.includes('件合');
      if (!showAllSmallPackage && isSmallPackage) {
        return { ...data_0, isSmallPackage };
      }
      if (id) {
        const res = await fetch(this.apiUrlLogCode(id), {
          headers: this.headers,
          body: null,
          method: 'GET',
        });
        const dataList = (await res.json()).data as Array<Data>;

        if (showAllSmallPackage) {
          const subLogCodes: string[] = [data_0.logcode];
          const smallPackageGoodsNames: string[] = [];
          let contact = {} as Record<string, string>;
          const data = dataList.reduce((d, prev, i) => {
            const detailGoodsName = `${i + 1}. `.concat(
              prev.goods_name?.trim()
                ? `${prev.goods_name}${
                    prev.material?.trim() ? ` (${prev.material})` : ''
                  } - `
                : '',
              prev.sub_logcode,
              `\n\t\t 🔹 ${prev.volume}m³ | ${prev.weight}kg | $${prev.total}`
            );
            smallPackageGoodsNames.push(detailGoodsName);
            if (prev.sub_logcode) {
              subLogCodes.push(prev.sub_logcode);
            }
            if (!contact.from_address && !contact.to_address) {
              const {
                from_address,
                from_name,
                from_phone,
                to_address,
                to_name,
                to_phone,
              } = prev;
              contact = {
                from_address,
                from_name,
                from_phone,
                to_address,
                to_name,
                to_phone,
              };
              d = { ...d, ...contact };
            }
            return d;
          }, data_0);
          return {
            ...data,
            smallPackageGoodsNames,
            subLogCodes,
            isSmallPackage,
          };
        }

        const dataUpdate = {
          sub_total: [] as number[],
          total: [] as number[],
          goods_number: [] as number[],
          weight: [] as number[],
          net_weight: [] as number[],
          volume: [] as number[],
          volume_record: [] as string[],
          warehousing_pic: [] as string[],
          goods_name: [] as string[],
        };
        const dataUpdateKeys = Object.keys(
          dataUpdate
        ) as (keyof typeof dataUpdate)[];
        let hasUpdateData = false;
        const data = (dataList.find((d) => d.pid === id) as Data) || {};
        if (Object.keys(data).length)
          dataList.reduce((acc, d) => {
            if (dataUpdateKeys.some((k) => k in d)) {
              hasUpdateData = true;
              dataUpdateKeys.map((k) => {
                let value = d[k];
                if (
                  !(
                    ['volume_record', 'warehousing_pic', 'goods_name'] as const
                  ).some((v) => v === k)
                ) {
                  value = Number(value);
                } else if (k === 'goods_name' && d.material?.trim()) {
                  value = `${d.goods_name} (${d.material})`;
                }
                // @ts-ignore
                dataUpdate[k].push(value);
              });
            }
            return acc;
          }, {} as Data);
        (Object.keys(data) as (keyof Data)[]).forEach((k) => {
          if (k in data_0 && !data[k] && data_0[k]) {
            // @ts-ignore
            data[k] = data_0[k];
          }
        });
        if (hasUpdateData) {
          dataUpdateKeys.map((k) => {
            if (
              k === 'volume_record' ||
              k === 'warehousing_pic' ||
              k === 'goods_name'
            ) {
              data[k] = removeDuplicateArray(dataUpdate[k]).join(
                k !== 'volume_record' ? ',' : ''
              );
            } else {
              // @ts-ignore
              data[k] = String(dataUpdate[k].reduce((acc, d) => acc + d, 0));
            }
          });
        }
        return data;
      } else {
        return { message: 'not found' } as const;
      }
    } catch (error) {
      this.onError(error as Error);
      return;
    }
  }
  getPhotoFromData(data: Data) {
    return data.warehousing_pic
      .split(',')
      .filter(Boolean)
      .map((p) => `${process.env.WL_PUBLIC_URL}/upload/${p}`);
  }
  onError(error: Error) {}
}

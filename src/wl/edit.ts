import {
  isObject,
  removeDuplicateArray,
  removeDuplicateObjArray,
} from '../utils/is';
import { Data } from './types';

type MediaType = {
  type: 'photo';
  media: string;
  caption?: string;
};

export type DataExpand = Data & {
  isSmallPackage?: boolean;
  smallPackageGoodsNames?: string[];
  subLogCodes?: string[];
};

export class WLLogistic {
  private _currentLogCode: string | number = '';
  private _cookie: string = '';
  asAdminMember = false;
  headers: HeadersInit = {};
  constructor(logCode?: string, cookie?: string) {
    this._currentLogCode = logCode || '';
    this._cookie = cookie || '';
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
  async getFirstData() {
    const res = await fetch(this.apiUrlLogCode(), {
      headers: this.headers,
      body: null,
      method: 'GET',
    });
    const dataList = (await res.json()).data as Array<Data> | { url: string };
    return dataList;
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
      const dataList = await this.getFirstData();
      if (isObject(dataList) && 'url' in dataList) {
        return {
          message: 'not found',
          path: dataList.url as string,
          requireLogin: true,
        } as const;
      } else if (dataList.length === 0) {
        return { message: 'not found' } as const;
      }
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
          total: [] as number[],
          goods_number: [] as number[],
          weight: [] as number[],
          net_weight: [] as number[],
          volume: [] as number[],
          volume_record: [] as string[],
          warehousing_pic: [] as string[],
          goods_name: [] as string[],
          sub_logcode: [] as string[],
        };
        const medias = [] as MediaType[];
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
                    [
                      'volume_record',
                      'warehousing_pic',
                      'goods_name',
                      'sub_logcode',
                    ] as const
                  ).some((v) => v === k)
                ) {
                  value = Number(value);
                } else if (k === 'goods_name' && d.material?.trim()) {
                  value = `${d.goods_name} (${d.material})`;
                }
                if (
                  k === 'warehousing_pic' &&
                  typeof value === 'string' &&
                  value
                ) {
                  value
                    .trim()
                    .split(',')
                    .forEach((image) => {
                      const media =
                        medias.length && medias.find((m) => m.media === image);
                      if (!media) {
                        const more = () => {
                          let text = `- ផ្សេងៗ: ${d.desc}\n`;
                          if (this.asAdminMember) {
                            try {
                              text = `\n===== Express Tracking =====\n`.concat(
                                removeDuplicateObjArray(
                                  JSON.parse(d.expresstracking) as Array<
                                    Record<'time' | 'text' | 'remark', string>
                                  >,
                                  'text'
                                )
                                  .map(
                                    (d) =>
                                      `🔹 ${d.text}: ${d.time}${
                                        d.remark ? `(${d.remark})` : ''
                                      }`
                                  )
                                  .join('\n')
                              );
                            } catch {}
                          }
                          return text;
                        };
                        const caption = ''
                          .concat(
                            `- ទំនិញ: ${d.goods_name}${
                              d.material?.trim() ? ` (${d.material})` : ''
                            }\n`,
                            `- TN: ${d.sub_logcode || 'N/A'}\n`,
                            `- ចំនួន: ${d.goods_number}\n`,
                            `- ទម្ងន់: ${d.weight}kg\n`,
                            `- ម៉ែត្រគូបសរុប: ${d.volume}m³\n`,
                            `- ម៉ែត្រគូបផ្សេងគ្នា: ${
                              d.volume_record
                                ?.replace(/\<br\>/, '')
                                .replace(/\<br\>/g, ',') || 'N/A'
                            }\n`,
                            more(),
                            '\n\n\n...'
                          )
                          .substring(0, 1024);
                        medias.push({
                          type: 'photo',
                          media: image,
                          caption,
                        });
                      }
                    });
                } else if (
                  k === 'sub_logcode' &&
                  typeof value === 'string' &&
                  value
                ) {
                  value = `${
                    d.sub_order ? `${d.sub_order} | ` : ''
                  }${value} | ${d.goods_name} | ${d.weight}kg | ${
                    d.volume
                  } | $${d.total}`;
                }
                if (value)
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
              k === 'goods_name' ||
              k === 'sub_logcode'
            ) {
              data[k] = removeDuplicateArray(dataUpdate[k]).join(
                k !== 'volume_record' ? (k === 'sub_logcode' ? '@' : ',') : ''
              );
            } else {
              // @ts-ignore
              data[k] = String(dataUpdate[k].reduce((acc, d) => acc + d, 0));
            }
          });
        }
        return { ...data, medias, goods_numbers: dataUpdate.goods_number };
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
      .filter((v) => Boolean(v) && v !== 'null')
      .map((p) => `${process.env.WL_PUBLIC_URL}/upload/${p}`);
  }
  getMediasFromData(data: Data | (Data & { medias: MediaType[] })) {
    if ('medias' in data) {
      return data.medias.reduce(
        (acc, prev) => {
          if (
            prev.media &&
            prev.media !== 'null' &&
            !acc.photos.includes(prev.media)
          ) {
            const m = {
              ...prev,
              media: `${process.env.WL_PUBLIC_URL}/upload/${prev.media}`,
            };
            acc.medias.push(m);
            acc.photos.push(m.media);
          }
          return acc;
        },
        { medias: [] as MediaType[], photos: [] as string[] }
      );
    } else {
      const photos = this.getPhotoFromData(data);
      const medias = photos.map((p) => ({
        type: 'photo',
        media: p,
        caption: data.goods_name,
      })) as MediaType[];
      return { medias, photos };
    }
  }
  onError(error: Error) {}
}

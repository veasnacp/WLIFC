import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import { DataExpand, WLLogistic } from '../wl/edit';
import { Data } from '../wl/types';
import {
  chunkArray,
  isArray,
  isNumber,
  isObject,
  removeDuplicateObjArray,
} from '../utils/is';
import {
  IS_DEV,
  PUBLIC_URL,
  WL_PRIVATE_API,
  WL_PUBLIC_URL,
} from '../config/constants';
import translate from '@iamtraction/google-translate';
import { Jimp } from 'jimp';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';
import { STICKER_ID } from './sticker';
// import chalk from 'chalk';

export const WL_MEMBERS_LIST = process.env.WL_MEMBERS_LIST;
export const ADMIN_LIST = process.env.ADMIN;
export const CONTAINER_CONTROLLER_LIST = process.env.CONTAINER_CONTROLLER;

export function isAdmin(chat: TelegramBot.Chat) {
  const ADMIN_LIST = config.get('ADMIN_LIST') as string[] | undefined;
  if (!ADMIN_LIST) return false;
  return ADMIN_LIST.some((n) =>
    isNumber(n)
      ? n === String(chat.id)
      : n === (chat.username || chat.first_name)
  );
}

export function isMemberAsAdmin(chat: TelegramBot.Chat) {
  const WL_MEMBERS_LIST = config.get('WL_MEMBERS_LIST') as string[] | undefined;
  if (!WL_MEMBERS_LIST) return false;
  return WL_MEMBERS_LIST.some((n) =>
    isNumber(n)
      ? n === String(chat.id)
      : n === (chat.username || chat.first_name)
  );
}

export function isMemberAsContainerController(chat: TelegramBot.Chat) {
  const { fullname } = getFullname(chat);
  const CONTAINER_CONTROLLER_LIST = config.get('CONTAINER_CONTROLLER_LIST') as
    | string[]
    | undefined;
  if (!CONTAINER_CONTROLLER_LIST) return false;
  return CONTAINER_CONTROLLER_LIST.some((n) =>
    isNumber(n) ? n === String(chat.id) : n === (chat.username || fullname)
  );
}

export const LOADING_TEXT =
  'សូមមេត្តារងចាំបន្តិច... កំពុងស្វែងរកទិន្នន័យ\n🔄 Processing your request... Please hold tight!';
const MAX_CAPTION_LENGTH = 1024;
const MAX_TEXT_LENGTH = 4096;

const currentDate = {
  date: new Date(),
  month() {
    return this.date.getMonth() + 1;
  },
  day() {
    return this.date.getDate();
  },
};
let DATA: Iterable<readonly [string, Data]> | undefined;
let USERS_DATA: Iterable<readonly [number, ActiveUserData]> | undefined;
const publicPath = path.join(process.cwd(), 'public');
const cachePath = path.join(process.cwd(), 'cache');
const usersFile = path.join(cachePath, 'users.json');
const currentFileName = `data-${currentDate.month()}-${currentDate.day()}.json`;
const fileData = path.join(cachePath, currentFileName);
const fs = process.getBuiltinModule('fs');

if (IS_DEV && fs) {
  if (fs.existsSync(fileData)) {
    const dataString = fs.readFileSync(fileData, { encoding: 'utf-8' });
    if (dataString.startsWith('[') && dataString.endsWith(']')) {
      try {
        DATA = JSON.parse(dataString);
      } catch {}
    }
  }
  if (fs.existsSync(usersFile)) {
    const dataString = fs.readFileSync(usersFile, { encoding: 'utf-8' });
    if (dataString.startsWith('[') && dataString.endsWith(']')) {
      try {
        USERS_DATA = JSON.parse(dataString);
      } catch {}
    }
  }
}

type ConfigCache = {
  cookie: string;
  ADMIN_LIST: string[];
  WL_MEMBERS_LIST: string[];
  CONTAINER_CONTROLLER_LIST: string[];
  bannedUsers: string[];
  status: 'active' | 'sleep' | 'deactivated' | 'maintenance' | (string & {});
  statusMessage: string;
  waitingCookie: boolean;
};
type PreMapConfig = Map<keyof ConfigCache, ConfigCache[keyof ConfigCache]>;
type MapConfig = Omit<PreMapConfig, 'get' | 'set'> & {
  get: <K extends keyof ConfigCache>(key: K) => ConfigCache[K] | undefined;
  set: <K extends keyof ConfigCache>(
    key: K,
    value: ConfigCache[K]
  ) => MapConfig;
};
export const CACHE_DATA = DATA;
export const cacheData = new Map<string, DataExpand>(CACHE_DATA);
const config = new Map() as MapConfig;
config.set('ADMIN_LIST', ADMIN_LIST ? ADMIN_LIST.split(',') : []);
config.set(
  'WL_MEMBERS_LIST',
  WL_MEMBERS_LIST ? WL_MEMBERS_LIST.split(',') : []
);
config.set(
  'CONTAINER_CONTROLLER_LIST',
  CONTAINER_CONTROLLER_LIST ? CONTAINER_CONTROLLER_LIST.split(',') : []
);
config.set('bannedUsers', []);
if (process.env.BOT_STATUS === 'maintenance')
  config.set('status', 'maintenance');

interface ActiveUserData {
  fullnameWithUsername: string;
  id?: number | string;
  username?: string;
  firstSeen: Date;
}
export const activeUserMap = new Map<number, ActiveUserData>(USERS_DATA);

const loggingCache = new Set<string>();

let invalidMessage = { chatId: undefined, messageId: undefined } as Record<
  'chatId' | 'messageId',
  number | undefined
>;

export async function saveUser(bot: TelegramBot, msg: TelegramBot.Message) {
  if (!fs) return;

  const chatId = msg.chat.id;
  if (IS_DEV && isAdmin(msg.chat))
    try {
      const activeUserData = [...activeUserMap.entries()];
      if (activeUserData.length) {
        fs.writeFileSync(usersFile, JSON.stringify(activeUserData));
      }
      let message = 'no active user';
      if (activeUserData.length) {
        message = `✅ Successfully save users to file:\`${usersFile}\``;
      }
      await bot
        .sendMessage(chatId, message, { parse_mode: 'Markdown' })
        .catch();
    } catch (error: any) {
      console.log('Error save users', error.message);
    }
}

export const deleteInlineKeyboardButton = {
  text: 'Delete',
  callback_data: 'delete',
} as TelegramBot.InlineKeyboardButton;
export function sendMessageOptions(
  options?: (TelegramBot.SendMessageOptions | TelegramBot.SendPhotoOptions) &
    Partial<{
      chat: TelegramBot.Chat;
      inlineKeyboardButtons: TelegramBot.InlineKeyboardButton[];
      translateText: string;
      logCodeForShowMore: string;
    }>
) {
  const { chat, inlineKeyboardButtons, translateText, logCodeForShowMore } =
    options || {};
  const isAsAdmin = chat && isMemberAsAdmin(chat);
  let defaultInlineKeyboardButtons = [deleteInlineKeyboardButton];
  if (inlineKeyboardButtons?.length) {
    defaultInlineKeyboardButtons.push(...inlineKeyboardButtons);
  }
  if (translateText?.trim()) {
    defaultInlineKeyboardButtons.push(
      translateInlineKeyboardButton('zh', translateText)
    );
  }
  const inline_keyboard = [defaultInlineKeyboardButtons];
  if (logCodeForShowMore && isAsAdmin) {
    inline_keyboard.push([
      showMoreDataInlineKeyboardButton(logCodeForShowMore),
    ]);
  }
  return {
    ...options,
    reply_markup: {
      inline_keyboard,
      ...options?.reply_markup,
    },
  } as TelegramBot.SendMessageOptions;
}

export const adminInlineKeyboardButtons = [
  {
    text: '🆔 LogCodes',
    callback_data: 'getLogCodes',
  },
  {
    text: '📊 Logging',
    callback_data: 'getLogging',
  },
  {
    text: '🟢 Status',
    callback_data: 'setStatus',
  },
  {
    text: '👨‍⚖ Config Users',
    callback_data: 'getConfigUsers',
  },
  {
    text: '👥 Active Users',
    callback_data: 'getActiveUsers',
  },
  {
    text: '💾 Save Users',
    callback_data: 'saveUsers',
  },
  {
    text: '🔄 Reset Data',
    callback_data: 'resetData',
  },
  {
    text: '🚮 Clear All',
    callback_data: 'clear',
  },
] as const;

type AdminInlineKeyboardAction =
  (typeof adminInlineKeyboardButtons)[number]['callback_data'];

export const translateInlineKeyboardButton = (from: string, text: string) =>
  ({
    text: 'បកប្រែឈ្មោះទំនិញ',
    callback_data: 'tr_from_'.concat(from, '|', text),
  } as TelegramBot.InlineKeyboardButton);

export const showMoreDataInlineKeyboardButton = (logCode: string) =>
  ({
    text: 'Show More',
    callback_data: 'show_more_data'.concat(logCode),
  } as TelegramBot.InlineKeyboardButton);

type OnTextNumberActionOptions = {
  withMore: boolean;
  showAllSmallPackage: boolean;
  isSubLogCode: boolean;
};

export const getFullname = (chat: TelegramBot.Chat) => {
  const { first_name, last_name, username } = chat;
  const fullname =
    (first_name || '') + (last_name ? ` ${last_name}` : '') || 'Anonymous';
  const fullnameWithUsername = fullname + (username ? `(@${username})` : '');
  return { fullname, fullnameWithUsername };
};

export const statusMessage = {
  active: 'Currently, the Bot is active.',
  sleep:
    "ខ្ញុំជាប់រវល់ហើយ ⏳ សូមមេត្តារងចាំ...\n🤓 Sorry, I'm too busy. Please wait...",
  deactivated: '🔴 ប្រព័ន្ធបានបិទដំណើរហើយ។\nThe system has been deactivated.',
  maintenance:
    '👨‍💻 ប្រព័ន្ធកំពុងធ្វើបច្ចុប្បន្នភាព!!! ☕ សូមមេត្តារងចាំបន្តិច...\n🤓 The system is updating. Please wait...',
};

export const getStatusMessage = (status?: ConfigCache['status']) => {
  const customStatusMessage = config.get('statusMessage');
  let message = statusMessage.sleep;
  switch (status) {
    case 'deactivated':
      message = statusMessage.deactivated;
      break;
    case 'maintenance':
      message = statusMessage.maintenance;
      break;
    default:
      break;
  }
  message = customStatusMessage?.trim() || message;
  return message;
};

export const showMoreDataCaption = async (
  bot: TelegramBot,
  chatId: TelegramBot.ChatId,
  data: DataExpand | undefined
) => {
  if (data) {
    await bot.sendMessage(
      chatId,
      ''
        .concat(
          `<b>Container Number:</b> <code>${data.container_num}</code>\n`,
          `<b>Member Name:</b> ${data.member_name}\n`,
          `<b>开单员:</b> ${data.delivery_manager_name || 'N/A'}\n`,
          data.from_address?.trim() && data.to_address?.trim()
            ? ''.concat(
                `<b>Form Name:</b> ${data.from_name}${
                  data.from_phone ? ` (${data.from_phone})` : ''
                }\n`,
                `<b>Form Address:</b> ${data.from_address}\n`,
                `<b>To Name:</b> ${data.to_name}${
                  data.to_phone ? ` (${data.to_phone})` : ''
                }\n`,
                `<b>To Address:</b> ${data.to_address}\n`
              )
            : '',
          `<b>Total: <code>$${Number(data.total).toFixed(2)}</code></b> (${
            !!data.payment_status ? 'Paid' : 'Unpaid'
          })\n`,
          data.expresstracking
            ? `\n===== Express Tracking =====\n`.concat(
                removeDuplicateObjArray(
                  JSON.parse(data.expresstracking) as Array<
                    Record<'time' | 'text' | 'remark', string>
                  >,
                  'text'
                )
                  .map(
                    (d) =>
                      `<b>${d.text}:</b> ${d.time}${
                        d.remark ? `(${d.remark})` : ''
                      }`
                  )
                  .join('\n')
              )
            : '',
          data.sub_logcode
            ? `\n\n${data.sub_logcode
                .split('@')
                .map((v, i) => `${i + 1}. <code>${v}</code>`)
                .join('\n')}`
            : ''
        )
        .substring(0, MAX_TEXT_LENGTH),
      sendMessageOptions({
        parse_mode: 'HTML',
      })
    );
  }
};

let globalLogCode = '';

export function getValidationOptions(
  logCode: string,
  bot?: TelegramBot,
  chatId?: TelegramBot.ChatId
) {
  const options = {} as Partial<OnTextNumberActionOptions>;
  const isValidStartsWith = logCode.startsWith('25');
  const isOldLogCode = logCode.startsWith('1757');
  const isValidSmallPackageOrTrackingLogCode = isOldLogCode
    ? logCode.length === 10
    : logCode.length >= 12 && logCode.length <= 16;
  if (
    !isValidStartsWith ||
    (isValidStartsWith && logCode.length !== '251209180405'.length)
  ) {
    if (!isValidSmallPackageOrTrackingLogCode) {
      if (bot && chatId) {
        bot.sendMessage(
          chatId,
          'នែ៎ៗៗ! លេខបុងមិនត្រឹមត្រូវទេ។ សូមបញ្ចូលម្តងទៀត។\n'.concat(
            isOldLogCode
              ? 'លេខបុងប្រភេទនេះមិនទាន់បញ្ចូលទិន្នន័យទេ សូមប្រើលេខបុងដែលចាប់ផ្តើមពីលេខ25\n'
              : '',
            '❌ Sorry, invalid code. Please try again.'
          )
        );
        return;
      }
    } else {
      options.isSubLogCode = true;
    }
  }

  return options;
}
export async function ShowDataMessageAndPhotos(
  bot: TelegramBot,
  chat: TelegramBot.Chat,
  data: DataExpand | undefined,
  wl: WLLogistic,
  options: {
    logCode: string;
    isTrackingNumber: boolean;
    asAdmin?: boolean;
    asAdminMember?: boolean;
    asMemberContainerController: boolean;
    hasSubLogCodeCache?: boolean;
    loadingMsgId?: number;
    withMore?: boolean;
  }
) {
  const {
    logCode,
    isTrackingNumber,
    hasSubLogCodeCache,
    asAdmin,
    asAdminMember,
    asMemberContainerController,
    loadingMsgId,
  } = options;
  const chatId = chat.id;
  let photos = [] as string[];
  let media = [] as TelegramBot.InputMedia[];
  if (data && typeof data.warehousing_pic === 'string') {
    const mediaData = wl.getMediasFromData(data);
    photos = mediaData.photos;
    media = mediaData.medias;
  }
  let textMessage: string | undefined;
  let caption: string | undefined;

  if (data) {
    const _logCode = data.logcode;
    if (!hasSubLogCodeCache && !cacheData.get(_logCode)) {
      cacheData.set(_logCode, data);
      if (IS_DEV) {
        const fs = process.getBuiltinModule('fs');
        if (fs) {
          let DATA = Array.from(cacheData.entries());
          const dataLength = DATA.length;
          if (dataLength > 50) {
            DATA = DATA.slice(dataLength - 50, dataLength - 1);
          }
          if (dataLength > 0)
            fs.writeFileSync(fileData, JSON.stringify(DATA, null, 2), {
              encoding: 'utf-8',
            });
        }
      }
    }
    const goods_numbers =
      'goods_numbers' in data &&
      Array.isArray(data.goods_numbers) &&
      data.goods_numbers;
    const isSplitting = goods_numbers && goods_numbers.length > 1;
    textMessage = ''
      .concat(
        `- លេខបុង: ${isTrackingNumber ? data.logcode : logCode} ✅ ${
          isSplitting ? 'ទូរចុងក្រោយ' : 'ទូរ'
        }: ${
          data.container_num?.split('-').slice(1).join('.') ||
          'N/A(ប្រហែលជើងអាកាស)'
        }\n`,
        `- កូដអីវ៉ាន់: ${data.mark_name}\n`,
        `- ចំនួន: ${data.goods_number}\n`,
        isSplitting ? `- ចំនួនបែងចែកទូរ: [${goods_numbers.join(', ')}]\n` : '',
        `- ទម្ងន់: ${
          data.weight.length <= 5 ? data.weight : Number(data.weight).toFixed(2)
        }kg\n`,
        `- ម៉ែត្រគូបសរុប: ${Number(data.volume).toFixed(3)}m³\n`,
        `- ម៉ែត្រគូបផ្សេងគ្នា: ${
          data.volume_record?.trim()
            ? ''.concat(
                '[\n',
                data.volume_record
                  .split('<br>')
                  .filter(Boolean)
                  .map((v) => {
                    v = v.includes('=') ? v.split('=')[0] : v;
                    const total = v
                      .split('x')
                      .reduce((acc, p) => acc * Number(p), 1);
                    return `\t\t\t\t\t\t${v} = ${total.toFixed(3)}`;
                  })
                  .join('\n'),
                '\n\t\t\t]'
              )
            : 'N/A'
        }\n`,
        `- ទំនិញ: ${data.goods_name}${
          data.isSmallPackage ? ' - 小件包裹(អីវ៉ាន់តូច)' : ''
        }\n`,
        asAdmin || asAdminMember || asMemberContainerController
          ? ''.concat(
              '- ទូរកុងតឺន័រ: ',
              data.container_num?.split('-')[0] || 'N/A(ប្រហែលជើងអាកាស)',
              '\n'
            )
          : '',
        `- ផ្សេងៗ: ${data.desc?.replace('到达', '到达(មកដល់)') || 'N/A'}\n`
      )
      .substring(0, MAX_TEXT_LENGTH);
    caption = textMessage.substring(0, MAX_CAPTION_LENGTH);
  }

  const sendFullCaption = async () => {
    if (caption) {
      await bot.sendMessage(
        chatId,
        caption,
        sendMessageOptions({
          translateText: logCode,
          logCodeForShowMore: logCode,
          chat,
        })
      );
    }
  };

  const showMoreCaption = () =>
    options?.withMore && showMoreDataCaption(bot, chatId, data);

  if (textMessage && photos.length === 0) {
    await bot.sendMessage(
      chatId,
      `🤷 🏞🏞 អត់មានរូបភាពទេ 🏞🏞 🤷\n\n${textMessage}`,
      sendMessageOptions()
    );
    if (data?.smallPackageGoodsNames?.length && data.subLogCodes) {
      await bot.sendMessage(
        chatId,
        '=== អីវ៉ាន់តូចៗទាំងអស់ ===\n'.concat(
          data.smallPackageGoodsNames.join('\n')
        ),
        sendMessageOptions()
      );
    }

    await showMoreCaption();
    // Delete the temporary loading message
    if (loadingMsgId) {
      await bot.deleteMessage(chatId, loadingMsgId);
      options.loadingMsgId = undefined;
    }
    return { noImage: true };
  }

  let errorMessageId: number | undefined;
  // Send the final generated photo
  let isError = false;
  if (photos.length === 1) {
    const sendPhoto = async (photo: string | Buffer) => {
      await bot
        .sendPhoto(
          chatId,
          photo,
          sendMessageOptions({
            caption,
            translateText: logCode,
            logCodeForShowMore: logCode,
          })
        )
        .then(async () => {
          console.log(`✅ Successfully sent an photo.`);
          await showMoreCaption();
        })
        .catch(async (error) => {
          isError = true;
          console.error('Error sending photo:', (error as Error).message);
          const { message_id } = await bot.sendMessage(
            chatId,
            '❌ សូមទោស! ការផ្ញើរូបភាពមានបញ្ហា សូមព្យាយាមម្តងទៀត។'
          );
          errorMessageId = message_id;
        });
    };
    await sendPhoto(photos[0]);
    if (isError) {
      isError = false;
      const tryLoadingMessage = await bot.sendMessage(
        chatId,
        '⏳ Trying load image...'
      );
      await sendPhoto(`${PUBLIC_URL}/blob/image?url=${photos[0]}`);
      if (isError) {
        await sendFullCaption();
      }
      if (errorMessageId) {
        await bot.deleteMessage(chatId, errorMessageId).catch();
        bot.deleteMessage(chatId, tryLoadingMessage.message_id).catch();
      }
    }
  } else {
    const medias = chunkArray(media, 10);
    const sendMediaGroup = async (medias: TelegramBot.InputMedia[][]) => {
      isError = false;
      for (let i = 0; i < medias.length; i++) {
        await bot
          .sendMediaGroup(chatId, medias[i])
          .then(async (sentMessages) => {
            console.log(
              `✅ Successfully sent an album with ${sentMessages.length} items.`
            );
          })
          .catch(async (error) => {
            isError = true;
            console.error(
              'Error sending media group:',
              (error as Error).message
            );
            const { message_id } = await bot.sendMessage(
              chatId,
              '❌ សូមទោស! ការផ្ញើរូបភាពមានបញ្ហា សូមព្យាយាមម្តងទៀត។'
            );
            errorMessageId = message_id;
          });
      }
    };
    await sendMediaGroup(medias);
    if (isError) {
      const tryLoadingMessage = await bot.sendMessage(
        chatId,
        '⏳ Trying load image...'
      );
      const medias = chunkArray(
        media.map((m) => ({
          ...m,
          media: `${PUBLIC_URL}/blob/image?url=${m.media}`,
        })),
        10
      );
      await sendMediaGroup(medias);
      if (errorMessageId) {
        await bot.deleteMessage(chatId, errorMessageId).catch();
        await bot.deleteMessage(chatId, tryLoadingMessage.message_id).catch();
      }
    }
    await sendFullCaption();
    await showMoreCaption();
  }
}
export async function onTextNumberAction(
  bot: TelegramBot,
  chat: TelegramBot.Chat,
  logCode: string | undefined,
  options?: Partial<OnTextNumberActionOptions>
) {
  const chatId = chat.id;
  const asAdmin = isAdmin(chat);
  const asAdminMember = isMemberAsAdmin(chat);
  const asMemberContainerController = isMemberAsContainerController(chat);
  const status = config.get('status');
  if (
    !asAdmin &&
    ['sleep', 'deactivated', 'maintenance'].some((t) => t === status)
  ) {
    const message = getStatusMessage(status);
    switch (status) {
      case 'sleep':
        await bot.sendSticker(chatId, STICKER_ID.busy);
        break;
      case 'maintenance':
        await bot.sendSticker(chatId, STICKER_ID.working);
        break;
      default:
        break;
    }
    await bot.sendMessage(chatId, message);
    return;
  }
  if (!logCode) return;

  const isTrackingNumber = !logCode.startsWith('25');

  if (
    config
      .get('bannedUsers')
      ?.some((u) => u === (chat.username || chat.first_name))
  ) {
    bot.sendMessage(
      chatId,
      ''.concat(
        'គណនីរបស់អ្នកបានជាប់ក្នុងបញ្ជីរស្បែកខ្មៅ សូមទាក់ទងទៅអ្នកគ្រប់គ្រងរបស់អ្នក។\n',
        '❌ Sorry, Your account has been banned. Please contact to admin.'
      )
    );
    return;
  }
  let loadingMsgId;

  try {
    globalLogCode = logCode;
    const loadingMessage = await bot.sendMessage(
      chatId,
      IS_DEV ? LOADING_TEXT : 'សូមចុចប៊ូតុងខាងក្រោម! 👇',
      {
        parse_mode: 'Markdown',
        reply_markup: IS_DEV
          ? undefined
          : {
              inline_keyboard: [
                [
                  {
                    text: 'Open',
                    web_app: {
                      url: `${PUBLIC_URL}/wl/${globalLogCode}?web=html`,
                    },
                  },
                ],
              ],
              resize_keyboard: true,
            },
      }
    );

    loadingMsgId = loadingMessage.message_id;
    if (!IS_DEV) return;

    // THE AWAITED LONG-RUNNING OPERATION ---
    const cookie =
      (config.get('cookie') as string) || process.env.WL_COOKIE || '';
    const wl = new WLLogistic(logCode, cookie);
    wl.asAdminMember = asAdminMember;
    wl.onError = function (error) {
      console.error('Error Fetch Data', error);
      bot
        .sendMessage(chatId, 'oOP! Unavailable to access data.')
        .then((message) => {
          invalidMessage.chatId = chatId;
          invalidMessage.messageId = message.message_id;
        });
    };
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
      if (options?.showAllSmallPackage && !_data.smallPackageGoodsNames) {
        refetchData = true;
      }
    } else if (options?.isSubLogCode) {
      const _data = [...cacheData.values()].find((d) =>
        d.sub_logcode?.includes(logCode)
      );
      if (_data && !('message' in _data)) {
        refetchData = false;
        data = _data;
        if (options?.showAllSmallPackage && !_data.smallPackageGoodsNames) {
          refetchData = true;
        } else {
          hasSubLogCodeCache = true;
        }
      }
    }
    if (refetchData) {
      const wl_data = await wl.getDataFromLogCode(
        logCode,
        options?.showAllSmallPackage,
        options?.isSubLogCode
      );
      if (wl_data && 'message' in wl_data && wl_data.message === 'not found') {
        await bot.deleteMessage(chatId, loadingMsgId);
        await bot.sendMessage(
          chatId,
          wl_data.requireLogin
            ? '❌ oOP! Unavailable to access data.'
            : `🤷 លេខបុង <b>${logCode}</b> មិនទាន់មានទិន្នន័យនោះទេ។\n🤓 សូមពិនិត្យមើលឡើងវិញម្តងទៀត...`,
          sendMessageOptions({
            parse_mode: 'HTML',
          })
        );
        if (
          wl_data.requireLogin &&
          process.env.ADMIN_ID &&
          config.get('status') !== 'maintenance'
        ) {
          config.set('status', 'maintenance');
          try {
            bot.sendMessage(chatId, statusMessage.maintenance);
            await bot.sendSticker(chatId, STICKER_ID.working);
            bot.sendMessage(
              Number(process.env.ADMIN_ID.split(',')[0]),
              'Hey, Admin! Please login and update cookie.',
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: 'Goto Login',
                        url: `${WL_PUBLIC_URL}${wl_data.path}`,
                      },
                      { text: 'Update Cookie', url: WL_PRIVATE_API },
                    ],
                  ],
                },
              }
            );
          } catch (error: any) {
            console.error(
              'Error to send a notification to admin.',
              error.message
            );
          }
        }
        return;
      } else {
        // @ts-ignore
        data = wl_data;
      }
    }
    const showData = await ShowDataMessageAndPhotos(bot, chat, data, wl, {
      logCode,
      isTrackingNumber,
      hasSubLogCodeCache,
      asAdmin,
      asAdminMember,
      asMemberContainerController,
      loadingMsgId,
      withMore: options?.withMore,
    });
    if (showData?.noImage) return;
    if (loadingMsgId) {
      await bot.deleteMessage(chatId, loadingMsgId);
    }
  } catch (error) {
    console.error(
      'Error in image generation process:',
      (error as Error).message
    );

    // Try to delete the loading message if it was sent successfully
    if (loadingMsgId) {
      try {
        await bot.deleteMessage(chatId, loadingMsgId);
      } catch (error) {
        console.warn(
          'Could not delete loading message on error:',
          (error as Error).message
        );
      }
    }

    // Send the error message
    await bot.sendMessage(
      chatId,
      // '❌ Sorry, the generation failed. Please try again.'
      '❌ សូមទោស! ការផ្ញើរូបភាពមានបញ្ហា សូមព្យាយាមម្តងទៀត។'
    );
  }
}

export const configUserWithAdminPermission = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  options: {
    key: keyof ConfigCache;
    type: 'add' | 'remove';
    username_or_first_name?: string;
  }
) => {
  const chatId = msg.chat.id;
  const username_or_first_name = options.username_or_first_name
    ?.trim()
    .substring(0, 20);
  if (isAdmin(msg.chat)) {
    const members = (config.get(options.key) as string[]) || [];
    if (username_or_first_name) {
      const hasMember = members.includes(username_or_first_name);
      let botMessage = '';
      if (options.type === 'add') {
        if (!hasMember)
          config.set(options.key, [...members, username_or_first_name]);

        let addedMessage = '';
        switch (options.key) {
          case 'WL_MEMBERS_LIST':
            addedMessage = 'បានចូលជាសមាជិកពេញសិទ្ធិ។';
            break;
          case 'bannedUsers':
            addedMessage = 'added to ban list.';
            break;

          default:
            break;
        }
        botMessage = !hasMember
          ? `✅ ${username_or_first_name} ${addedMessage}`
          : `${username_or_first_name} already added!`;
      } else if (options.type === 'remove') {
        if (hasMember)
          config.set(
            options.key,
            members.filter((m) => m !== username_or_first_name)
          );
        let removedMessage = '';
        switch (options.key) {
          case 'WL_MEMBERS_LIST':
            removedMessage = 'បានដកចេញពីសមាជិកពេញសិទ្ធិ។';
            break;
          case 'bannedUsers':
            removedMessage = 'removed from ban list.';
            break;

          default:
            break;
        }
        botMessage = hasMember
          ? `✅ ${username_or_first_name} ${removedMessage}`
          : `Currently, ${username_or_first_name} is not in ${options.key.toUpperCase()}.`;
      }
      await bot.sendMessage(chatId, botMessage);
    }
  } else {
    await bot.sendMessage(
      chatId,
      `❌ ${msg.chat.first_name} អ្នកមិនមានសិទ្ធិក្នុងការបន្ថែមសមាជិកនោះទេ!`
    );
  }
};

export const onTextConfigUserWithAdminPermission = (
  bot: TelegramBot,
  regexp: RegExp,
  options: {
    key: keyof ConfigCache;
    type: 'add' | 'remove';
  }
) => {
  bot.onText(regexp, async (msg, match) => {
    await configUserWithAdminPermission(bot, msg, {
      ...options,
      username_or_first_name: match?.[1]?.trim(),
    });
  });
};

export const alertNoPermissionMessage = async (
  bot: TelegramBot,
  chatId: TelegramBot.ChatId,
  fullname: string
) => {
  return bot.sendMessage(
    chatId,
    `Hey, <b>${fullname}</b>!\n⚠️ You don't have permission this use this action.`,
    { parse_mode: 'HTML' }
  );
};

const integerRegExp = /^\d+$/;

export function runBot(bot: TelegramBot, { webAppUrl }: { webAppUrl: string }) {
  const commandsAdmin = [
    { command: 'start', description: 'Start the bot' },
    { command: 'settings', description: 'Show all button actions' },
    { command: 'setCookie', description: 'Set new cookie' },
  ];
  bot.onText(/\/menu (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const text = match?.[1].trim().toLowerCase();
    if (isAdmin(msg.chat))
      bot
        .setMyCommands(
          ['off', 'hidden', 'disable'].some((t) => t === text)
            ? []
            : commandsAdmin
        )
        .then(() => {
          console.log('Command menu updated successfully');
        });
    else {
      const { fullname } = getFullname(msg.chat);
      alertNoPermissionMessage(bot, chatId, fullname);
    }
  });
  bot.onText(/\/test (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    let base = match?.[1].trim();

    if (!base) return;
    if (!base.includes('.')) {
      base = `${base}.jpg`;
    }

    const url = `${PUBLIC_URL}/blob/image?url=${WL_PUBLIC_URL}/upload/${base}`;
    try {
      await bot.sendPhoto(chatId, url);
    } catch (error: any) {
      console.error('Error send photo', error);
    }
  });

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(
      chatId,
      `សួស្តី! ${msg.chat.first_name}\nសូមបញ្ចូលលេខបុង... 👇👇👇`
    );
  });

  const setCookie = async (
    chatId: TelegramBot.ChatId,
    cookie: string,
    options?: { testingData?: boolean; asAdminMember?: boolean }
  ) => {
    cookie = !cookie.startsWith('PHPSESSID=')
      ? 'PHPSESSID='.concat(cookie)
      : cookie;
    config.set('cookie', cookie);
    await bot.sendMessage(
      chatId,
      '✅ Successfully set new cookie. Then try to get data...'
    );
    options = options || {};
    if (options.testingData) {
      const wl = new WLLogistic('251209180405', cookie);
      wl.asAdminMember = Boolean(options.asAdminMember);
      wl.onError = function (error) {
        console.error('Error Fetch Data', error);
        bot.sendMessage(chatId, 'oOP! Unavailable to access data.');
      };
      const dataList = await wl.getFirstData();
      const isRequireLogin = isObject(dataList) && 'url' in dataList;
      await bot.sendMessage(
        chatId,
        isRequireLogin
          ? 'Login is requires.'
          : `✅ Successfully testing data(dataList.length = ${dataList.length})`
      );
      if (!isRequireLogin && isArray(dataList)) {
        config.set('status', 'active');
      }
    }
  };
  bot.onText(/\/setCookie/, async (msg) => {
    const chatId = msg.chat.id;
    config.set('waitingCookie', true);
    await bot.sendMessage(chatId, 'Please give me the cookie.');
  });

  bot.onText(/\/setCookie (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    let cookie = match?.[1]?.trim();
    const asAdminMember = isMemberAsAdmin(msg.chat);
    if (typeof cookie === 'string') {
      await setCookie(chatId, cookie, { testingData: true, asAdminMember });
    } else {
      config.set('waitingCookie', true);
      await bot.sendMessage(chatId, 'Please give me the cookie.');
    }
  });

  onTextConfigUserWithAdminPermission(bot, /\/addAdmin (.+)/, {
    key: 'ADMIN_LIST',
    type: 'add',
  });
  onTextConfigUserWithAdminPermission(bot, /\/removeAdmin (.+)/, {
    key: 'ADMIN_LIST',
    type: 'remove',
  });
  onTextConfigUserWithAdminPermission(bot, /\/addMember (.+)/, {
    key: 'WL_MEMBERS_LIST',
    type: 'add',
  });
  onTextConfigUserWithAdminPermission(bot, /\/removeMember (.+)/, {
    key: 'WL_MEMBERS_LIST',
    type: 'remove',
  });
  onTextConfigUserWithAdminPermission(bot, /\/addCC (.+)/, {
    key: 'CONTAINER_CONTROLLER_LIST',
    type: 'add',
  });
  onTextConfigUserWithAdminPermission(bot, /\/removeCC (.+)/, {
    key: 'CONTAINER_CONTROLLER_LIST',
    type: 'remove',
  });
  onTextConfigUserWithAdminPermission(bot, /\/addBanUser (.+)/, {
    key: 'bannedUsers',
    type: 'add',
  });
  onTextConfigUserWithAdminPermission(bot, /\/removeBanUser (.+)/, {
    key: 'bannedUsers',
    type: 'remove',
  });

  const getConfigUsers = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    if (isAdmin(msg.chat)) {
      const data = Array.from(config.entries())
        .filter(([_, v]) => Array.isArray(v))
        .map(
          ([k, v]) =>
            `=== ✅ ${k.toUpperCase()} ✅ ===\n${(v as string[]).join(', ')}`
        )
        .join('\n\n')
        .substring(0, MAX_TEXT_LENGTH);
      await bot.sendMessage(chatId, data).catch();
    }
  };
  const getActiveUsers = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    if (isAdmin(msg.chat)) {
      const data = Array.from(activeUserMap.entries());
      let message = 'no active user';
      if (data.length) {
        message = 'All active members of WL Checker Bot';
      }
      await bot
        .sendMessage(chatId, message, {
          reply_markup: data.length
            ? {
                inline_keyboard: chunkArray(
                  data.map(([id, d]) => ({
                    text: d.fullnameWithUsername,
                    callback_data: `user_info_${id}`,
                  })),
                  3
                ),
              }
            : undefined,
        })
        .catch();
    }
  };
  const resetData = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    cacheData.clear();
    if (IS_DEV && isAdmin(msg.chat)) {
      const fs = process.getBuiltinModule('fs');
      if (fs && fs.existsSync(fileData)) {
        fs.unlinkSync(fileData);
      }
    }
    await bot.sendMessage(chatId, '✅ Successfully data reset');
  };
  const clearAll = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    try {
      let isError = false;
      let message = '✅ Done!!!';
      if (fs && IS_DEV) {
        const files = fs.readdirSync(cachePath);
        const filesToDelete = files.filter((file) => {
          const isException = file === currentFileName;
          const isJson = path.extname(file).toLowerCase() === '.json';

          const fullPath = path.join(cachePath, file);
          const isFile = fs.statSync(fullPath).isFile();
          return isJson && isFile && !isException;
        });
        filesToDelete.forEach((file) => {
          const filePath = path.join(cachePath, file);
          try {
            fs.unlinkSync(filePath);
          } catch (err) {
            isError = true;
            message = `❌ Failed to delete ${file}: ` + (err as Error).message;
            console.error(message);
          }
        });
      }
      bot.sendMessage(chatId, message);
    } catch (error) {
      console.error('Error sending clear message:', (error as Error).message);
    }
  };
  const getLogCodes = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    const data = Array.from(cacheData.values());
    await bot.sendMessage(
      chatId,
      data.length
        ? data
            .map(
              (d) =>
                `/${Number(d.logcode)} (${d.mark_name} - P:${
                  d.warehousing_pic.split(',').filter(Boolean).length
                })`
            )
            .join('\n')
            .substring(0, MAX_TEXT_LENGTH)
        : 'No LogCodes'
    );
  };
  const getLogging = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    const loggingData = Array.from(loggingCache.values());
    if (loggingData.length) {
      try {
        await bot.sendMessage(
          chatId,
          loggingData.join('\n').substring(0, MAX_TEXT_LENGTH),
          sendMessageOptions({ parse_mode: 'HTML' })
        );
      } catch {}
    }
  };
  const setStatus = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    if (isAdmin(msg.chat)) {
      const status = config.get('status');
      bot
        .sendMessage(
          chatId,
          'Currently, the Bot is '.concat(status || 'active', '.'),
          {
            reply_markup: {
              inline_keyboard: chunkArray(
                ['active', 'sleep', 'deactivated', 'maintenance'].map((s) => ({
                  text: `Set to ${s.toUpperCase()}`,
                  callback_data: `set_status_${s}`,
                })),
                2
              ),
            },
          }
        )
        .catch();
    }
  };

  bot.onText(/(\/settings|\/stg)/, (msg) => {
    const chatId = msg.chat.id;

    if (isAdmin(msg.chat)) {
      const status = config.get('status') || 'active';
      bot
        .sendMessage(
          chatId,
          'All buttons for Administrators. Status: '.concat(
            status.toUpperCase()
          ),
          {
            reply_markup: {
              inline_keyboard: [
                [...adminInlineKeyboardButtons.slice(0, 3)],
                [...adminInlineKeyboardButtons.slice(3, 6)],
                [...adminInlineKeyboardButtons.slice(6)],
              ],
            },
          }
        )
        .catch();
    }
  });

  bot.onText(/\/getLogCodes/, getLogCodes);
  bot.onText(/\/getLogging/, getLogging);
  bot.onText(/\/getConfigUsers/, getConfigUsers);
  bot.onText(/\/resetData/, resetData);
  bot.onText(/\/clear/, clearAll);
  bot.onText(/\/status/, setStatus);
  bot.onText(/\/setStatus (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const [text, ...other] = match?.[1].split('|') || [];
    if (isAdmin(msg.chat)) {
      const customStatusMessage = other?.join('|');
      if (customStatusMessage) {
        config.set('statusMessage', customStatusMessage);
      }
      config.set('status', text);
      bot
        .sendMessage(
          chatId,
          'Bot now is '.concat(text || 'running normal', '.')
        )
        .catch();
    }
  });

  bot.on('callback_query', async function onCallbackQuery(query) {
    const action = query.data;
    const msg = query.message;
    const chatId = msg?.chat.id;
    try {
      if (chatId) {
        const { fullname, fullnameWithUsername } = getFullname(msg.chat);
        if (action === 'delete') {
          try {
            bot.deleteMessage(chatId, msg.message_id);
          } catch (error) {
            console.error('Error delete message:', (error as Error).message);
          }
        } else if (action?.startsWith('tr_from_')) {
          let from = action.replace('tr_from_', '');
          if (from.startsWith('zh|')) {
            const logCode = from.replace('zh|', '').trim();
            const data = cacheData.get(logCode);
            const text = data?.goods_name.trim();
            if (!text) return;
            try {
              const loadingMessage = await bot.sendMessage(
                chatId,
                '⏳ កំពុងបកប្រែ សូមមេត្តារងចាំបន្តិចសិន...'
              );
              const res = await translate(text, { to: 'km' });
              loggingCache.add(
                `👉 ${fullname} clicked translate button from log code /${logCode}`
              );
              bot.editMessageText(`${text} \n👉👉👉 ${res.text}`, {
                chat_id: chatId,
                message_id: loadingMessage.message_id,
              });
            } catch (error) {
              console.error((error as Error).message);
              bot.answerCallbackQuery(query.id, {
                text: '❌ Translation failed!',
              });
            }
          }
        } else if (action?.startsWith('show_more_data')) {
          let logCode = action.replace('show_more_data', '').trim();
          let data = cacheData.get(logCode);
          if (!data && !logCode.startsWith('25')) {
            data = [...cacheData.values()].find((d) =>
              d.sub_logcode.includes(logCode)
            );
          }
          if (!data) return;
          loggingCache.add(
            `👉 ${fullname} clicked show more button from log code /${logCode}`
          );
          await showMoreDataCaption(bot, chatId, data);
        } else if (action?.startsWith('user_info_')) {
          const userId = action.replace('user_info_', '');
          if (isNumber(userId)) {
            const id = Number(userId);
            const member = activeUserMap.get(id);
            if (member) {
              member.id = `\`${id}\``;
              await bot.sendMessage(chatId, JSON.stringify(member, null, 2), {
                parse_mode: 'Markdown',
              });
            }
          }
        } else if (action?.startsWith('set_status_')) {
          const status = action.replace(
            'set_status_',
            ''
          ) as keyof typeof statusMessage;
          config.set('status', status);
          await bot.sendMessage(chatId, statusMessage[status], {
            parse_mode: 'Markdown',
          });
        } else {
          switch (action as AdminInlineKeyboardAction) {
            case 'getLogCodes':
              getLogCodes(msg);
              break;
            case 'getLogging':
              getLogging(msg);
              break;
            case 'setStatus':
              setStatus(msg);
              break;
            case 'getConfigUsers':
              getConfigUsers(msg);
              break;
            case 'getActiveUsers':
              getActiveUsers(msg);
              break;
            case 'saveUsers':
              saveUser(bot, msg);
              break;
            case 'resetData':
              resetData(msg);
              break;
            case 'clear':
              clearAll(msg);
              break;

            default:
              break;
          }
        }
      }
    } catch (error) {
      console.error('Error delete message:', (error as Error).message);
    }
  });

  const onTextCheckLogCodeAction = async (
    bot: TelegramBot,
    chatId: TelegramBot.ChatId,
    msg: TelegramBot.Message,
    logCode: string,
    showAllSmallPackage?: boolean
  ) => {
    const isValidSmallPackageOrTrackingLogCode = logCode.startsWith('1757')
      ? logCode.length === 10
      : logCode.length >= 12 && logCode.length <= 16;

    if (!isValidSmallPackageOrTrackingLogCode) {
      bot.sendMessage(
        chatId,
        ''.concat(
          'នែ៎ៗៗ! លេខកូដមិនត្រឹមត្រូវទេ។ សូមបញ្ចូលម្តងទៀត។\n',
          '❌ Sorry, invalid code. Please try again.'
        )
      );
    } else {
      await onTextNumberAction(bot, msg.chat, logCode, {
        showAllSmallPackage,
        isSubLogCode: true,
      });
    }
  };

  bot.onText(/^(?!\/)(?!\d+$).+/, async (msg, match) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!match || !text) {
      return;
    }

    let logCode = text.trim();
    let showAllSmallPackage = false;
    if (
      logCode.toLowerCase().startsWith('c:') ||
      logCode.toLowerCase().startsWith('s:') ||
      logCode.toLowerCase().startsWith('sm:')
    ) {
      showAllSmallPackage = logCode.toLowerCase().startsWith('sm:');
      logCode = logCode.slice(showAllSmallPackage ? 3 : 2).trim();
    }
    onTextCheckLogCodeAction(bot, chatId, msg, logCode, showAllSmallPackage);
  });

  bot.onText(integerRegExp, async (msg, match) => {
    if (!match) {
      bot.sendMessage(msg.chat.id, '❌ Sorry, invalid Code. Please try again.');
      return;
    }
    const logCode = msg.text?.trim() || '';
    const options = getValidationOptions(logCode, bot, msg.chat.id);
    await onTextNumberAction(bot, msg.chat, logCode, options);
  });

  // Listen for data sent back from the Mini App (via tg.sendData)
  let logCount = 0;
  bot.on('message', async (msg) => {
    const {
      chat: { id: chatId, first_name, last_name, username },
    } = msg;
    const userId = msg.from?.id;
    if (!userId) return;

    const { fullname, fullnameWithUsername } = getFullname(msg.chat);
    const text = msg.text?.trim() || '';

    const asAdmin = isAdmin(msg.chat);
    const asAdminMember = isMemberAsAdmin(msg.chat);

    if (asAdmin) {
      if (text && config.get('waitingCookie') === true) {
        config.set('waitingCookie', false);
        await setCookie(chatId, text, { testingData: true, asAdminMember });
        return;
      }
    }

    const nameWithChatId = fullname + '|' + chatId;
    const currentDateString = new Date().toLocaleString().replace(',', ' |');
    const logging = [
      'message',
      text.startsWith('/') ? text : `<code>${text}</code>`,
      'by user:',
      nameWithChatId,
      'at',
      currentDateString,
    ];
    console.log(logging.join(' '));

    if (!asAdmin && !activeUserMap.has(userId)) {
      activeUserMap.set(userId, {
        fullnameWithUsername: fullnameWithUsername,
        username: msg.from?.username,
        firstSeen: new Date(),
      });
    }

    if (currentDate.day() === new Date().getDate()) {
      if (logCount > 50) {
        logCount = 0;
        const allLoggingCaches = Array.from(loggingCache.values());
        loggingCache.clear();
        allLoggingCaches
          .reverse()
          .slice(0, 20)
          .reverse()
          .forEach((l) => {
            loggingCache.add(l);
          });
      }
      logCount++;
      loggingCache.add(logging.join(' '));
    } else {
      loggingCache.clear();
    }

    if (
      [
        '/add',
        '/remove',
        '/add',
        '/remove',
        '/get',
        '/set',
        '/reset',
        '/clear',
        '/show',
      ].some((t) => text.startsWith(t)) &&
      !asAdmin
    ) {
      await alertNoPermissionMessage(bot, chatId, fullname);
      return;
    }
    const { chatId: chat_id, messageId } = { ...invalidMessage };
    if (chat_id && messageId) {
      try {
        invalidMessage.chatId = undefined;
        invalidMessage.messageId = undefined;
        await bot.deleteMessage(chat_id, messageId, {
          parse_mode: 'Markdown',
        });
      } catch (error) {
        console.error('Error delete invalid message', (error as Error).message);
      }
    }
    if (text.startsWith('/')) {
      const t = text.slice(1);
      const isNumeric = integerRegExp.test(t);
      if (isNumeric) {
        await onTextNumberAction(bot, msg.chat, t);
      }
    }
  });

  bot.on('polling_error', (error) => {
    console.error('[Polling Error]', error.name, error.message);
  });

  bot.on('sticker', (msg) => {
    const stickerId = msg.sticker?.file_id;
    const stickerSet = msg.sticker?.set_name;
    if (isAdmin(msg.chat)) {
      console.log(`Sticker ID: ${stickerId}`);
      console.log(`From Set: ${stickerSet}`);
      // The bot will reply with the ID so you can copy it easily
      bot.sendMessage(
        msg.chat.id,
        `The ID for this sticker is:\n\`${stickerId}\``,
        { parse_mode: 'Markdown' }
      );
    }
  });

  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;

    // Telegram sends multiple sizes; the last one is usually the highest resolution
    const fileId = msg.photo?.[msg.photo.length - 1].file_id as string;

    try {
      const loadingMessage = await bot.sendMessage(
        chatId,
        '🧐 Scanning image, please wait...'
      );
      const fileLink = await bot.getFileLink(fileId);
      const image = await Jimp.read(fileLink);
      const { width, height, data } = image.bitmap;

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
        BarcodeFormat.EAN_13,
        BarcodeFormat.CODE_39,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new MultiFormatReader();
      reader.setHints(hints);

      const len = width * height;
      const luminances = new Uint8ClampedArray(len);
      for (let i = 0; i < len; i++) {
        luminances[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
      }

      const source = new RGBLuminanceSource(luminances, width, height);
      const bitmap = new BinaryBitmap(new HybridBinarizer(source));

      // Decode and respond
      const result = reader.decode(bitmap);
      const logCode = result.getText().trim();

      bot
        .editMessageText(`លេខកូដ: \`${logCode}\``, {
          chat_id: loadingMessage.chat.id,
          message_id: loadingMessage.message_id,
          parse_mode: 'Markdown',
        })
        .catch();
      await onTextCheckLogCodeAction(bot, chatId, msg, logCode);
    } catch (err: any) {
      if (
        err.name === 'NotFoundException' ||
        err.message.includes('No MultiFormat Readers')
      ) {
        bot.sendMessage(
          chatId,
          'សុំរូបភាពច្បាស់បន្តិចមក!!!\n' +
            '❌ No barcode or QR code detected. Try a clearer or closer photo.'
        );
      } else {
        console.error(err.message);
        bot.sendMessage(
          chatId,
          '⚠️ An error occurred while processing the image.'
        );
      }
    }
  });

  bot.on('web_app_data', (msg) => {
    const {
      chat: { id: chatId },
      web_app_data,
    } = msg;
    const data = web_app_data?.data;

    console.log('msg', msg.chat);
    console.log('web_app_data', data);

    if (data)
      try {
        const parsedData = JSON.parse(data);

        bot.sendMessage(
          chatId,
          `✅ **Data received from Web App:**\n\n` +
            `**Name:** ${parsedData.name}\n` +
            `**Result:** ${parsedData.result}`,
          {
            parse_mode: 'Markdown',
          }
        );
      } catch (e) {
        bot.sendMessage(chatId, `Raw data received: ${data}`);
      }
  });

  return bot;
}

export { config };

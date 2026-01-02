import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import { DataExpand, WLLogistic } from '../wl/edit';
import { Data } from '../wl/types';
import { chunkArray, isNumber, removeDuplicateObjArray } from '../utils/is';
import {
  ADMIN_LIST,
  CONTAINER_CONTROLLER_LIST,
  IS_DEV,
  PUBLIC_URL,
  WL_MEMBERS_LIST,
  WL_PRIVATE_API,
  WL_PUBLIC_URL,
} from '../config/constants';
import { STICKER_ID } from './sticker';
import type {
  ActiveUserData,
  ConfigCache,
  MapConfig,
  OnTextNumberActionOptions,
} from './types';
import { sendMessageOptions } from './send-options';

export function getFullname(chat: TelegramBot.Chat) {
  const { first_name, last_name, username } = chat;
  const fullname =
    (first_name || '') + (last_name ? ` ${last_name}` : '') || 'Anonymous';
  const fullnameWithUsername = fullname + (username ? `(@${username})` : '');
  return { fullname, fullnameWithUsername };
}

export function isAdmin(chat: TelegramBot.Chat, config: MapConfig) {
  const ADMIN_LIST = config.get('ADMIN_LIST') as string[] | undefined;
  if (!ADMIN_LIST) return false;
  return ADMIN_LIST.some((n) =>
    isNumber(n)
      ? n === String(chat.id)
      : n === (chat.username || chat.first_name)
  );
}

export function isMemberAsAdmin(chat: TelegramBot.Chat, config: MapConfig) {
  const WL_MEMBERS_LIST = config.get('WL_MEMBERS_LIST') as string[] | undefined;
  if (!WL_MEMBERS_LIST) return false;
  return WL_MEMBERS_LIST.some((n) =>
    isNumber(n)
      ? n === String(chat.id)
      : n === (chat.username || chat.first_name)
  );
}

export function isMemberAsContainerController(
  chat: TelegramBot.Chat,
  config: MapConfig,
  currentUser: ReturnType<typeof getFullname>
) {
  const { fullname } = currentUser;
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
export const MAX_CAPTION_LENGTH = 1024;
export const MAX_TEXT_LENGTH = 4096;
const fs = process.getBuiltinModule('fs');

export class WLCheckerBotPreLoad {
  fs = fs;
  currentDate = {} as ReturnType<WLCheckerBotPreLoad['getCurrentData']>;
  cachePath = '';
  usersFile = '';
  currentFileName = '';
  fileData = '';
  cacheData: Iterable<readonly [string, Data]> | undefined;
  usersData: Iterable<readonly [number, ActiveUserData]> | undefined;
  cacheDataMap: Map<string, DataExpand> = new Map();
  config: MapConfig = new Map();
  activeUserMap = new Map<number, ActiveUserData>();
  loggingCache = new Set<string>();
  invalidMessage = { chatId: undefined, messageId: undefined } as Record<
    'chatId' | 'messageId',
    number | undefined
  >;
  statusMessage = {
    active: 'Currently, the Bot is active.',
    sleep:
      "ខ្ញុំជាប់រវល់ហើយ ⏳ សូមមេត្តារងចាំ...\n🤓 Sorry, I'm too busy. Please wait...",
    deactivated: '🔴 ប្រព័ន្ធបានបិទដំណើរហើយ។\nThe system has been deactivated.',
    maintenance:
      '👨‍💻 ប្រព័ន្ធកំពុងធ្វើបច្ចុប្បន្នភាព!!! ☕ សូមមេត្តារងចាំបន្តិច...\n🤓 The system is updating. Please wait...',
  };
  singleAdminId = 0;
  asAdmin = false;
  asAdminMember = false;
  asMemberContainerController = false;
  currentUser = {} as ReturnType<typeof getFullname>;
  constructor(public bot: TelegramBot) {
    this.currentDate = this.getCurrentData();
    // this.publicPath = path.join(process.cwd(), 'public');
    this.cachePath = path.join(process.cwd(), 'cache');
    this.usersFile = path.join(this.cachePath, 'users.json');
    this.currentFileName = `data-${this.currentDate.month()}-${this.currentDate.day()}.json`;
    this.fileData = path.join(this.cachePath, this.currentFileName);

    this.loadCacheData();
  }
  getCurrentData() {
    return {
      date: new Date(),
      month() {
        return this.date.getMonth() + 1;
      },
      day() {
        return this.date.getDate();
      },
    };
  }
  loadCacheData() {
    if (IS_DEV && fs) {
      if (fs.existsSync(this.fileData)) {
        const dataString = fs.readFileSync(this.fileData, {
          encoding: 'utf-8',
        });
        if (dataString.startsWith('[') && dataString.endsWith(']')) {
          try {
            this.cacheData = JSON.parse(dataString);
          } catch {}
        }
      }
      if (fs.existsSync(this.usersFile)) {
        const dataString = fs.readFileSync(this.usersFile, {
          encoding: 'utf-8',
        });
        if (dataString.startsWith('[') && dataString.endsWith(']')) {
          try {
            this.usersData = JSON.parse(dataString);
          } catch {}
        }
      }
    }

    this.cacheDataMap = new Map<string, DataExpand>(this.cacheData);

    this.config.set('ADMIN_LIST', ADMIN_LIST ? ADMIN_LIST.split(',') : []);
    this.config.set(
      'WL_MEMBERS_LIST',
      WL_MEMBERS_LIST ? WL_MEMBERS_LIST.split(',') : []
    );
    this.config.set(
      'CONTAINER_CONTROLLER_LIST',
      CONTAINER_CONTROLLER_LIST ? CONTAINER_CONTROLLER_LIST.split(',') : []
    );
    this.config.set('bannedUsers', []);
    if (process.env.BOT_STATUS === 'maintenance')
      this.config.set('status', 'maintenance');

    this.activeUserMap = new Map(this.usersData);
  }
  async saveUser(msg: TelegramBot.Message) {
    if (!fs) return;

    const chatId = msg.chat.id;
    if (IS_DEV && this.asAdmin)
      try {
        const activeUserData = [...this.activeUserMap.entries()];
        if (activeUserData.length) {
          fs.writeFileSync(this.usersFile, JSON.stringify(activeUserData));
        }
        let message = 'no active user';
        if (activeUserData.length) {
          message = `✅ Successfully save users to file:\`${
            path.parse(this.usersFile).base
          }\``;
        }
        await this.bot
          .sendMessage(chatId, message, { parse_mode: 'Markdown' })
          .catch();
      } catch (error: any) {
        console.log('Error save users', error.message);
      }
  }
  getStatusMessage(status?: ConfigCache['status']) {
    const customStatusMessage = this.config.get('statusMessage');
    let message = this.statusMessage.sleep;
    switch (status) {
      case 'deactivated':
        message = this.statusMessage.deactivated;
        break;
      case 'maintenance':
        message = this.statusMessage.maintenance;
        break;
      default:
        break;
    }
    message = customStatusMessage?.trim() || message;
    return message;
  }
}

export class WLCheckerBotSendData extends WLCheckerBotPreLoad {
  wl_cookie = process.env.WL_COOKIE || '';
  constructor(bot: TelegramBot) {
    super(bot);
    const adminId = process.env.ADMIN_ID?.split(',')[0];
    if (isNumber(adminId)) {
      this.singleAdminId = Number(adminId);
    }
  }
  refreshTypeMember(chat: TelegramBot.Chat) {
    this.currentUser = getFullname(chat);
    this.asAdmin = isAdmin(chat, this.config);
    this.asAdminMember = isMemberAsAdmin(chat, this.config);
    this.asMemberContainerController = isMemberAsContainerController(
      chat,
      this.config,
      this.currentUser
    );
  }
  isBannedUser(chat: TelegramBot.Chat) {
    const alertMessage = ''.concat(
      'គណនីរបស់អ្នកបានជាប់ក្នុងបញ្ជីរស្បែកខ្មៅ សូមទាក់ទងទៅអ្នកគ្រប់គ្រងរបស់អ្នក។\n',
      '❌ Sorry, Your account has been banned. Please contact to admin.'
    );
    return [
      this.config
        .get('bannedUsers')
        ?.some((u) =>
          isNumber(u)
            ? Number(u) === chat.id
            : u === (chat.username || chat.first_name)
        ),
      alertMessage,
    ] as const;
  }
  getValidationLogCodeOptions(logCode: string, chatId?: TelegramBot.ChatId) {
    const isNearToNewLogCode = logCode.startsWith('24');
    const isTrackingNumber = !logCode.startsWith('25');
    const isNewLogCode = !isTrackingNumber && logCode.length === 12;
    const isOldLogCode = logCode.startsWith('1757');
    const isSubLogCode =
      isTrackingNumber && logCode.length >= 12 && logCode.length <= 16;
    const isValidLogCode = isTrackingNumber
      ? logCode.length >= 12 && logCode.length <= 16
      : isNewLogCode;
    const options = {
      isNearToNewLogCode,
      isTrackingNumber: isTrackingNumber && !isNearToNewLogCode,
      isNewLogCode,
      isOldLogCode,
      isSubLogCode,
    } as Partial<OnTextNumberActionOptions>;
    if (isNearToNewLogCode || !isValidLogCode) {
      if (this.bot && chatId) {
        this.bot.sendMessage(
          chatId,
          'នែ៎ៗៗ! លេខបុងមិនត្រឹមត្រូវទេ។ សូមបញ្ចូលម្តងទៀត។\n'.concat(
            isOldLogCode || isNearToNewLogCode
              ? 'លេខបុងប្រភេទនេះមិនទាន់បញ្ចូលទិន្នន័យទេ សូមប្រើលេខបុងដែលចាប់ផ្តើមពីលេខ25\n'
              : '',
            '❌ Sorry, invalid code. Please try again.'
          )
        );
        return 'Invalid code';
      }
    }
    return options;
  }
  saveCacheData(data?: DataExpand, hasSubLogCodeCache?: boolean) {
    const _logCode = data?.logcode;
    if (!_logCode) return;

    if (!hasSubLogCodeCache && !this.cacheDataMap.get(_logCode)) {
      this.cacheDataMap.set(_logCode, data);
      if (IS_DEV) {
        if (fs) {
          let cacheData = Array.from(this.cacheDataMap.entries());
          const dataLength = cacheData.length;
          if (dataLength > 50) {
            cacheData = cacheData.slice(dataLength - 50, dataLength - 1);
          }
          if (dataLength > 0)
            try {
              fs.writeFileSync(
                this.fileData,
                JSON.stringify(cacheData, null, 2),
                {
                  encoding: 'utf-8',
                }
              );
            } catch {}
        }
      }
    }
  }
  generateCaptions(
    logCodeFromCommand: string,
    data: DataExpand | undefined,
    isTrackingNumber: boolean
  ) {
    let fullCaption: string | undefined;
    let caption: string | undefined;

    if (data) {
      const goods_numbers =
        'goods_numbers' in data &&
        Array.isArray(data.goods_numbers) &&
        data.goods_numbers;
      const isSplitting = goods_numbers && goods_numbers.length > 1;
      fullCaption = ''
        .concat(
          `- លេខបុង: ${
            isTrackingNumber ? data.logcode : logCodeFromCommand
          } ✅ ${isSplitting ? 'ទូរចុងក្រោយ' : 'ទូរ'}: ${
            data.container_num?.split('-').slice(1).join('.') ||
            'N/A(ប្រហែលជើងអាកាស)'
          }\n`,
          `- កូដអីវ៉ាន់: ${data.mark_name}\n`,
          `- ចំនួន: ${data.goods_number}\n`,
          isSplitting
            ? `- ចំនួនបែងចែកទូរ: [${goods_numbers.join(', ')}]\n`
            : '',
          `- ទម្ងន់: ${
            data.weight.length <= 5
              ? data.weight
              : Number(data.weight).toFixed(2)
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
          this.asAdmin || this.asAdminMember || this.asMemberContainerController
            ? ''.concat(
                '- ទូរកុងតឺន័រ: ',
                data.container_num?.split('-')[0] || 'N/A(ប្រហែលជើងអាកាស)',
                '\n'
              )
            : '',
          `- ផ្សេងៗ: ${data.desc?.replace('到达', '到达(មកដល់)') || 'N/A'}\n`
        )
        .substring(0, MAX_TEXT_LENGTH);
      caption = fullCaption.substring(0, MAX_CAPTION_LENGTH);
    }
    return { caption, fullCaption };
  }
  async sendFullCationNoImageFound(
    chatId: number,
    fullCaption: string,
    data: DataExpand | undefined,
    afterSendCaption?: VoidFunction
  ) {
    await this.bot.sendMessage(
      chatId,
      `🤷 🏞🏞 អត់មានរូបភាពទេ 🏞🏞 🤷\n\n${fullCaption}`,
      sendMessageOptions()
    );
    if (data?.smallPackageGoodsNames?.length && data.subLogCodes) {
      await this.bot.sendMessage(
        chatId,
        '=== អីវ៉ាន់តូចៗទាំងអស់ ===\n'.concat(
          data.smallPackageGoodsNames.join('\n')
        ),
        sendMessageOptions()
      );
    }
    afterSendCaption?.();
    return { noImage: true };
  }
  async sendFullCaption(
    chat: TelegramBot.Chat,
    fullCaption: string,
    logCodeFromCommand: string,
    messageIdShowMore?: string | number
  ) {
    return await this.bot.sendMessage(
      chat.id,
      fullCaption,
      sendMessageOptions(
        {
          translateText: logCodeFromCommand,
          logCodeOrAndForShowMore: `${logCodeFromCommand}|${messageIdShowMore}`,
          chat,
        },
        this.asAdmin
      )
    );
  }
  async showMoreDataCaption(
    chatId: TelegramBot.ChatId,
    data: DataExpand | undefined,
    reply_to_message_id?: number
  ) {
    if (data) {
      await this.bot.sendMessage(
        chatId,
        ''
          .concat(
            `<b>Container Number:</b> <code>${
              data.container_num || 'N/A(ប្រហែលជើងអាកាស)'
            }</code>\n`,
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
          reply_to_message_id,
        })
      );
    }
  }
  async sendMediaGroup(
    msg: TelegramBot.Message,
    data: DataExpand | undefined,
    media: TelegramBot.InputMedia[]
  ) {
    const chatId = msg.chat.id;
    let messageIdShowMore: number | undefined;
    let errorMessageId: number | undefined;
    let isError = false;
    const medias = chunkArray(media, 10);
    const sendMediaGroup = async (retry = false) => {
      isError = false;
      const justOne = media.length === 1;
      // const sendMedia = media.length === 1 ? bot.sendPhoto : bot.sendMediaGroup
      for (let i = 0; i < medias.length; i++) {
        let inputMedia = medias[i];
        if (data?.tryToLoadImage || retry)
          inputMedia = medias[i].map((m) => ({
            ...m,
            media: `${PUBLIC_URL}/blob/image?url=${m.media}`,
            caption: justOne ? undefined : m.caption,
          }));
        else if (justOne) medias[i][0].caption = undefined;

        await this.bot
          .sendMediaGroup(chatId, inputMedia)
          .then(async (sentMessages) => {
            messageIdShowMore = sentMessages[0].message_id;
            console.log(
              justOne
                ? `✅ Successfully sent an photo.`
                : `✅ Successfully sent an album with ${sentMessages.length} items.`
            );
          })
          .catch(async (error) => {
            isError = true;
            console.error(
              justOne ? 'Error sending photo:' : 'Error sending media group:',
              (error as Error).message
            );
            const { message_id } = await this.bot.sendMessage(
              chatId,
              '❌ សូមទោស! ការផ្ញើរូបភាពមានបញ្ហា សូមព្យាយាមម្តងទៀត។'
            );
            errorMessageId = message_id;
            messageIdShowMore = msg.message_id;
          });
      }
    };
    await sendMediaGroup();
    if (isError) {
      if (data && 'medias' in data) data.tryToLoadImage = true;
      const tryLoadingMessage = await this.bot.sendMessage(
        chatId,
        '⏳ កំពុងដោះស្រាយរូបភាពដែលមានបញ្ហា...\nTrying load image...'
      );
      await sendMediaGroup(true);
      if (errorMessageId) {
        await this.bot.deleteMessage(chatId, errorMessageId).catch();
        await this.bot
          .deleteMessage(chatId, tryLoadingMessage.message_id)
          .catch();
      }
    }
    return { errorMessageId, isError, messageIdShowMore };
  }
  findDataFromCache(
    logCode: string,
    isTrackingNumber: boolean,
    options?: Partial<OnTextNumberActionOptions>
  ) {
    let data: DataExpand | undefined;
    let _logCode = logCode;

    const _data = this.cacheDataMap.get(_logCode) as typeof data;
    if (!_data && !isTrackingNumber) {
      data = this.cacheDataMap.values().find((d) => {
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
      const _data = [...this.cacheDataMap.values()].find((d) =>
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
    return { data, refetchData, hasSubLogCodeCache };
  }
  async getDataWLFetching(
    chat: TelegramBot.Chat,
    wl: WLLogistic,
    logCode: string,
    loadingMsgId: number | undefined,
    options?: Partial<OnTextNumberActionOptions>
  ) {
    const bot = this.bot;
    const chatId = chat.id;
    const wl_data = await wl.getDataFromLogCode(
      logCode,
      options?.showAllSmallPackage,
      options?.isSubLogCode
    );
    if (wl_data && 'message' in wl_data && wl_data.message === 'not found') {
      if (loadingMsgId) await bot.deleteMessage(chatId, loadingMsgId);
      await bot.sendMessage(
        chatId,
        wl_data.requireLogin
          ? '❌ oOP! Unavailable to access data.'
          : `🤷 លេខបុង <b>${logCode}</b> មិនទាន់មានទិន្នន័យនោះទេ។\n🤓 សូមពិនិត្យមើលឡើងវិញម្តងទៀត...`.concat(
              logCode.startsWith('24')
                ? `\n\nលេខបុងនេះទេហី 👉 <b>${logCode.replace('24', '/25')}</b>`
                : ''
            ),
        sendMessageOptions({
          parse_mode: 'HTML',
        })
      );
      if (
        wl_data.requireLogin &&
        this.singleAdminId &&
        this.config.get('status') !== 'maintenance'
      ) {
        this.config.set('status', 'maintenance');
        try {
          await bot.sendMessage(chatId, this.statusMessage.maintenance);
          await bot.sendSticker(chatId, STICKER_ID.working);
          bot.sendMessage(
            this.singleAdminId,
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
    }
    return wl_data;
  }
  async showDataMessageAndPhotos(
    msg: TelegramBot.Message,
    data: DataExpand | undefined,
    wl: WLLogistic,
    options: {
      logCode: string;
      isTrackingNumber: boolean;
      hasSubLogCodeCache?: boolean;
      loadingMsgId?: number;
      withMore?: boolean;
    }
  ) {
    const { logCode, isTrackingNumber, hasSubLogCodeCache, loadingMsgId } =
      options;
    const chat = msg.chat;
    const chatId = chat.id;
    let photos = [] as string[];
    let media = [] as TelegramBot.InputMedia[];
    if (data && typeof data.warehousing_pic === 'string') {
      const mediaData = wl.getMediasFromData(data);
      photos = mediaData.photos;
      media = mediaData.medias;
    }
    const { fullCaption, caption } = this.generateCaptions(
      logCode,
      data,
      isTrackingNumber
    );

    let messageIdShowMore = msg.message_id;

    if (fullCaption && photos.length === 0) {
      this.saveCacheData(data, hasSubLogCodeCache);
      // Delete the temporary loading message
      const deleteLoadingMsg = async () => {
        if (loadingMsgId) {
          await this.bot.deleteMessage(chatId, loadingMsgId);
          options.loadingMsgId = undefined;
        }
      };
      return await this.sendFullCationNoImageFound(
        chatId,
        fullCaption,
        data,
        deleteLoadingMsg
      );
    }
    const { isError, errorMessageId, ...other } = await this.sendMediaGroup(
      msg,
      data,
      media
    );
    messageIdShowMore = other.messageIdShowMore || messageIdShowMore;
    if (fullCaption)
      await this.sendFullCaption(chat, fullCaption, logCode, messageIdShowMore);
    this.saveCacheData(data, hasSubLogCodeCache);
  }
  async onTextNumberAction(
    msg: TelegramBot.Message,
    logCode: string | undefined,
    options?: Partial<OnTextNumberActionOptions>
  ) {
    const bot = this.bot;
    const chat = msg.chat;
    const chatId = chat.id;
    const status = this.config.get('status');
    if (
      !this.asAdmin &&
      ['sleep', 'deactivated', 'maintenance'].some((t) => t === status)
    ) {
      const message = this.getStatusMessage(status);
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
    if (!logCode)
      return bot.sendMessage(
        chatId,
        `${msg.chat.first_name}\nសូមបញ្ចូលលេខបុង... 👇👇👇`
      );

    const isTrackingNumber = !logCode.startsWith('25');

    const [isBannedUser, alertMessage] = this.isBannedUser(chat);
    if (isBannedUser) {
      return bot.sendMessage(chatId, alertMessage);
    }
    let loadingMsgId;

    try {
      // const IS_DEV = false;
      const loadingMessage = await bot.sendMessage(
        chatId,
        IS_DEV ? LOADING_TEXT : 'សូមចុចប៊ូតុងខាងក្រោម! 👇',
        {
          reply_markup: IS_DEV
            ? undefined
            : {
                inline_keyboard: [
                  [
                    {
                      text: `Open ${logCode}`,
                      web_app: {
                        url: `${PUBLIC_URL}/wl/${logCode}?web=html&message_id=${msg.message_id}`,
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
      const invalidMessage = this.invalidMessage;
      const wl = new WLLogistic(logCode, this.wl_cookie);
      wl.asAdminMember = this.asAdminMember;
      wl.onError = function (error) {
        console.error('Error Fetch Data', error);
        bot
          .sendMessage(chatId, 'oOP! Unavailable to access data.')
          .then((message) => {
            invalidMessage.chatId = chatId;
            invalidMessage.messageId = message.message_id;
          });
      };
      let { data, refetchData, hasSubLogCodeCache } = this.findDataFromCache(
        logCode,
        isTrackingNumber,
        options
      );
      if (refetchData) {
        const wl_data = await this.getDataWLFetching(
          chat,
          wl,
          logCode,
          loadingMsgId
        );
        if (!wl_data) return;
        data = wl_data;
      }
      const showData = await this.showDataMessageAndPhotos(msg, data, wl, {
        logCode,
        isTrackingNumber,
        hasSubLogCodeCache,
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
  async onTextCheckLogCodeAction(
    msg: TelegramBot.Message,
    logCode: string,
    showAllSmallPackage?: boolean,
    isSubLogCode?: boolean
  ) {
    const options = this.getValidationLogCodeOptions(logCode, msg.chat.id);
    if (typeof options === 'string') {
      return;
    }
    await this.onTextNumberAction(msg, logCode, {
      ...options,
      showAllSmallPackage,
      isSubLogCode,
    });
  }
}

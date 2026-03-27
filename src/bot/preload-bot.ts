import TelegramBot from 'node-telegram-bot-api';
import { Telecam } from '../telecam';
import path from 'path';
import { DataExpand, WLLogistic } from '../wl/edit';
import { Data } from '../wl/types';
import {
  chunkArray,
  isNumber,
  removeDuplicateObjArray,
  splitText,
} from '../utils/is';
import {
  ADMIN_LIST,
  CONTAINER_CONTROLLER_LIST,
  IS_DEV,
  PUBLIC_URL,
  WL_ALLOWED_MEMBERS,
  WL_LOGIN_URL,
  WL_MEMBERS_LIST,
  WL_PRIVATE_API,
} from '../config/constants';
import { STICKER_ID } from './sticker';
import type {
  ActiveUserData,
  ConfigCache,
  MapConfig,
  OnTextNumberActionOptions,
} from './types';
import { sendMessageOptions } from './send-options';
import { logger } from '../utils/logger';
import { markdown } from './extensions/markdown';
import { ParseModeConvert, splitTextWithEntities } from './utils';
import { html } from './extensions/html';
import { SPECIAL_CHAR_RE } from '../utils/re';

export function getFullname(chat: TelegramBot.Chat) {
  const { first_name, last_name, username } = chat;
  const fullname =
    (first_name || '') + (last_name ? ` ${last_name}` : '') || 'Anonymous';
  const fullnameWithUsername = fullname + (username ? `(@${username})` : '');
  return {
    fullname,
    fullnameWithUsername,
    username: chat.username,
    user: chat,
  };
}

export function isAdmin(chat: TelegramBot.Chat, config: MapConfig) {
  const ADMIN_LIST = config.get('ADMIN_LIST');
  if (!ADMIN_LIST) return false;
  return ADMIN_LIST.some((n) =>
    isNumber(n)
      ? n === String(chat.id)
      : n === (chat.username || chat.first_name)
  );
}

export function isMemberAsAdmin(chat: TelegramBot.Chat, config: MapConfig) {
  const WL_MEMBERS_LIST = config.get('WL_MEMBERS_LIST');
  if (!WL_MEMBERS_LIST) return false;
  return WL_MEMBERS_LIST.some((n) =>
    isNumber(n)
      ? n === String(chat.id)
      : n === (chat.username || chat.first_name)
  );
}

export function isMemberAsContainerController(
  chat: TelegramBot.Chat,
  self: WLCheckerBotSendData
) {
  const { fullname } = self.currentUser;
  const CONTAINER_CONTROLLER_LIST = self.config.get(
    'CONTAINER_CONTROLLER_LIST'
  );
  if (!CONTAINER_CONTROLLER_LIST) return false;
  return CONTAINER_CONTROLLER_LIST.some((n) =>
    isNumber(n) ? n === String(chat.id) : n === (chat.username || fullname)
  );
}

export function isMemberAsEmployee(
  chat: TelegramBot.Chat,
  self: WLCheckerBotSendData
) {
  if (self.asAdmin || self.asAdminMember || self.asMemberContainerController)
    return true;

  const { fullname } = self.currentUser;
  const WL_ALLOWED_MEMBERS = self.config.get('WL_ALLOWED_MEMBERS');
  if (!WL_ALLOWED_MEMBERS) return false;
  return WL_ALLOWED_MEMBERS.some((n) =>
    isNumber(n) ? n === String(chat.id) : n === (chat.username || fullname)
  );
}

export const LOADING_TEXT =
  'សូមមេត្តារងចាំបន្តិច... កំពុងស្វែងរកទិន្នន័យ\n🔄 Processing your request... Please hold tight!';
export const MAX_CAPTION_LENGTH = 1024;
export const MAX_TEXT_LENGTH = 4096;
export const fsNode = process.getBuiltinModule('fs');

export class WLCheckerBotPreLoad {
  fs = fsNode;
  logger = logger;
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
  asMemberAsEmployee = false;
  currentUser = {} as ReturnType<typeof getFullname>;
  constructor(public bot: Telecam.Client) {
    this.currentDate = this.getCurrentData();
    // this.publicPath = path.join(process.cwd(), 'public');
    this.cachePath = path.join(process.cwd(), 'cache');
    this.usersFile = path.join(this.cachePath, 'users.json');
    this.currentFileName = `data-${this.currentDate.month()}-${this.currentDate.day()}.json`;
    this.fileData = path.join(this.cachePath, this.currentFileName);

    this.loadCacheData();
  }
  get adminUsers() {
    return this.config.get('ADMIN_LIST') || [];
  }
  get editorUsers() {
    return this.config.get('WL_MEMBERS_LIST') || [];
  }
  get controllerUsers() {
    return this.config.get('CONTAINER_CONTROLLER_LIST') || [];
  }
  get employeeUsers() {
    return this.config.get('WL_ALLOWED_MEMBERS') || [];
  }
  get bannedUsers() {
    return this.config.get('bannedUsers') || [];
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
    if (IS_DEV && this.fs) {
      if (this.fs.existsSync(this.fileData)) {
        const dataString = this.fs.readFileSync(this.fileData, {
          encoding: 'utf-8',
        });
        if (dataString.startsWith('[') && dataString.endsWith(']')) {
          try {
            this.cacheData = JSON.parse(dataString);
          } catch {}
        }
      }
      if (this.fs.existsSync(this.usersFile)) {
        const dataString = this.fs.readFileSync(this.usersFile, {
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
    this.config.set(
      'WL_ALLOWED_MEMBERS',
      WL_ALLOWED_MEMBERS ? WL_ALLOWED_MEMBERS.split(',') : []
    );
    this.config.set('bannedUsers', []);
    if (process.env.BOT_STATUS === 'maintenance')
      this.config.set('status', 'maintenance');

    this.activeUserMap = new Map(this.usersData);
  }
  async saveUser(msg: TelegramBot.Message) {
    if (!this.fs) return;

    const chatId = msg.chat.id;
    if (IS_DEV && this.asAdmin)
      try {
        const activeUserData = [...this.activeUserMap.entries()];
        if (activeUserData.length) {
          this.fs.writeFileSync(this.usersFile, JSON.stringify(activeUserData));
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
        this.logger.info('[Save users]: ' + error.message);
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
  constructor(bot: Telecam.Client) {
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
      this
    );
    this.asMemberAsEmployee = isMemberAsEmployee(chat, this);
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
  parseModeTo(mode: ParseModeConvert['mode'] = null, with_escape = true) {
    return new ParseModeConvert(mode, with_escape);
  }
  async sendLongMessage(
    chatId: number,
    longText: string,
    options?: TelegramBot.SendMessageOptions,
    limit = 4000
  ) {
    if (longText.length <= limit) {
      return await this.bot.sendMessage(chatId, longText, options);
    }
    const chunks = splitText(longText, limit);

    let count = 0;
    for (let chunk of chunks) {
      if (options?.parse_mode && count > 0) {
        chunk = '<b>' + chunk + '</b>';
        // chunk = chunk.replace(/<[^>]*>?/gm, ''); // clean text
      }
      try {
        await this.bot.sendMessage(chatId, chunk, options);

        // Safety delay to prevent hitting Telegram's flood limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error: any) {
        this.logger.error(`Sending chunk: ${error.message}`);
      }
      count++;
    }
  }
  async sendLongMessageV2(
    chatId: TelegramBot.ChatId,
    longText: string,
    options?: TelegramBot.SendMessageOptions,
    limit = MAX_TEXT_LENGTH
  ) {
    const [text, entities] = (() => {
      if (options?.parse_mode === 'HTML') {
        return html.parse(longText);
      }
      return markdown.parse(longText);
    })();
    options = { ...options, entities, parse_mode: undefined };
    limit = limit > MAX_TEXT_LENGTH ? MAX_TEXT_LENGTH : limit;
    if (longText.length <= limit) {
      return await this.bot.sendMessage(chatId, text, options);
    }
    let i = 0;
    const messages = [];
    const textWithEntities = splitTextWithEntities(text, entities, limit);
    this.logger.info(text.length, entities.length, textWithEntities);
    for (const [_message, _entities] of textWithEntities) {
      this.logger.info(_message.length, _message, _entities);
      try {
        const message = await this.bot.sendMessage(chatId, _message, {
          ...options,
          entities: _entities,
        });
        messages.push(message);
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error: any) {
        this.logger.error(`index ${i}`, error.message);
      }
      i++;
    }
    return messages;
  }
  getValidationLogCodeOptions(logCode: string, chatId?: TelegramBot.ChatId) {
    const isNearToNewLogCode = [1, 2, 3, 4].some((v) =>
      logCode.startsWith(`2${v}`)
    );
    const isTrackingNumber = ![5, 6, 7, 8, 9].some((v) =>
      logCode.startsWith(`2${v}`)
    );
    let isNewLogCode = !isTrackingNumber && logCode.length === 12;
    if (logCode.startsWith('26') && logCode.length === 13) {
      isNewLogCode = !isTrackingNumber;
    }
    const isOldLogCode = logCode.startsWith('1757');
    const isSubLogCode =
      isTrackingNumber && logCode.length >= 12 && logCode.length <= 16;
    const hasSpecialChar = SPECIAL_CHAR_RE.test(logCode);
    const isValidLogCode =
      (isTrackingNumber
        ? logCode.length >= 12 && logCode.length <= 16
        : isNewLogCode) && !hasSpecialChar;
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
  saveCacheData(
    data?: DataExpand,
    hasSubLogCodeCache?: boolean,
    refreshData?: boolean
  ) {
    const _logCode = data?.logcode;
    if (!_logCode) return;

    const userId = this.currentUser.user.id;
    data['users'] = {
      ...data.users,
    };
    const userDataMessage = data['users'][userId];
    if (userId && data.message_id) {
      data['users'][userId] = {
        message_id: data.message_id,
      };
    }

    if (
      refreshData ||
      !userDataMessage ||
      (!hasSubLogCodeCache && !this.cacheDataMap.get(_logCode))
    ) {
      this.cacheDataMap.set(_logCode, data);
      if (IS_DEV) {
        if (this.fs) {
          let cacheData = Array.from(this.cacheDataMap.entries());
          const dataLength = cacheData.length;
          if (dataLength > 50) {
            cacheData = cacheData.slice(dataLength - 50, dataLength - 1);
          }
          if (dataLength > 0)
            try {
              this.fs.writeFileSync(
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
    let maxFullCaption: string | undefined;
    let caption: string | undefined;
    let dataExcel = '';

    if (data) {
      const goods_numbers =
        'goods_numbers' in data &&
        Array.isArray(data.goods_numbers) &&
        data.goods_numbers;
      const volume = Number(data.volume).toFixed(3);
      let total_goods_number = 0;
      let total_volume_records = 0;
      const volume_records = data.volume_record
        .split('<br>')
        .filter(Boolean)
        .map((v) => {
          v = v.includes('=') ? v.split('=')[0] : v;
          v = /\*|\-/.test(v) ? v.replace(/\*|\-/g, 'x') : v;
          const volumes = v.split('x');
          const num = Number(volumes[3] || 1);
          total_goods_number += num;
          const total = volumes
            .reduce((acc, p) => acc * Number(p), 1)
            .toFixed(3);
          total_volume_records += Number(total);
          return `\t\t\t${v} = ${total}`;
        });

      const isSplitting = goods_numbers && goods_numbers.length > 1;
      let warehousingRemarks = data.warehousingremarks || '';
      let [container_code, ...container_date] = data.container_num?.split('-');
      if (container_date?.[0]?.startsWith('0')) {
        container_date[0] = container_date[0].substring(1);
      }

      if (warehousingRemarks) {
        if (!this.asAdmin) {
          const delimiter = warehousingRemarks.includes('，') ? '，' : ',';
          warehousingRemarks = warehousingRemarks.split(delimiter)[0];
        }
        const translatedRemarks = warehousingRemarks
          .replace(/托/g, 'ប៉ាឡែត')
          .replace(/件/g, 'ដុំ');

        warehousingRemarks = `\t\t\t\t☘\t\t\t\t(${translatedRemarks})`;
        if (!this.asAdmin && !/托|件/g.test(warehousingRemarks)) {
          warehousingRemarks = '';
        }
      }
      const pm = this.parseModeTo(null, false);
      const goods_name = this.asAdmin
        ? data.goods_name
            .split(',')
            .map((v) => v.split('(')[0].trim())
            .join(',')
        : data.goods_name;
      fullCaption = ''.concat(
        `- លេខបុង: ${pm.c(
          isTrackingNumber ? data.logcode : logCodeFromCommand
        )} ✅ ${isSplitting ? 'ទូរចុងក្រោយ' : 'ទូរ'}: ${
          container_date.join('.') || 'N/A(ប្រហែលជើងអាកាស)'
        }\n`,
        `- កូដអីវ៉ាន់: #${data.mark_name}\n`,
        `- ចំនួន: ${data.goods_number}${warehousingRemarks}\n`,
        isSplitting ? `- ចំនួនបែងចែកទូរ: [${goods_numbers.join(', ')}]\n` : '',
        `- ទម្ងន់: ${
          data.weight.length <= 5 ? data.weight : Number(data.weight).toFixed(2)
        }kg\n`,
        `- ម៉ែត្រគូបសរុប: ${volume}m³`,
        `${
          data.volume_record?.trim()
            ? ''.concat(
                volume_records.length > 1
                  ? pm.bl(
                      'ម៉ែត្រគូបផ្សេងគ្នា:\n'.concat(
                        volume_records.join('\n'),
                        total_volume_records > 0 &&
                          total_volume_records.toFixed(3) !== volume &&
                          total_volume_records.toFixed(2) !==
                            Number(volume).toFixed(2)
                          ? ''.concat(
                              `\n👉 ម៉ែត្រគូបសរុបជាក់ស្តែង: ${total_volume_records.toFixed(
                                3
                              )}m³`,
                              ` (ខុសពី ${volume}m³)`
                            )
                          : '',
                        total_goods_number &&
                          total_goods_number !== Number(data.goods_number)
                          ? ''.concat(
                              `\n👉 ចំនួនសរុបជាក់ស្តែង: ${total_goods_number}`
                            )
                          : ''
                      )
                    )
                  : `\n- ម៉ែត្រគូបផ្សេងគ្នា: ${volume_records
                      .join('\n')
                      .trim()}\n`
              )
            : '\n- ម៉ែត្រគូបផ្សេងគ្នា: N/A\n'
        }`,
        `- ទំនិញ: ${pm.c(goods_name)}${data.isSmallPackage ? ' - 小件包裹(អីវ៉ាន់តូច)' : ''}\n`,
        this.asAdmin || this.asAdminMember || this.asMemberContainerController
          ? ''.concat(
              '- ទូរកុងតឺន័រ: ',
              container_code
                ? `#${container_code.trim()}`
                : 'N/A(ប្រហែលជើងអាកាស)',
              '\n'
            )
          : '',
        `- ផ្សេងៗ: ${data.desc?.replace(/到達|到达/g, '$&(មកដល់)') || 'N/A'}\n`
      );
      if (this.asAdmin) {
        dataExcel = `${container_date.join('.') || 'N/A'}\t${data.mark_name}\t${data.logcode}\t${JSON.parse(data.expresstracking)[0]?.time.split(' ')?.[0].trim()}\t${goods_name}\t${data.goods_number}\t${data.weight}\t${data.volume}\t${volume}`;
        data.excel_format_data = dataExcel;
        fullCaption += `\n\n🧾 Excel Format Data:\n${pm.c(dataExcel)}\n`;
      }
      maxFullCaption = fullCaption.substring(0, MAX_TEXT_LENGTH);
      caption = fullCaption.substring(0, MAX_CAPTION_LENGTH);
    }
    return { caption, fullCaption, maxFullCaption, dataExcel };
  }
  async sendFullCationNoImageFound(
    chat: TelegramBot.Chat,
    data: DataExpand | undefined,
    fullCaption: string,
    logCodeFromCommand: string,
    messageIdShowMore?: string | number,
    messageIdsForDelete?: string[],
    afterSendCaption?: VoidFunction
  ) {
    const message = await this.sendLongMessageV2(
      chat.id,
      `🤷 🏞🏞 អត់មានរូបភាពទេ 🏞🏞 🤷\n\n${fullCaption}`,
      sendMessageOptions(
        {
          translateText: logCodeFromCommand,
          logCodeOrAndForShowMore: `${logCodeFromCommand}|${messageIdShowMore}`,
          chat,
          messageIdsForDelete,
        },
        this.asAdmin
      )
    );
    if (data?.smallPackageGoodsNames?.length && data.subLogCodes) {
      await this.bot.sendMessage(
        chat.id,
        '=== អីវ៉ាន់តូចៗទាំងអស់ ===\n'.concat(
          data.smallPackageGoodsNames.join('\n')
        ),
        sendMessageOptions()
      );
    }
    afterSendCaption?.();
    return {
      noImage: true,
      message_id: (Array.isArray(message) ? message[0] : message).message_id,
    };
  }
  async sendFullCaption(
    chat: TelegramBot.Chat,
    fullCaption: string,
    logCodeFromCommand: string,
    messageIdShowMore?: string | number,
    messageIdsForDelete?: string[]
  ) {
    if (!this.asAdmin) {
      messageIdsForDelete = undefined;
    }
    if (messageIdsForDelete && messageIdsForDelete.length > 1) {
      messageIdsForDelete = [
        messageIdsForDelete[0],
        messageIdsForDelete.at(-1) as string,
      ];
    }
    return await this.sendLongMessageV2(
      chat.id,
      fullCaption,
      sendMessageOptions(
        {
          translateText: logCodeFromCommand,
          logCodeOrAndForShowMore: `${logCodeFromCommand}|${messageIdShowMore}`,
          chat,
          messageIdsForDelete,
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
      const pm = this.parseModeTo('HTML', false);
      await this.sendLongMessageV2(
        chatId,
        ''.concat(
          `<b>Container Number:</b> <code>${
            data.container_num || 'N/A(ប្រហែលជើងអាកាស)'
          }</code>\n`,
          `<b>Member Name:</b> ${data.member_name}\n`,
          `<b>开单员:</b> ${data.delivery_manager_name || 'N/A'}\n`,
          data.from_address?.trim() && data.to_address?.trim()
            ? pm.bl(
                ''.concat(
                  `<b>Form Name:</b> ${data.from_name}${
                    data.from_phone ? ` (${data.from_phone})` : ''
                  }\n`,
                  `<b>Form Address:</b> ${data.from_address}\n`,
                  `<b>To Name:</b> ${data.to_name}${
                    data.to_phone ? ` (${data.to_phone})` : ''
                  }\n`,
                  `<b>To Address:</b> ${data.to_address}\n`
                )
              )
            : '',
          ''.concat(
            pm.b('Total: ' + pm.sp(pm.u('$' + Number(data.total).toFixed(2)))),
            ` (${!!data.payment_status ? 'Paid' : 'Unpaid'})\n`
          ),
          // `<b>Total: <code>$${Number(data.total).toFixed(2)}</code></b> (${
          //   !!data.payment_status ? 'Paid' : 'Unpaid'
          // })\n`,
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
        ),
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
    let messageIdsForDelete: string[] = [];
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

        try {
          await this.bot
            .sendMediaGroup(chatId, inputMedia)
            .then(async (sentMessages) => {
              messageIdShowMore = sentMessages[0].message_id;
              messageIdsForDelete = sentMessages.map((m) => `${m.message_id}`);
              this.logger.success(
                justOne
                  ? `✅ Successfully sent an photo.`
                  : `✅ Successfully sent an album with ${sentMessages.length} items.`
              );
            });
        } catch (error) {
          isError = true;
          this.logger.error(
            justOne
              ? 'Sending photo: '
              : 'Sending media group: ' + (error as Error).message
          );
          const { message_id } = await this.bot.sendMessage(
            chatId,
            '❌ សូមទោស! ការផ្ញើរូបភាពមានបញ្ហា សូមព្យាយាមម្តងទៀត។'
          );
          errorMessageId = message_id;
          messageIdShowMore = msg.message_id;
        }
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
    return { errorMessageId, isError, messageIdShowMore, messageIdsForDelete };
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
  async requireLoginHandler(chatId: number, requireLogin?: boolean) {
    if (
      requireLogin &&
      this.singleAdminId &&
      this.config.get('status') !== 'maintenance'
    ) {
      this.config.set('status', 'maintenance');
      try {
        await this.bot.sendMessage(chatId, this.statusMessage.maintenance);
        await this.bot.sendSticker(chatId, STICKER_ID.working);
        this.bot.sendMessage(
          this.singleAdminId,
          'Hey, Admin! Please login and update cookie.',
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Goto Login',
                    url: WL_LOGIN_URL,
                  },
                  { text: 'Update Cookie', url: WL_PRIVATE_API },
                ],
              ],
            },
          }
        );
      } catch (error: any) {
        this.logger.error('Send a notification to admin: ' + error.message);
      }
    }
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
      options?.isSubLogCode || options?.isTrackingNumber
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
      await this.requireLoginHandler(chatId, wl_data.requireLogin);
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

    const reply_to_message_id = data?.users?.[chatId]?.message_id;
    if (reply_to_message_id) {
      try {
        await this.sendLongMessageV2(
          chatId,
          `<b>${chat.first_name}</b> អ្នកធ្លាប់រកម្តងរួចហើយ សូមចុចខាងលើនេះ👆👆👆 \n\n`.concat(
            '<b>បើមិនមានសូមចុចខាងក្រោមនេះ:\n',
            `👉 /w_refresh_data_${data.logcode}</b>`
          ),
          { parse_mode: 'HTML', reply_to_message_id }
        );
        this.logger.info(
          `User ${chatId} has previous message for logcode ${data.logcode}`
        );
        return;
      } catch (error: any) {
        this.logger.error(
          'previous message id',
          reply_to_message_id,
          error.message,
          '\n Then try to refresh data...'
        );
      }
    }

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
      // Delete the temporary loading message
      const deleteLoadingMsg = async () => {
        if (loadingMsgId) {
          await this.bot.deleteMessage(chatId, loadingMsgId);
          options.loadingMsgId = undefined;
        }
      };
      return await this.sendFullCationNoImageFound(
        chat,
        data,
        fullCaption,
        logCode,
        messageIdShowMore,
        undefined,
        deleteLoadingMsg
      ).then((dt) => {
        if (data) data.message_id = dt.message_id;
        this.saveCacheData(data, hasSubLogCodeCache);
        return dt;
      });
    }
    const { isError, errorMessageId, messageIdsForDelete, ...other } =
      await this.sendMediaGroup(msg, data, media);
    messageIdShowMore = other.messageIdShowMore || messageIdShowMore;
    if (fullCaption) {
      const message = await this.sendFullCaption(
        chat,
        fullCaption,
        logCode,
        messageIdShowMore,
        messageIdsForDelete
      );
      if (data)
        data.message_id = (
          Array.isArray(message) ? message[0] : message
        ).message_id;
    }
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

    const isTrackingNumber = Boolean(options?.isTrackingNumber);

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
      wl.onError = async (error) => {
        this.logger.error('[Fetch Data]: ' + error.message);
        if ('code' in error && error.code === 'ConnectionRefused') {
          await this.requireLoginHandler(chatId, true);
        } else {
          bot
            .sendMessage(chatId, 'oOP! Unavailable to access data.')
            .then((message) => {
              invalidMessage.chatId = chatId;
              invalidMessage.messageId = message.message_id;
            });
        }
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
          loadingMsgId,
          options
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
      this.logger.error(
        'Image generation process: ' + (error as Error).message
      );

      // Try to delete the loading message if it was sent successfully
      if (loadingMsgId) {
        try {
          await bot.deleteMessage(chatId, loadingMsgId);
        } catch (error) {
          this.logger.warn(
            'Could not delete loading message on error: ' +
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
  async onTextCheckLogCodeHandler(
    msg: TelegramBot.Message,
    logCode: string | undefined | null,
    showAllSmallPackage?: boolean,
    isSubLogCode?: boolean
  ) {
    if (!logCode) {
      this.bot.sendMessage(
        msg.chat.id,
        '❌ Sorry, invalid Code. Please try again.'
      );
      return;
    }
    if (!this.asMemberAsEmployee) {
      return this.bot.sendMessage(
        msg.chat.id,
        `Hey, <b>${msg.chat.first_name}</b>!\n⚠️ You don't have permission this use this action.`,
        { parse_mode: 'HTML' }
      );
    }
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

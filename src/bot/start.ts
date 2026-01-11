import TelegramBot from 'node-telegram-bot-api';
import { MAX_TEXT_LENGTH, WLCheckerBotSendData } from './preload-bot';
import type { ConfigCache, MapConfig } from './types';
import {
  ADMIN_LIST,
  IS_DEV,
  PUBLIC_URL,
  TOKEN,
  WEB_APP_URL,
  WL_PUBLIC_URL,
} from '../config/constants';
import { WLLogistic } from '../wl/edit';
import { chunkArray, isArray, isNumber, isObject } from '../utils/is';
import path from 'path';
import {
  AdminInlineKeyboardAction,
  adminInlineKeyboardButtons,
  deleteInlineKeyboardButton,
  sendMessageOptions,
} from './send-options';
import { broadcastByFileId } from './notifications';
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
import dayjs from 'dayjs';
import { escapeMarkdownV2 } from './extensions/markdown';

export const configUserWithAdminPermission = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  config: MapConfig,
  options: {
    key: keyof ConfigCache;
    type: 'add' | 'remove';
    id_username_or_first_name?: string;
  },
  asAdmin?: boolean
) => {
  const chatId = msg.chat.id;
  const id_username_or_first_name = options.id_username_or_first_name
    ?.trim()
    .substring(0, 20);
  if (asAdmin) {
    const members = (config.get(options.key) as string[]) || [];
    if (id_username_or_first_name) {
      const hasMember = members.includes(id_username_or_first_name);
      let botMessage = '';
      if (options.type === 'add') {
        if (!hasMember)
          config.set(options.key, [...members, id_username_or_first_name]);

        let addedMessage = '';
        switch (options.key) {
          case 'WL_MEMBERS_LIST':
            addedMessage = 'បានចូលជាសមាជិកពេញសិទ្ធិ។';
            break;
          case 'WL_ALLOWED_MEMBERS':
            addedMessage = 'បានចូលជាសមាជិកក្នុងបេសកកម្មរុករកអីវ៉ាន់ហើយ។';
            break;
          case 'bannedUsers':
            addedMessage = 'added to ban list.';
            break;

          default:
            break;
        }
        botMessage = !hasMember
          ? `✅ ${id_username_or_first_name} ${addedMessage}`
          : `${id_username_or_first_name} already added!`;
      } else if (options.type === 'remove') {
        if (hasMember)
          config.set(
            options.key,
            members.filter((m) => m !== id_username_or_first_name)
          );
        let removedMessage = '';
        switch (options.key) {
          case 'WL_MEMBERS_LIST':
            removedMessage = 'បានដកចេញពីសមាជិកពេញសិទ្ធិ។';
            break;
          case 'WL_ALLOWED_MEMBERS':
            removedMessage = 'បានដកចេញពីសមាជិកបេសកកម្មរុករកអីវ៉ាន់ហើយ។';
            break;
          case 'bannedUsers':
            removedMessage = 'removed from ban list.';
            break;

          default:
            break;
        }
        botMessage = hasMember
          ? `✅ ${id_username_or_first_name} ${removedMessage}`
          : `Currently, ${id_username_or_first_name} is not in ${options.key.toUpperCase()}.`;
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
  config: MapConfig,
  options: {
    key: keyof ConfigCache;
    type: 'add' | 'remove';
  },
  asAdmin?: boolean
) => {
  bot.onText(regexp, async (msg, match) => {
    await configUserWithAdminPermission(
      bot,
      msg,
      config,
      {
        ...options,
        id_username_or_first_name: match?.[1]?.trim(),
      },
      asAdmin
    );
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

export class WLCheckerBot extends WLCheckerBotSendData {
  commandsAdmin = [
    { command: 'start', description: 'Start the bot' },
    { command: 'settings', description: 'Show all button actions' },
    { command: 'set_cookie', description: 'Set new cookie' },
  ];
  constructor(bot: TelegramBot) {
    super(bot);
  }
  alertNoPermissionMessage(chatId: TelegramBot.ChatId) {
    return alertNoPermissionMessage(
      this.bot,
      chatId,
      this.currentUser.fullname
    );
  }
  onTextConfigUserWithAdminPermission(
    regexp: RegExp,
    options: {
      key: keyof ConfigCache;
      type: 'add' | 'remove';
    }
  ) {
    onTextConfigUserWithAdminPermission(
      this.bot,
      regexp,
      this.config,
      options,
      this.asAdmin
    );
  }
  onTest() {
    this.bot.onText(/\/test (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      let base = match?.[1].trim();

      if (!base) return;
      if (!base.includes('.')) {
        base = `${base}.jpg`;
      }

      const url = `${PUBLIC_URL}/blob/image?url=${WL_PUBLIC_URL}/upload/${base}`;
      try {
        await this.bot.sendPhoto(chatId, url);
      } catch (error: any) {
        this.logger.error(`Send Photo: ${error.message}`);
      }
    });
  }
  async setMenuCommands(chatId: number, text?: string) {
    try {
      return await this.bot
        .setMyCommands(
          ['off', 'hidden', 'disable'].some((t) => t === text)
            ? []
            : this.commandsAdmin,
          {
            scope: { type: 'chat', chat_id: chatId },
          }
        )
        .then(() => {
          this.logger.success('Command menu updated successfully');
        });
    } catch (error: any) {
      this.logger.error('[set command]: ' + error.message);
    }
  }
  async setCookie(
    chatId: TelegramBot.ChatId,
    cookie: string,
    options?: { testingData?: boolean; asAdminMember?: boolean }
  ) {
    cookie = !cookie.startsWith('PHPSESSID=')
      ? 'PHPSESSID='.concat(cookie)
      : cookie;
    if (!IS_DEV) {
      fetch(`${PUBLIC_URL}/wl/set-cookie?cookie=${cookie}`).catch();
    }
    this.wl_cookie = cookie;
    this.config.set('cookie', cookie);
    const bot = this.bot;
    await bot.sendMessage(
      chatId,
      '✅ Successfully set new cookie. Then try to get data...'
    );
    options = options || {};
    if (options.testingData) {
      const wl = new WLLogistic('251209180405', cookie);
      wl.asAdminMember = Boolean(options.asAdminMember);
      wl.onError = (error) => {
        this.logger.error('[Fetch Data]: ' + error.message);
        bot.sendMessage(chatId, 'oOP! Unavailable to access data.');
      };
      const dataList = await wl.getFirstData();
      const isRequireLogin = isObject(dataList) && 'url' in dataList;
      if (!isRequireLogin && isArray(dataList)) {
        this.config.set('status', 'active');
      }
      await bot.sendMessage(
        chatId,
        isRequireLogin
          ? 'Login is requires.'
          : `✅ Successfully testing data(dataList.length = ${dataList.length})`
      );
    }
  }
  addOrRemoveCommand() {
    this.onTextConfigUserWithAdminPermission(/\/addAdmin (.+)/, {
      key: 'ADMIN_LIST',
      type: 'add',
    });
    this.onTextConfigUserWithAdminPermission(/\/removeAdmin (.+)/, {
      key: 'ADMIN_LIST',
      type: 'remove',
    });
    this.onTextConfigUserWithAdminPermission(/\/addMember (.+)/, {
      key: 'WL_MEMBERS_LIST',
      type: 'add',
    });
    this.onTextConfigUserWithAdminPermission(/\/removeMember (.+)/, {
      key: 'WL_MEMBERS_LIST',
      type: 'remove',
    });
    this.onTextConfigUserWithAdminPermission(/\/addCC (.+)/, {
      key: 'CONTAINER_CONTROLLER_LIST',
      type: 'add',
    });
    this.onTextConfigUserWithAdminPermission(/\/removeCC (.+)/, {
      key: 'CONTAINER_CONTROLLER_LIST',
      type: 'remove',
    });
    this.onTextConfigUserWithAdminPermission(/\/addEmployee (.+)/, {
      key: 'WL_ALLOWED_MEMBERS',
      type: 'add',
    });
    this.onTextConfigUserWithAdminPermission(/\/removeEmployee (.+)/, {
      key: 'WL_ALLOWED_MEMBERS',
      type: 'remove',
    });
    this.onTextConfigUserWithAdminPermission(/\/addBanUser (.+)/, {
      key: 'bannedUsers',
      type: 'add',
    });
    this.onTextConfigUserWithAdminPermission(/\/removeBanUser (.+)/, {
      key: 'bannedUsers',
      type: 'remove',
    });
  }
  async getConfigUsers(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (this.asAdmin) {
      const adminUsers = this.adminUsers;
      const editorUsers = this.editorUsers;
      const controllerUsers = this.controllerUsers;
      const employeeUsers = this.employeeUsers;

      const users = this.activeUserMap.entries().reduce(
        (acc, [id, user]) => {
          const { fullname = '', username, fullnameWithUsername } = user;
          let user_str = username
            ? `@${username}`
            : `<a href="tg://user?id=${id}">${
                fullname || fullnameWithUsername
              }</a>`;
          const fwu = fullname || username || fullnameWithUsername;
          if (user.banned) {
            acc.banned_users.push(user_str);
          } else if (
            controllerUsers.includes(`${id}`) ||
            controllerUsers.includes(fwu)
          ) {
            acc.controller_users.push(user_str);
          } else if (
            employeeUsers.includes(`${id}`) ||
            employeeUsers.includes(fwu)
          ) {
            acc.employee_users.push(user_str);
          }
          if (editorUsers.includes(`${id}`) || editorUsers.includes(fwu)) {
            acc.editor_users.push(user_str);
          }
          return acc;
        },
        {
          admin_users: adminUsers as string[],
          editor_users: [] as string[],
          controller_users: [] as string[],
          employee_users: [] as string[],
          banned_users: [] as string[],
        }
      );

      let msg_data = Object.entries(users)
        .map(([key, value]) => {
          return `✅ ${key.replace('_', ' ').toUpperCase()}\n`.concat(
            value.join('\n')
          );
        })
        .join('\n\n')
        .concat(`\nCookie: <code>${this.wl_cookie.split('=')[1]}</code>`)
        .substring(0, MAX_TEXT_LENGTH);

      await this.bot
        .sendMessage(chatId, msg_data, {
          reply_to_message_id: msg.message_id,
          parse_mode: 'HTML',
        })
        .catch();
    }
  }
  async getActiveUsers(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (this.asAdmin) {
      const data = Array.from(this.activeUserMap.entries());
      let message = 'no active user';
      if (data.length) {
        message = 'All active members of WL Checker Bot';
      }
      await this.bot
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
          reply_to_message_id: msg.message_id,
        })
        .catch();
    }
  }
  async resetData(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    this.cacheDataMap.clear();
    if (IS_DEV && this.asAdmin) {
      const fs = process.getBuiltinModule('fs');
      if (fs && fs.existsSync(this.fileData)) {
        fs.unlinkSync(this.fileData);
      }
    }
    await this.bot.sendMessage(chatId, '✅ Successfully data reset', {
      reply_to_message_id: msg.message_id,
    });
  }
  clearAll(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    try {
      let isError = false;
      let message = '✅ Done!!!';
      if (this.fs && IS_DEV) {
        const files = this.fs.readdirSync(this.cachePath);
        const filesToDelete = files.filter((file) => {
          const isException = file === this.currentFileName;
          const isJson = path.extname(file).toLowerCase() === '.json';

          const fullPath = path.join(this.cachePath, file);
          const isFile = this.fs.statSync(fullPath).isFile();
          return isJson && isFile && !isException;
        });
        filesToDelete.forEach((file) => {
          const filePath = path.join(this.cachePath, file);
          try {
            this.fs.unlinkSync(filePath);
          } catch (err) {
            isError = true;
            message = `❌ Failed to delete ${file}: ` + (err as Error).message;
            this.logger.error(message);
          }
        });
      }
      this.bot.sendMessage(chatId, message, {
        reply_to_message_id: msg.message_id,
      });
    } catch (error) {
      this.logger.error('Sending clear message: ' + (error as Error).message);
    }
  }
  async getLogCodes(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const data = Array.from(this.cacheDataMap.values());
    await this.bot.sendMessage(
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
        : 'No LogCodes',
      {
        reply_to_message_id: msg.message_id,
      }
    );
  }
  async getAllLogging(msg: TelegramBot.Message, showAll = true) {
    const chatId = msg.chat.id;
    const activeUsers = Array.from(this.activeUserMap.values()).filter((u) =>
      Array.isArray(u.logging)
    );
    try {
      const today = dayjs().format('YYYY-MM-DD');
      let message = activeUsers.length
        ? activeUsers
            .map((u) => {
              let logging = u.logging || [];
              let hasPrev = !showAll;
              if (!showAll && logging.length) {
                logging = logging.filter((l) => l.includes(today));
                hasPrev = logging.length !== u.logging?.length;
              }
              return `🧑 **${u.fullnameWithUsername}**\n `.concat(
                logging.join('\n').replaceAll(today, 'TODAY'),
                hasPrev ? `\n/getLoggingId${u.id}` : ''
              );
            })
            .join('\n\n')
        : 'Nobody actives today.';

      await this.sendLongMessageV2(
        chatId,
        message,
        sendMessageOptions({ reply_to_message_id: msg.message_id })
      );
      // await this.sendLongMessage(
      //   chatId, message,
      //   sendMessageOptions({
      //     parse_mode: 'HTML',
      //     reply_to_message_id: msg.message_id,
      //   })
      // );
    } catch (error: any) {
      this.logger.error(error.message);
      await this.bot.sendMessage(
        chatId,
        error.message,
        sendMessageOptions({
          reply_to_message_id: msg.message_id,
        })
      );
    }
  }
  getLogging = async (
    msg: TelegramBot.Message,
    match?: RegExpExecArray | null
  ) => {
    if (match?.[0] !== match?.input) return;
    return await this.getAllLogging(msg, false);
  };
  getLoggingByUserId = async (
    msg: TelegramBot.Message,
    matchOrId?: string | number | RegExpExecArray | null
  ) => {
    const userId = typeof matchOrId === 'object' ? matchOrId?.[1] : matchOrId;
    console.info('userId', userId, matchOrId);
    if (isNumber(userId)) {
      const id = Number(userId);
      const member = { ...this.activeUserMap.get(id) };
      if (member?.id) {
        const logging = member.logging || [];
        member.id = `\`${userId}\``;
        delete member.logging;
        const today = dayjs().format('YYYY-MM-DD');
        const message = ''.concat(
          '>>',
          JSON.stringify(member, null, 2),
          '>>',
          `\n\n**Logging:**\n`,
          logging.join('\n').replaceAll(today, 'TODAY')
        );
        return await this.sendLongMessageV2(
          msg.chat.id,
          message,
          sendMessageOptions({
            reply_to_message_id: msg.message_id,
            reply_markup: {
              inline_keyboard: [
                ...['Allow', 'Ban'].map((type) => {
                  let removeText = type;
                  if (type === 'Allow') {
                    removeText = 'Disallow';
                  } else {
                    removeText = 'Remove '.concat(type);
                  }
                  return [
                    {
                      text: type,
                      callback_data: 'edit_user_'.concat(
                        type.toLowerCase(),
                        '|',
                        `${userId}`
                      ),
                    },
                    {
                      text: removeText,
                      callback_data: 'edit_user_remove_'.concat(
                        type.toLowerCase(),
                        '|',
                        `${userId}`
                      ),
                    },
                  ];
                }),
                [deleteInlineKeyboardButton],
              ],
            },
          })
        );
      }
    }
  };
  async showStatus(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (this.asAdmin) {
      const status = this.config.get('status');
      this.bot
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
            reply_to_message_id: msg.message_id,
          }
        )
        .catch();
    }
  }
  settingsCommand() {
    this.bot.onText(/(\/settings|\/stg)/, (msg) => {
      const chatId = msg.chat.id;

      if (this.asAdmin) {
        const status = this.config.get('status') || 'active';
        this.bot
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
                  !IS_DEV
                    ? [
                        {
                          text: 'Open Webhook Info',
                          web_app: { url: `${PUBLIC_URL}/api/webhook-info` },
                        },
                        {
                          text: 'Set Webhook',
                          web_app: {
                            url: `${PUBLIC_URL}/api/set-webhook?user=${
                              ADMIN_LIST?.split(',')?.[0]
                            }`,
                          },
                        },
                      ]
                    : [],
                ],
              },
            }
          )
          .catch();
      } else {
        this.alertNoPermissionMessage(chatId);
      }
    });
  }
  sendNotification() {
    this.bot.onText(/(\/testNoti|\/noti)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      const isTest = text?.startsWith('/test');
      if (this.asAdmin) {
        await broadcastByFileId(
          this.bot,
          this.activeUserMap,
          isTest ? this.singleAdminId : undefined
        );
        return;
      }
      this.alertNoPermissionMessage(chatId);
    });
  }
  async onCallbackQuery() {
    this.bot.on('callback_query', async (query) => {
      const action = query.data;
      const msg = query.message;
      const chatId = msg?.chat.id;
      try {
        if (chatId) {
          this.refreshTypeMember(msg.chat);
          const { fullname, fullnameWithUsername } = this.currentUser;
          if (action === 'delete') {
            try {
              this.bot.deleteMessage(chatId, msg.message_id);
            } catch (error) {
              this.logger.error('Delete message: ' + (error as Error).message);
            }
          } else if (action?.startsWith('tr_from_')) {
            let from = action.replace('tr_from_', '');
            if (from.startsWith('zh|')) {
              const logCode = from.replace('zh|', '').trim();
              const data = this.cacheDataMap.get(logCode);
              const text = data?.goods_name.trim();
              if (!text) return;
              try {
                const loadingMessage = await this.bot.sendMessage(
                  chatId,
                  '⏳ កំពុងបកប្រែ សូមមេត្តារងចាំបន្តិចសិន...',
                  {
                    reply_to_message_id: msg.message_id,
                  }
                );
                const res = await translate(text, { to: 'km' });
                if (!this.asAdmin)
                  this.loggingCache.add(
                    `👉 ${fullname} clicked translate button from log code /${logCode}`
                  );
                this.bot.editMessageText(`${text} \n👉👉👉 ${res.text}`, {
                  chat_id: chatId,
                  message_id: loadingMessage.message_id,
                });
              } catch (error) {
                this.logger.error((error as Error).message);
                this.bot.answerCallbackQuery(query.id, {
                  text: '❌ Translation failed!',
                });
              }
            }
          } else if (action?.startsWith('show_more_data')) {
            let [logCode, messageId] = action
              .replace('show_more_data', '')
              .trim()
              .split('|');
            let data = this.cacheDataMap.get(logCode);
            if (!data && !logCode.startsWith('25')) {
              data = [...this.cacheDataMap.values()].find((d) =>
                d.sub_logcode.includes(logCode)
              );
            }
            if (!data) return;
            if (!this.asAdmin)
              this.loggingCache.add(
                `👉 ${fullname} clicked show more button from log code /${logCode}`
              );
            await this.showMoreDataCaption(
              chatId,
              data,
              isNumber(messageId) ? Number(messageId) : undefined
            );
          } else if (action?.startsWith('user_info_')) {
            const userId = action.replace('user_info_', '');
            // this.logger.info([...this.activeUserMap.keys()].join(','));
            await this.getLoggingByUserId(msg, userId);
          } else if (action?.startsWith('edit_user_')) {
            const [_action, userId] = action.split('|');
            if (isNumber(userId)) {
              await configUserWithAdminPermission(
                this.bot,
                msg,
                this.config,
                {
                  key: action.includes('ban')
                    ? 'bannedUsers'
                    : 'WL_ALLOWED_MEMBERS',
                  type: action.includes('remove') ? 'remove' : 'add',
                  id_username_or_first_name: userId,
                },
                this.asAdmin
              );
            }
          } else if (action?.startsWith('set_status_')) {
            const status = action.replace(
              'set_status_',
              ''
            ) as keyof typeof this.statusMessage;
            this.config.set('status', status);
            await this.bot.sendMessage(chatId, this.statusMessage[status], {
              parse_mode: 'Markdown',
            });
          } else if (action?.startsWith('refresh_webhook')) {
            fetch(`${PUBLIC_URL}/api/webhook-info`).catch();
            this.bot.sendMessage(chatId, 'សូមមេត្តារងចាំបន្តិច...');
          } else {
            switch (action as AdminInlineKeyboardAction) {
              case 'getLogCodes':
                this.getLogCodes(msg);
                break;
              case 'getLogging':
                this.getLogging(msg);
                break;
              case 'setStatus':
                this.showStatus(msg);
                break;
              case 'getConfigUsers':
                this.getConfigUsers(msg);
                break;
              case 'getActiveUsers':
                this.getActiveUsers(msg);
                break;
              case 'saveUsers':
                this.saveUser(msg);
                break;
              case 'resetData':
                this.resetData(msg);
                break;
              case 'clear':
                this.clearAll(msg);
                break;

              default:
                break;
            }
          }
        }
      } catch (error) {
        this.logger.error('Delete message: ' + (error as Error).message);
      }
    });
  }
  start() {
    const bot = this.bot;
    bot.onText(/\/menu (.+)/, (msg, match) => {
      const chatId = msg.chat.id;
      const text = match?.[1].trim().toLowerCase();
      if (this.asAdmin) this.setMenuCommands(chatId, text);
      else {
        this.alertNoPermissionMessage(chatId);
      }
    });
    bot.onText(/\/show_menu/, (msg) => {
      const chatId = msg.chat.id;
      if (this.asAdmin) this.setMenuCommands(chatId, 'on');
      else {
        this.alertNoPermissionMessage(chatId);
      }
    });
    bot.onText(/\/remove_menu/, (msg) => {
      const chatId = msg.chat.id;
      if (this.asAdmin) this.setMenuCommands(chatId, 'off');
      else {
        this.alertNoPermissionMessage(chatId);
      }
    });

    bot.onText(/\/start/, async (msg) => {
      const {
        fullname,
        user: { id: chatId },
      } = this.currentUser;
      const textParseMode = this.parseModeTo(null, false)
        .text((p) => {
          p.text('សួស្តី! '.concat(p.b(p.m(fullname, chatId))));
        })
        .newline()
        .text('សូមបញ្ចូលលេខបុង... 👇👇👇');
      await this.sendLongMessageV2(chatId, textParseMode.build());
    });

    // Set new WL cookie
    bot.onText(/\/(setCookie|set_cookie)/, async (msg) => {
      const chatId = msg.chat.id;
      this.config.set('waitingCookie', true);
      await bot.sendMessage(chatId, 'Please give me the cookie.');
    });

    bot.onText(/\/setCookie (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      let cookie = match?.[1]?.trim();
      const asAdminMember = this.asAdminMember;
      if (typeof cookie === 'string') {
        await this.setCookie(chatId, cookie, {
          testingData: true,
          asAdminMember,
        });
      } else {
        this.config.set('waitingCookie', true);
        await bot.sendMessage(chatId, 'Please give me the cookie.');
      }
    });

    this.settingsCommand();

    bot.onText(/\/getLogCodes/, this.getLogCodes);
    bot.onText(/\/getLogging/, this.getLogging);
    bot.onText(/\/getAllLogging/, (msg) => this.getAllLogging(msg, false));
    bot.onText(/\/getLoggingId(.+)/, this.getLoggingByUserId);
    bot.onText(/\/getConfigUsers/, this.getConfigUsers);
    bot.onText(/\/resetData/, this.resetData);
    bot.onText(/\/clear/, this.clearAll);
    bot.onText(/\/status/, this.showStatus);
    bot.onText(/\/setStatus (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const [text, ...other] = match?.[1].split('|') || [];
      if (this.asAdmin) {
        const customStatusMessage = other?.join('|');
        if (customStatusMessage) {
          this.config.set('statusMessage', customStatusMessage);
        }
        this.config.set('status', text);
        bot
          .sendMessage(
            chatId,
            'Bot now is '.concat(text || 'running normal', '.')
          )
          .catch();
      }
    });
    this.onCallbackQuery();

    this.sendNotification();
    bot.on('message', async (msg) => {
      const {
        chat,
        chat: { id: chatId, first_name, last_name, username },
      } = msg;
      const userId = msg.from?.id;
      if (!userId) return;

      const text = msg.text?.trim() || '';
      this.refreshTypeMember(chat);
      const { fullname, fullnameWithUsername } = this.currentUser;

      if (this.asAdmin) {
        if (text && this.config.get('waitingCookie') === true) {
          this.config.set('waitingCookie', false);
          await this.setCookie(chatId, text, {
            testingData: true,
            asAdminMember: this.asAdminMember,
          });
          return;
        }
      }

      const nameWithChatId = fullname + '|' + chatId;
      const currentDateString = dayjs().format('YYYY-MM-DD hh:mm:ss A');
      let textLog = text.startsWith('/') ? text : `\`${text}\``;

      const custom_emoji_ids = [] as string[];
      const emoji_texts = [] as string[];

      if (msg.entities) {
        msg.entities.forEach(async (entity) => {
          if (entity.type === 'custom_emoji') {
            if (entity.custom_emoji_id)
              custom_emoji_ids.push(entity.custom_emoji_id);
          }
        });
      } else if (text.length > 1 && text.length <= 5) {
        // 1. Remove all emoji-like characters using Unicode Property Escapes
        // We use 'u' flag for unicode support.
        // \s matches whitespace, so we allow spaces between emojis.
        const nonEmojiRegex = /[^\p{Extended_Pictographic}\s]/gu;

        // 2. Remove things that look like emojis but are actually numbers/symbols (0-9, #, *)
        const cleanText = text.replace(nonEmojiRegex, '');
        emoji_texts.push(cleanText);
      }

      if (this.asAdmin && custom_emoji_ids.length)
        await bot.sendMessage(
          chatId,
          custom_emoji_ids.map((id) => `Emoji ID: \`${id}\``).join('\n'),
          {
            parse_mode: 'MarkdownV2',
          }
        );
      else if (emoji_texts.length) {
        await bot.sendMessage(chatId, emoji_texts.join(''));
      }

      const logging = [
        'msg',
        textLog,
        'from',
        nameWithChatId,
        'at',
        currentDateString,
      ];
      this.logger.info(logging.join(' '));

      if (this.currentDate.day() === new Date().getDate()) {
        const activeUser = this.activeUserMap.get(userId);
        if (!this.asAdmin && text) {
          delete logging[2];
          delete logging[3];
          this.activeUserMap.set(userId, {
            id: userId,
            fullnameWithUsername,
            fullname,
            username: msg.from?.username,
            lastActive: new Date(),
            logging: [...(activeUser?.logging || []), logging.join(' ')].slice(
              -15
            ),
          });
        }
      } else {
        this.activeUserMap.clear();
      }

      if (custom_emoji_ids.length || emoji_texts.length) return;

      const isPublicCommands = ['/start', '/help'].some((t) =>
        text.startsWith(t)
      );

      let isUniqueCommand = [
        '/menu',
        '/add',
        '/remove',
        '/add',
        '/remove',
        '/get',
        '/set',
        '/reset',
        '/clear',
        '/show',
        '/stg',
        '/settings',
      ].some((t) => text.startsWith(t));
      if (!isPublicCommands && isUniqueCommand && !this.asAdmin) {
        await this.alertNoPermissionMessage(chatId);
        return;
      }
      const { chatId: chat_id, messageId } = { ...this.invalidMessage };
      if (chat_id && messageId) {
        try {
          this.invalidMessage.chatId = undefined;
          this.invalidMessage.messageId = undefined;
          await bot.deleteMessage(chat_id, messageId, {
            parse_mode: 'Markdown',
          });
        } catch (error) {
          this.logger.error(
            'Delete invalid message ' + (error as Error).message
          );
        }
      }
      if (!isPublicCommands && !isUniqueCommand && text) {
        const logCode = text.startsWith('/') ? text.slice(1) : text;
        await this.onTextCheckLogCodeHandler(msg, logCode);
      }
    });

    bot.on('sticker', (msg) => {
      const stickerId = msg.sticker?.file_id;
      const stickerSet = msg.sticker?.set_name;
      if (this.asAdmin) {
        // The bot will reply with the ID so you can copy it easily
        bot.sendMessage(
          msg.chat.id,
          ''.concat(
            `Sticker ID: \`${stickerId}\`\n`,
            `From Set: ${stickerSet}`
          ),
          { parse_mode: 'Markdown' }
        );
      } else if (stickerId) {
        bot.sendSticker(msg.chat.id, stickerId);
      }
    });
    bot.on('animation', (msg) => {
      const fileId = msg.animation?.file_id;
      const fileUniqueId = msg.animation?.file_unique_id;

      this.refreshTypeMember(msg.chat);
      if (this.asAdmin && fileId) {
        this.logger.info(`✅ Received GIF!`);
        // You can now save this fileId to your Map or Database
        bot.sendMessage(
          msg.chat.id,
          ''.concat(
            `GIF File ID: \`${fileId}\`\n`,
            `File Unique ID: \`${fileUniqueId}\``
          ),
          {
            parse_mode: 'Markdown',
          }
        );
      }
    });

    bot.on('photo', async (msg) => {
      const chatId = msg.chat.id;

      // Telegram sends multiple sizes; the last one is usually the highest resolution
      const fileId = msg.photo?.[msg.photo.length - 1].file_id as string;

      try {
        this.refreshTypeMember(msg.chat);
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
        const logCode = result.getText().trim().split('-')[0];
        this.logger.info(`Result from image: ${result.getText()}`);
        this.logger.info(`✅ Detected code from image: ${logCode}`);

        await bot
          .editMessageText(`លេខកូដ: \`${logCode || 'រកអត់ឃើញ'}\``, {
            chat_id: loadingMessage.chat.id,
            message_id: loadingMessage.message_id,
            parse_mode: 'Markdown',
          })
          .catch();
        await this.onTextCheckLogCodeHandler(msg, logCode);
      } catch (err: any) {
        this.logger.error(err.message);
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

      if (data)
        try {
          this.refreshTypeMember(msg.chat);
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

    bot.on('polling_error', (error) => {
      this.logger.error('[Polling]: ' + error.name + ' ' + error.message);
    });

    return this;
  }
}

export function setupBot() {
  if (!TOKEN || !WEB_APP_URL) {
    throw new Error(
      'BOT_TOKEN and WEB_APP_URL must be defined in the .env file.'
    );
  }

  // Initialize Telegram Bot
  const bot = new TelegramBot(
    TOKEN,
    IS_DEV ? { polling: true } : { webHook: true, polling: false }
  );
  return bot;
}

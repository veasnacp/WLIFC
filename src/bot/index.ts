import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import { WLLogistic } from '../wl/edit';
import { Data } from '../wl/types';
import { chunkArray, removeDuplicateObjArray } from '../utils/is';
import { PUBLIC_URL } from '../config/constants';
import translate from '@iamtraction/google-translate';

const isDev = process.env.NODE_ENV && process.env.NODE_ENV === 'development';
const WL_MEMBERS_LIST = process.env.WL_MEMBERS_LIST;

export function isAdmin(msg: TelegramBot.Message) {
  return process.env.ADMIN?.split(',').some((n) => n === msg.chat.username);
}

export function isMemberAsAdmin(msg: TelegramBot.Message) {
  const WL_MEMBERS_LIST = config.get('WL_MEMBERS_LIST') as string[] | undefined;
  if (!WL_MEMBERS_LIST) return false;
  return WL_MEMBERS_LIST.some(
    (n) => n === (msg.chat.username || msg.chat.first_name)
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
const publicPath = path.join(process.cwd(), 'public');
const currentFileName = `data-${currentDate.month()}-${currentDate.day()}.json`;
const fileData = path.join(publicPath, currentFileName);
const fs = process.getBuiltinModule('fs');
if (isDev) {
  if (fs && fs.existsSync(fileData)) {
    const dataString = fs.readFileSync(fileData, { encoding: 'utf-8' });
    if (dataString.startsWith('[') && dataString.endsWith(']')) {
      try {
        DATA = JSON.parse(dataString);
      } catch {}
    }
  }
}
type ConfigCache = {
  cookie: string;
  WL_MEMBERS_LIST: string[];
  bannedUsers: string[];
};
type PreMapConfig = Map<keyof ConfigCache, ConfigCache[keyof ConfigCache]>;
type MapConfig = Omit<PreMapConfig, 'get' | 'set'> & {
  get: <K extends keyof ConfigCache>(key: K) => ConfigCache[K] | undefined;
  set: <K extends keyof ConfigCache>(
    key: K,
    value: ConfigCache[K]
  ) => MapConfig;
};

const cacheData = new Map<string, Data>(DATA);
const config = new Map() as MapConfig;
config.set(
  'WL_MEMBERS_LIST',
  WL_MEMBERS_LIST ? WL_MEMBERS_LIST.split(',') : []
);
config.set('bannedUsers', []);

const loggingCache = new Set<string>();

let invalidMessage = { chadId: undefined, messageId: undefined } as Record<
  'chadId' | 'messageId',
  number | undefined
>;

export const deleteInlineKeyboardButton = {
  text: 'Delete',
  callback_data: 'delete',
} as TelegramBot.InlineKeyboardButton;
export function sendMessageOptions(
  options?: (TelegramBot.SendMessageOptions | TelegramBot.SendPhotoOptions) &
    Partial<{
      inlineKeyboardButtons: TelegramBot.InlineKeyboardButton[];
      translateText: string;
    }>
) {
  const { inlineKeyboardButtons, translateText } = options || {};
  let defaultInlineKeyboardButtons = [deleteInlineKeyboardButton];
  if (inlineKeyboardButtons?.length) {
    defaultInlineKeyboardButtons.push(...inlineKeyboardButtons);
  }
  if (translateText?.trim()) {
    defaultInlineKeyboardButtons.push(
      translateInlineKeyboardButton('zh', translateText)
    );
  }
  return {
    ...options,
    reply_markup: {
      inline_keyboard: [defaultInlineKeyboardButtons],
      ...options?.reply_markup,
    },
  } as TelegramBot.SendMessageOptions;
}

export const adminInlineKeyboardButtons = [
  {
    text: 'Show LogCodes',
    callback_data: 'getLogCodes',
  },
  {
    text: 'Show Logging',
    callback_data: 'getLogging',
  },
  {
    text: 'Show Config Users',
    callback_data: 'getConfigUsers',
  },
  {
    text: 'Reset Data',
    callback_data: 'resetData',
  },
  {
    text: 'Clear All',
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

export async function onTextNumberAction(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  logCode: string | undefined,
  options?: Partial<{
    withMore: boolean;
    showAllSmallPackage: boolean;
    isSubLogCode: boolean;
  }>
) {
  const chatId = msg.chat.id;
  if (!logCode) return;

  const isTrackingNumber = !logCode.startsWith('25');

  if (
    config
      .get('bannedUsers')
      ?.some((u) => u === (msg.chat.username || msg.chat.first_name))
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
    const loadingMessage = await bot.sendMessage(chatId, LOADING_TEXT, {
      parse_mode: 'Markdown',
    });

    loadingMsgId = loadingMessage.message_id;

    // THE AWAITED LONG-RUNNING OPERATION ---
    const cookie =
      (config.get('cookie') as string) || process.env.WL_COOKIE || '';
    const wl = new WLLogistic(logCode, cookie);
    wl.asAdminMember = isMemberAsAdmin(msg);
    wl.onError = function (error) {
      bot
        .sendMessage(chatId, 'oOP! Unavailable to access data.')
        .then((message) => {
          invalidMessage.chadId = chatId;
          invalidMessage.messageId = message.message_id;
        });
    };
    let data:
      | (Data & {
          isSmallPackage?: boolean;
          smallPackageGoodsNames?: string[];
          subLogCodes?: string[];
        })
      | undefined;
    let _logCode = logCode;
    if (options?.showAllSmallPackage)
      cacheData.keys().find((k) => {
        if (k.includes(logCode)) {
          _logCode = k;
        }
      });
    const _data = cacheData.get(_logCode) as typeof data;
    let refetchData = true;
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
    }
    if (refetchData) {
      const wl_data = await wl.getDataFromLogCode(
        undefined,
        options?.showAllSmallPackage,
        options?.isSubLogCode
      );
      if (wl_data && 'message' in wl_data && wl_data.message === 'not found') {
        await bot.deleteMessage(chatId, loadingMsgId);
        bot.sendMessage(
          chatId,
          `🤷 លេខបុង <b>${logCode}</b> មិនទាន់មានទិន្នន័យនោះទេ។\n🤓 សូមពិនិត្យមើលឡើងវិញម្តងទៀត...`,
          sendMessageOptions({
            parse_mode: 'HTML',
          })
        );
        return;
      } else {
        // @ts-ignore
        data = wl_data;
      }
    }
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
      const _logCode = data.subLogCodes ? data.subLogCodes.join('-') : logCode;
      if (!cacheData.get(_logCode)) {
        cacheData.set(_logCode, data);
        if (isDev) {
          const fs = process.getBuiltinModule('fs');
          if (fs) {
            const DATA = Array.from(cacheData.entries());
            if (DATA.length)
              fs.writeFileSync(fileData, JSON.stringify(DATA, null, 2), {
                encoding: 'utf-8',
              });
          }
        }
      }
      textMessage = ''
        .concat(
          `- លេខបុង: ${
            isTrackingNumber ? data.logcode : logCode
          } ✅ ទូរចុងក្រោយ: ${
            data.container_num?.split('-').slice(1).join('.') || 'N/A'
          }\n`,
          `- កូដអីវ៉ាន់: ${data.mark_name}\n`,
          `- ចំនួន: ${data.goods_number}\n`,
          'goods_numbers' in data &&
            Array.isArray(data.goods_numbers) &&
            data.goods_numbers.length > 1
            ? `- ចំនួនបែងចែកទូរ: [${data.goods_numbers.join(', ')}]\n`
            : '',
          `- ទម្ងន់: ${data.weight}kg\n`,
          `- ម៉ែត្រគូបសរុប: ${Number(data.volume).toFixed(3)}m³\n`,
          `- ម៉ែត្រគូបផ្សេងគ្នា: ${
            data.volume_record?.trim()
              ? ''.concat(
                  '[\n',
                  data.volume_record
                    .split('<br>')
                    .filter(Boolean)
                    .map((v) => {
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
          `- ផ្សេងៗ: ${data.desc}\n`
        )
        .substring(0, MAX_TEXT_LENGTH);
      caption = textMessage.substring(0, MAX_CAPTION_LENGTH);
    }

    const showMoreCaption = async () => {
      if (data && options?.withMore) {
        await bot.sendMessage(
          chatId,
          ''
            .concat(
              `<b>Container Number:</b> ${data.container_num}\n`,
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
              `<b>Total: $${Number(data.total).toFixed(2)}</b> (${
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
                : ''
            )
            .substring(0, MAX_TEXT_LENGTH),
          sendMessageOptions({
            parse_mode: 'HTML',
          })
        );
      }
    };

    // const media = photos.map((p, i) => ({
    //   type: 'photo',
    //   media: p,
    //   // ...(i === 0 && caption ? { caption } : {}),
    // })) as TelegramBot.InputMedia[];

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
      await bot.deleteMessage(chatId, loadingMsgId);
      return;
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
            })
          )
          .then(async () => {
            console.log(`Successfully sent an photo.`);
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
        const tryLoadingMessage = await bot.sendMessage(
          chatId,
          '⏳ Trying load image...'
        );
        await sendPhoto(`${PUBLIC_URL}/blob/image?url=${photos[0]}`);
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
                `Successfully sent an album with ${sentMessages.length} items.`
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
      if (caption) {
        await bot.sendMessage(
          chatId,
          caption,
          sendMessageOptions({
            translateText: logCode,
          })
        );
      }
      await showMoreCaption();
    }
    await bot.deleteMessage(chatId, loadingMsgId);
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
  if (isAdmin(msg)) {
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

const integerRegExp = /^\d+$/;

export function runBot(bot: TelegramBot, { webAppUrl }: { webAppUrl: string }) {
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(
      chatId,
      `សួស្តី! ${msg.chat.first_name}\nសូមបញ្ចូលលេខបុង... 👇👇👇`
    );
  });

  bot.onText(/\/setCookie (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const cookie = match?.[1]?.trim();
    if (typeof cookie === 'string') {
      config.set('cookie', cookie);
      bot.sendMessage(chatId, 'Successfully set new cookie');
    }
  });

  onTextConfigUserWithAdminPermission(bot, /\/addMember (.+)/, {
    key: 'WL_MEMBERS_LIST',
    type: 'add',
  });
  onTextConfigUserWithAdminPermission(bot, /\/removeMember (.+)/, {
    key: 'WL_MEMBERS_LIST',
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
    if (isAdmin(msg)) {
      const data = Array.from(config.entries())
        .filter(([_, v]) => Array.isArray(v))
        .map(
          ([k, v]) =>
            `=== ✅ ${k.toUpperCase()} ✅ ===\n${(v as string[]).join(', ')}`
        )
        .join('\n\n');
      await bot.sendMessage(chatId, data.slice(0, MAX_CAPTION_LENGTH)).catch();
    }
  };
  const resetData = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    cacheData.clear();
    if (isDev) {
      const fs = process.getBuiltinModule('fs');
      if (fs && fs.existsSync(fileData)) {
        fs.unlinkSync(fileData);
        await bot.sendMessage(chatId, '✅ Successfully data reset');
      }
    }
  };
  const clearAll = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    try {
      let isError = false;
      let message = '✅ Done!!!';
      if (fs && !isDev) {
        const files = fs.readdirSync(publicPath);
        const filesToDelete = files.filter((file) => {
          const isException = file === currentFileName;
          const isJson = path.extname(file).toLowerCase() === '.json';

          const fullPath = path.join(publicPath, file);
          const isFile = fs.statSync(fullPath).isFile();
          return isJson && isFile && !isException;
        });
        filesToDelete.forEach((file) => {
          const filePath = path.join(publicPath, file);
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
    if (isDev) {
      const fs = process.getBuiltinModule('fs');
      if (fs && fs.existsSync(fileData)) {
        const dataString = fs.readFileSync(fileData, { encoding: 'utf-8' });
        if (dataString.startsWith('[') && dataString.endsWith(']')) {
          try {
            DATA = JSON.parse(dataString);
            if (DATA) {
              bot.sendMessage(
                chatId,
                Array.from(new Map(DATA).values())
                  .map((d) => '/' + Number(d.logcode))
                  .join('\n')
              );
            }
          } catch {}
        }
      }
    }
  };
  const getLogging = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    const loggingData = Array.from(loggingCache.values());
    if (loggingData.length) {
      try {
        bot.sendMessage(chatId, loggingData.join('\n'), sendMessageOptions());
      } catch {}
    }
  };

  bot.onText(/\/showButtons/, (msg) => {
    const chatId = msg.chat.id;

    if (isAdmin(msg))
      bot
        .sendMessage(chatId, 'All Buttons for admin', {
          reply_markup: {
            inline_keyboard: [
              [...adminInlineKeyboardButtons.slice(0, 2)],
              [...adminInlineKeyboardButtons.slice(2, 3)],
              [...adminInlineKeyboardButtons.slice(3)],
            ],
          },
        })
        .catch();
  });

  bot.onText(/\/getLogCodes/, getLogCodes);
  bot.onText(/\/getLogging/, getLogging);
  bot.onText(/\/getConfigUsers/, getConfigUsers);
  bot.onText(/\/resetData/, resetData);
  bot.onText(/\/clear/, clearAll);

  bot.on('callback_query', async function onCallbackQuery(query) {
    const action = query.data;
    const msg = query.message;
    const chatId = msg?.chat.id;
    try {
      if (chatId) {
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
        } else {
          switch (action as AdminInlineKeyboardAction) {
            case 'getLogCodes':
              getLogCodes(msg);
              break;
            case 'getLogging':
              getLogging(msg);
              break;
            case 'getConfigUsers':
              getConfigUsers(msg);
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

  bot.onText(/^(?!\/)(?!\d+$).+/, async (msg, match) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!match || !text) {
      return;
    }

    if (
      text.toLowerCase().startsWith('c:') ||
      text.toLowerCase().startsWith('s:') ||
      text.toLowerCase().startsWith('sm:')
    ) {
      const showAllSmallPackage = text.startsWith('sm:');
      const logCode = text.slice(showAllSmallPackage ? 3 : 2).trim();
      const isValidSmallPackageLogCode = logCode.startsWith('1757') ? logCode.length === 10 :
        logCode.length >= 12 && logCode.length <= 15;
      if (!isValidSmallPackageLogCode) {
        bot.sendMessage(
          msg.chat.id,
          ''.concat(
            'នែ៎ៗៗ! លេខកូដមិនត្រឹមត្រូវទេ។ សូមបញ្ចូលម្តងទៀត។\n',
            '❌ Sorry, invalid code. Please try again.'
          )
        );
        return;
      } else {
        const asAdminMember = isMemberAsAdmin(msg);
        await onTextNumberAction(bot, msg, logCode, {
          withMore: asAdminMember,
          showAllSmallPackage,
          isSubLogCode: true,
        });
        return;
      }
    }
    try {
      const message = await bot.sendMessage(
        chatId,
        `${msg.chat.first_name}! សូមបញ្ចូលលេខបុងរបស់អ្នក​ 😊\n`.concat(
          'ឥឡូវនេះអ្នកក៏អាចបញ្ចូលលេខកូដ(Tracking Number)ផ្សេងទៀតបានដែរ\n',
          'Ex: s:735858...., s:YT7591..., s:SF3295..., s:JT3145...'
        )
      );
      invalidMessage.chadId = chatId;
      invalidMessage.messageId = message.message_id;
    } catch (error) {
      console.error(
        'Error sending simple text message:',
        (error as Error).message
      );
    }
  });

  bot.onText(integerRegExp, async (msg, match) => {
    if (!match) {
      bot.sendMessage(msg.chat.id, '❌ Sorry, invalid Code. Please try again.');
      return;
    }
    const logCode = msg.text?.trim() || '';

    const isValidStartsWith = logCode.startsWith('25');
    if (
      !isValidStartsWith ||
      (isValidStartsWith && logCode.length !== '251209180405'.length)
    ) {
      bot.sendMessage(
        msg.chat.id,
        'នែ៎ៗៗ! លេខបុងមិនត្រឹមត្រូវទេ។ សូមបញ្ចូលម្តងទៀត។\n'.concat(
          logCode.startsWith('1757')
            ? 'លេខបុងប្រភេទនេះមិនទាន់បញ្ចូលទិន្នន័យទេ សូមប្រើលេខបុងដែលចាប់ផ្តើមពីលេខ25\n'
            : '',
          '❌ Sorry, invalid code. Please try again.'
        )
      );
      return;
    }
    await onTextNumberAction(bot, msg, logCode);
  });

  // Listen for data sent back from the Mini App (via tg.sendData)
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || '';
    const logging = [
      'message',
      msg.text,
      'by user:',
      msg.chat.first_name + (msg.chat.username ? `(${msg.chat.username})` : ''),
      'at',
      currentDate.date.toISOString(),
    ].join(' ');
    if (currentDate.day() === new Date().getDate()) {
      loggingCache.add(logging);
    } else {
      loggingCache.clear();
    }
    console.log(logging);

    const asAdminMember = isMemberAsAdmin(msg);
    const { chadId, messageId } = { ...invalidMessage };
    if (chadId && messageId) {
      try {
        invalidMessage.chadId = undefined;
        invalidMessage.messageId = undefined;
        await bot.deleteMessage(chadId, messageId, {
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
        await onTextNumberAction(bot, msg, t, { withMore: asAdminMember });
      }
    }
  });
  return bot;
}

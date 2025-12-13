import TelegramBot from 'node-telegram-bot-api';
import { WLLogistic } from '../wl/edit';
import { Data } from '../wl/types';
import { chunkArray, isNumber, removeDuplicateObjArray } from '../utils/is';
import path from 'path';

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

interface MiniAppData {
  action: string;
  timestamp: string;
  user_id: number | string;
}

export const LOADING_TEXT =
  'សូមមេត្តារងចាំបន្តិច... កំពុងស្វែងរកទិន្នន័យ\n🔄 Processing your request... Please hold tight!';
const MAX_CAPTION_LENGTH = 1024;

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
};
const cacheData = new Map<string, Data>(DATA);
const config = new Map<keyof ConfigCache, ConfigCache[keyof ConfigCache]>();
config.set(
  'WL_MEMBERS_LIST',
  WL_MEMBERS_LIST ? WL_MEMBERS_LIST.split(',') : []
);

let invalidMessage = { chadId: undefined, messageId: undefined } as Record<
  'chadId' | 'messageId',
  number | undefined
>;

export const deleteInlineKeyboardButton = {
  text: 'Delete',
  callback_data: 'delete',
} as TelegramBot.InlineKeyboardButton;
export function sendMessageOptions(
  options?: TelegramBot.SendMessageOptions | TelegramBot.SendPhotoOptions
) {
  return {
    ...options,
    reply_markup: {
      inline_keyboard: [[deleteInlineKeyboardButton]],
      ...options?.reply_markup,
    },
  } as TelegramBot.SendMessageOptions;
}

export async function onTextNumberAction(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  logCode: string | undefined,
  options?: {
    withMore: boolean;
  }
) {
  const chatId = msg.chat.id;
  if (!logCode) return;

  const isValidStartsWith = logCode.startsWith('25');
  if (
    !isValidStartsWith ||
    (isValidStartsWith && logCode.length !== '251209180405'.length)
  ) {
    bot.sendMessage(
      chatId,
      'នែ៎ៗៗ! លេខបុងមិនត្រឹមត្រូវទេ។ សូមបញ្ចូលម្តងទៀត។\n'.concat(
        logCode.startsWith('1757')
          ? 'លេខបុងប្រភេទនេះមិនទាន់បញ្ចូលទិន្នន័យទេ សូមប្រើលេខបុងដែលចាប់ផ្តើមពីលេខ25\n'
          : '',
        '❌ Sorry, invalid code. Please try again.'
      )
    );
    return;
  }
  let loadingMsgId; // Variable to store the Message ID of the loading text

  try {
    // Send the loading text and store the message object
    const loadingMessage = await bot.sendMessage(chatId, LOADING_TEXT, {
      parse_mode: 'Markdown',
    });

    // Extract the message ID so we can delete it later
    loadingMsgId = loadingMessage.message_id;

    // THE AWAITED LONG-RUNNING OPERATION ---
    const cookie =
      (config.get('cookie') as string) || process.env.WL_COOKIE || '';
    console.log('cookie', cookie);
    const wl = new WLLogistic(logCode, cookie);
    wl.onError = function (error) {
      bot
        .sendMessage(chatId, 'oOP! Unavailable to access data.')
        .then((message) => {
          invalidMessage.chadId = chatId;
          invalidMessage.messageId = message.message_id;
        });
    };
    let data: Data | undefined;
    const _data = cacheData.get(logCode);
    if (_data && typeof _data === 'object' && Object.values(_data).length) {
      data = _data;
    } else {
      const wl_data = await wl.getDataFromLogCode();
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
    if (data && typeof data.warehousing_pic === 'string') {
      photos = wl.getPhotoFromData(data);
    }
    let caption: string | undefined;

    if (data) {
      if (!cacheData.get(logCode)) {
        cacheData.set(logCode, data);
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
      caption = ''
        .concat(
          `- លេខបុង: ${logCode} ✅\n`,
          `- កូដអីវ៉ាន់: ${data.mark_name}\n`,
          `- ចំនួន: ${data.goods_number}\n`,
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
          `- ទំនិញ: ${data.goods_name}\n`,
          `- ផ្សេងៗ: ${data.desc}\n`
        )
        .substring(0, MAX_CAPTION_LENGTH);
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
              `<b>Form Name:</b> ${data.from_name}${
                data.from_phone ? ` (${data.from_phone})` : ''
              }\n`,
              `<b>Form Address:</b> ${data.from_address}\n`,
              `<b>To Name:</b> ${data.to_name}${
                data.to_phone ? ` (${data.to_phone})` : ''
              }\n`,
              `<b>To Address:</b> ${data.to_address}\n`,
              `<b>Total: $${data.total}</b> (${
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
            .substring(0, MAX_CAPTION_LENGTH),
          sendMessageOptions({
            parse_mode: 'HTML',
          })
        );
      }
    };

    const media = photos.map((p, i) => ({
      type: 'photo',
      media: p,
      ...(i === 0 && caption ? { caption } : {}),
    })) as TelegramBot.InputMedia[];

    if (caption && photos.length === 0) {
      bot.sendMessage(
        chatId,
        `🏞### អត់មានរូបភាពទេ ###🏞 \n\n${caption}`,
        sendMessageOptions()
      );
      // Delete the temporary loading message
      await bot.deleteMessage(chatId, loadingMsgId);
      return;
    }

    // Send the final generated photo
    if (photos.length === 1) {
      await bot
        .sendPhoto(
          chatId,
          photos[0],
          sendMessageOptions({
            caption,
          })
        )
        .then(async () => {
          console.log(`Successfully sent an photo.`);
          await showMoreCaption();
        })
        .catch((error) => {
          console.error('Error sending photo:', (error as Error).message);
          bot.sendMessage(
            chatId,
            '❌ សូមទោស! ការផ្ញើរូបភាពមានបញ្ហា សូមព្យាយាមម្តងទៀត។'
          );
        });
    } else {
      let isError = false;
      const medias = chunkArray(media, 10);
      for (let i = 0; i < medias.length; i++) {
        await bot
          .sendMediaGroup(chatId, medias[i])
          .then((sentMessages) => {
            console.log(
              `Successfully sent an album with ${sentMessages.length} items.`
            );
          })
          .catch((error) => {
            isError = true;
            console.error(
              'Error sending media group:',
              (error as Error).message
            );
            bot.sendMessage(
              chatId,
              '❌ សូមទោស! ការផ្ញើរូបភាពមានបញ្ហា សូមព្យាយាមម្តងទៀត។'
            );
          });
      }
      if (!isError) {
        await showMoreCaption();
      }
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
  bot.onText(/\/getLogCodes/, async (msg) => {
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
  });
  bot.onText(/\/addMember (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const username_or_first_name = match?.[1]?.trim().substring(0, 20);
    if (isAdmin(msg)) {
      const members = (config.get('WL_MEMBERS_LIST') as string[]) || [];
      if (username_or_first_name) {
        const hasMember = members.includes(username_or_first_name);
        if (!hasMember)
          config.set('WL_MEMBERS_LIST', [...members, username_or_first_name]);
        await bot.sendMessage(
          chatId,
          !hasMember
            ? `✅ ${username_or_first_name} បានចូលជាសមាជិកពេញសិទ្ធិ។`
            : `${username_or_first_name} already added!`
        );
      }
    } else {
      await bot.sendMessage(
        chatId,
        `❌ ${msg.chat.first_name} អ្នកមិនមានសិទ្ធិក្នុងការបន្ថែមសមាជិកនោះទេ!`
      );
    }
  });
  bot.onText(/\/removeMember (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const username_or_first_name = match?.[1]?.trim().substring(0, 20);
    if (isAdmin(msg)) {
      const members = (config.get('WL_MEMBERS_LIST') as string[]) || [];
      if (username_or_first_name) {
        const hasMember = members.includes(username_or_first_name);
        if (hasMember)
          config.set(
            'WL_MEMBERS_LIST',
            members.filter((m) => m === username_or_first_name)
          );
        await bot.sendMessage(
          chatId,
          hasMember
            ? `✅ ${username_or_first_name} បានដកចេញពីសមាជិកពេញសិទ្ធិ។`
            : `Currently, ${username_or_first_name} is not in full options member.`
        );
      }
    } else {
      await bot.sendMessage(
        chatId,
        `❌ ${msg.chat.first_name} អ្នកមិនមានសិទ្ធិក្នុងការដកសមាជិកនោះទេ!`
      );
    }
  });
  bot.onText(/\/resetData/, async (msg) => {
    const chatId = msg.chat.id;
    cacheData.clear();
    if (isDev) {
      const fs = process.getBuiltinModule('fs');
      if (fs && fs.existsSync(fileData)) {
        fs.unlinkSync(fileData);
        await bot.sendMessage(chatId, '✅ Successfully data reset');
      }
    }
  });
  bot.onText(/^(?!\/)(?!\d+$).+/, async (msg, match) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!match || !text) {
      return;
    }
    try {
      const message = await bot.sendMessage(
        chatId,
        `${msg.chat.first_name}! សូមបញ្ចូលលេខបុងរបស់អ្នក​ 😊`
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

  bot.onText(/\/clear/, async (msg) => {
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
  });

  bot.on('callback_query', function onCallbackQuery(callbackQuery) {
    const action = callbackQuery.data;
    const msg = callbackQuery.message;
    const chatId = msg?.chat.id;
    try {
      if (action === 'delete' && chatId) {
        try {
          bot.deleteMessage(chatId, msg.message_id);
        } catch (error) {
          console.error('Error delete message:', (error as Error).message);
        }
      }
    } catch (error) {
      console.error('Error delete message:', (error as Error).message);
    }
  });

  bot.onText(integerRegExp, async (msg, match) => {
    if (!match) {
      bot.sendMessage(msg.chat.id, '❌ Sorry, invalid Code. Please try again.');
      return;
    }
    const logCode = msg.text?.trim();
    await onTextNumberAction(bot, msg, logCode);
  });

  // Listen for data sent back from the Mini App (via tg.sendData)
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || '';
    console.log(
      'message',
      msg.text,
      'by user:',
      msg.chat.first_name + (msg.chat.username ? `(${msg.chat.username})` : '')
    );
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
      if (asAdminMember && isNumeric) {
        await onTextNumberAction(bot, msg, t, { withMore: asAdminMember });
      }
    }
    // Check if the message contains data from a Web App
    if (msg.web_app_data) {
      try {
        const rawData = msg.web_app_data.data;
        // Type-cast the parsed data to ensure type safety
        const data: MiniAppData = JSON.parse(rawData);

        const action = data.action;
        const timestamp = data.timestamp;
        const userId = data.user_id;

        // Respond to the user with the data received
        let responseText = `🎉 **Data Received from App!** 🎉\n\n`;
        responseText += `**Action:** ${action}\n`;
        responseText += `**Timestamp:** ${timestamp}\n`;
        responseText += `**User ID:** ${userId}`;

        await bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error(
          'Error processing Web App data:',
          (error as Error).message
        );
        await bot.sendMessage(
          chatId,
          'Received data from Mini App, but an error occurred while processing.'
        );
      }
    }
  });
  return bot;
}

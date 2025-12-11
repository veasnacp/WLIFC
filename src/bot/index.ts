import TelegramBot from 'node-telegram-bot-api';
import { WLLogistic } from '../wl/edit';
import { Data } from '../wl/types';
import { chunkArray } from '../utils/is';
import path from 'path';

interface MiniAppData {
  action: string;
  timestamp: string;
  user_id: number | string;
}

export const LOADING_TEXT =
  'សូមមេត្តារងចាំបន្តិច... កំពុងស្វែងរកទិន្នន័យ\n🔄 Processing your request... Please hold tight!';

let DATA: Iterable<readonly [string, Data]> | undefined;
const fileData = path.join(process.cwd(), 'public/data.json');
const isDev = process.env.NODE_ENV && process.env.NODE_ENV === 'development';
if (isDev) {
  const fs = process.getBuiltinModule('fs');
  if (fs && fs.existsSync(fileData)) {
    const dataString = fs.readFileSync(fileData, { encoding: 'utf-8' });
    if (dataString.startsWith('[') && dataString.endsWith(']')) {
      try {
        DATA = JSON.parse(dataString);
      } catch {}
    }
  }
}
const cacheData = new Map<string, Data>(DATA);
const config = new Map();

export const deleteInlineKeyboardButton = {
  text: 'Delete',
  callback_data: 'delete',
} as TelegramBot.InlineKeyboardButton;
export function sendMessageOptions(options?: TelegramBot.SendMessageOptions) {
  return {
    ...options,
    reply_markup: {
      inline_keyboard: [[deleteInlineKeyboardButton]],
      ...options?.reply_markup,
    },
  } as TelegramBot.SendMessageOptions;
}

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
  let invalidMessage = { chadId: undefined, messageId: undefined } as Record<
    'chadId' | 'messageId',
    number | undefined
  >;
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
      console.error('Error sending simple text message:', error);
    }
  });

  bot.onText(/\/clear/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      bot.sendMessage(chatId, '✅ Done!!!');
    } catch (error) {
      console.error('Error sending clear message:', error);
    }
  });

  bot.on('callback_query', function onCallbackQuery(callbackQuery) {
    const action = callbackQuery.data;
    const msg = callbackQuery.message;
    const chatId = msg?.chat.id;
    if (action === 'delete' && chatId) {
      try {
        bot.deleteMessage(chatId, msg.message_id);
      } catch (error) {
        console.error('Error delete message:', error);
      }
    }
  });

  bot.onText(/^\d+$/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!match) {
      bot.sendMessage(chatId, '❌ Sorry, invalid Code. Please try again.');
      return;
    }
    const logCode = match[0].trim();
    if (!logCode) return;
    const isValidStartsWith = logCode.startsWith('25');
    if (
      !isValidStartsWith ||
      (isValidStartsWith && logCode.length !== '251209180405'.length)
    ) {
      bot.sendMessage(
        chatId,
        'នែ៎ៗៗ! លេខបុងមិនត្រឹមត្រូវទេ។ សូមបញ្ចូលម្តងទៀត។'.concat(
          '\n',
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
      const cookie = config.get('cookie') || process.env.WL_COOKIE || '';
      const wl = new WLLogistic(logCode, cookie);
      let data: Data | undefined;
      const _data = cacheData.get(logCode);
      if (_data && typeof _data === 'object') {
        data = _data;
      } else {
        const wl_data = await wl.getDataFromLogCode();
        const loadingMessage = await bot.sendMessage(chatId, 'loading...', {
          parse_mode: 'Markdown',
        });
        await bot.deleteMessage(chatId, loadingMessage.message_id);
        if (
          wl_data &&
          'message' in wl_data &&
          wl_data.message === 'not found'
        ) {
          await bot.deleteMessage(chatId, loadingMsgId);
          bot.sendMessage(
            chatId,
            `🤷 លេខបុង <b>${logCode}</b> មិនទាន់មានទិន្នន័យនោះទេ។\n🤓 សូមពិនិត្យមើលឡើងវិញម្តងទៀត...`,
            sendMessageOptions({
              parse_mode: 'HTML',
            })
          );
          return;
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
                fs.writeFileSync(fileData, JSON.stringify(DATA), {
                  encoding: 'utf-8',
                });
            }
          }
        }
        caption = ''.concat(
          '✅✅✅\n',
          `- លេខបុង: ${logCode}\n`,
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
          `- ផ្សេងៗ: ${data.desc}\n`
        );
      }

      const media = photos.map((p, i) => ({
        type: 'photo',
        media: p,
        ...(i === 0 && caption ? { caption } : {}),
      })) as TelegramBot.InputMedia[];
      // Delete the temporary loading message
      await bot.deleteMessage(chatId, loadingMsgId);

      if (caption && photos.length === 0) {
        bot.sendMessage(
          chatId,
          `🏞### អត់មានរូបភាពទេ ###🏞 \n\n${caption}`,
          sendMessageOptions()
        );
        return;
      }

      // Send the final generated photo
      if (photos.length === 1) {
        await bot.sendPhoto(chatId, photos[0], sendMessageOptions());
        if (caption) {
          bot.sendMessage(chatId, caption, sendMessageOptions());
        }
      } else {
        const medias = chunkArray(media, 10);
        for (let i = 0; i < medias.length; i++) {
          await bot
            .sendMediaGroup(chatId, medias[i])
            .then((sentMessages) => {
              console.log(
                `Successfully sent an album with ${sentMessages.length} items.`
              );
              if (caption && medias.length === i) {
                bot.sendMessage(chatId, '', sendMessageOptions());
              }
            })
            .catch((error) => {
              console.error('Error sending media group:', error.message);
              bot.sendMessage(
                chatId,
                '❌ សូមទោស! ការផ្ញើរូបភាពមានបញ្ហា សូមព្យាយាមម្តងទៀត។'
              );
            });
        }
      }
    } catch (error) {
      console.error('Error in image generation process:', error);

      // Try to delete the loading message if it was sent successfully
      if (loadingMsgId) {
        try {
          await bot.deleteMessage(chatId, loadingMsgId);
        } catch (deleteError) {
          console.warn(
            'Could not delete loading message on error:',
            (deleteError as Error).message
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
  });

  // Listen for data sent back from the Mini App (via tg.sendData)
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    console.log('message', msg.text, 'by user:', msg.chat.first_name);
    if (invalidMessage.chadId && invalidMessage.messageId) {
      await bot.deleteMessage(invalidMessage.chadId, invalidMessage.messageId, {
        parse_mode: 'Markdown',
      });
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
        console.error('Error processing Web App data:', error);
        await bot.sendMessage(
          chatId,
          'Received data from Mini App, but an error occurred while processing.'
        );
      }
    }
  });
  return bot;
}

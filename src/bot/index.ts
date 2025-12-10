import TelegramBot, { InlineKeyboardMarkup } from 'node-telegram-bot-api';
import { WLLogistic } from '../wl/edit';
import { Data } from '../wl/types';
import { isNumber } from '../utils/is';

interface MiniAppData {
  action: string;
  timestamp: string;
  user_id: number | string;
}

export const LOADING_TEXT = '🔄 Processing your request... Please hold tight!';

const cacheData = new Map();
const cacheKeys = new Set<string>();
const config = new Map();

export function runBot(bot: TelegramBot, { webAppUrl }: { webAppUrl: string }) {
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(
      chatId,
      `Hello, ${msg.chat.first_name}!\nEnter item's number...`
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

  bot.onText(/\/clear/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      Array(cacheData.keys()).forEach((k) => {});
      const keys = Array.from(cacheKeys.keys());
      if (keys.length)
        for (const k of keys) {
          const [chatId, messageId] = k.split('|');
          if (chatId && isNumber(messageId)) {
            await bot.deleteMessage(chatId, Number(messageId));
          }
        }
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
        const cacheKey = chatId + '|' + msg.message_id;
        if (cacheKeys.has(cacheKey)) {
          cacheKeys.delete(cacheKey);
        }
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
        data = await wl.getDataFromLogCode();
      }
      let photos = [] as string[];
      if (data && typeof data.warehousing_pic === 'string') {
        photos = wl.getPhotoFromData(data);
      }
      let caption: string | undefined;
      if (data) {
        if (!cacheData.get(logCode)) {
          cacheData.set(logCode, data);
        }
        caption = ''.concat(
          '✅✅✅\n',
          `- លេខបុង: ${logCode}\n`,
          `- កូដអីវ៉ាន់: ${data.mark_name}\n`,
          `- ចំនួន: ${data.goods_number}\n`,
          `- ទម្ងន់: ${data.weight}kg\n`,
          `- ម៉ែត្រគូបសរុប: ${data.volume}m³\n`,
          `- ម៉ែត្រគូបផ្សេងគ្នា: ${
            data.volume_record?.trim()
              ? ''.concat(
                  '[\n',
                  data.volume_record
                    .split('<br>')
                    .filter(Boolean)
                    .map((v) => `\t\t\t${v}`)
                    .join('\n'),
                  '\n]'
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

      // Send the final generated photo
      if (photos.length === 1) {
        await bot.sendPhoto(chatId, photos[0], {
          reply_markup: {
            inline_keyboard: [[{ text: 'Delete', callback_data: 'delete' }]],
          },
        });
        if (caption) {
          bot.sendMessage(chatId, 'caption', {
            reply_markup: {
              inline_keyboard: [[{ text: 'Delete', callback_data: 'delete' }]],
            },
          });
          cacheKeys.add(chatId + '|' + msg.message_id);
        }
      } else {
        await bot
          .sendMediaGroup(chatId, media)
          .then((sentMessages) => {
            console.log(
              `Successfully sent an album with ${sentMessages.length} items.`
            );
            if (caption) {
              bot.sendMessage(chatId, '', {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: 'Delete', callback_data: 'delete' }],
                  ],
                },
              });
              cacheKeys.add(chatId + '|' + msg.message_id);
            }
          })
          .catch((error) => {
            console.error('Error sending media group:', error.message);
            bot.sendMessage(
              chatId,
              '❌ Sorry, I failed to send the photo album.'
            );
          });
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
        '❌ Sorry, the generation failed. Please try again.'
      );
    }
  });

  // Listen for data sent back from the Mini App (via tg.sendData)
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    console.log('message', msg.text);
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

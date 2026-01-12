import TelegramBot from 'node-telegram-bot-api';

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
      logCodeOrAndForShowMore: string;
      messageIdsForDelete: string[];
    }>,
  asAdmin?: boolean
) {
  const {
    chat,
    inlineKeyboardButtons,
    translateText,
    logCodeOrAndForShowMore,
    messageIdsForDelete,
  } = options || {};
  if (messageIdsForDelete) {
    deleteInlineKeyboardButton.callback_data = 'delete'.concat(
      messageIdsForDelete.join('|')
    );
  }
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
  if (logCodeOrAndForShowMore && asAdmin) {
    inline_keyboard.push([
      showMoreDataInlineKeyboardButton(logCodeOrAndForShowMore),
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

export type AdminInlineKeyboardAction =
  (typeof adminInlineKeyboardButtons)[number]['callback_data'];

export const translateInlineKeyboardButton = (from: string, text: string) =>
  ({
    text: 'បកប្រែឈ្មោះទំនិញ',
    callback_data: 'tr_from_'.concat(from, '|', text),
  } as TelegramBot.InlineKeyboardButton);

export const showMoreDataInlineKeyboardButton = (
  logCodeOrAndMessageId: string
) =>
  ({
    text: 'Show More',
    callback_data: 'show_more_data'.concat(logCodeOrAndMessageId),
  } as TelegramBot.InlineKeyboardButton);

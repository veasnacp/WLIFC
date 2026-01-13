import TelegramBot from 'node-telegram-bot-api';

export interface BusinessConnection {
  id: string;
  user_id: number;
  user_chat_id: number;
  date: number;
  can_reply: boolean;
  is_enabled: boolean;
}

export interface TelegramBotClient extends TelegramBot {
  BusinessConnection: BusinessConnection;
  /** Deletes multiple messages (up to 100) in one request. Returns True on success. */
  deleteMessages(
    chatId: number | string,
    messageIds: number[]
  ): Promise<boolean>;

  /** Forwards multiple messages at once. Returns an array of MessageId objects. */
  forwardMessages(
    chatId: number | string,
    fromChatId: number | string,
    messageIds: number[],
    options?: TelegramBot.ForwardMessageOptions
  ): Promise<TelegramBot.MessageId[]>;

  /** Sends a gift to a user or channel. Returns True on success. */
  sendGift(
    giftId: string,
    options?: {
      user_id?: number;
      chat_id?: number | string;
      text?: string;
      text_parse_mode?: string;
      pay_for_upgrade?: boolean;
    }
  ): Promise<boolean>;

  /** * Streams a partial message to the user.
   * Used for "Drafting" states in forum topics or AI generation.
   */
  sendMessageDraft(
    chatId: number | string,
    text: string,
    options?: {
      draft_id?: number;
      message_thread_id?: number;
      parse_mode?: string;
    }
  ): Promise<boolean>;

  /** Gets details about a connected business account. */
  getBusinessConnection(
    businessConnectionId: string
  ): Promise<BusinessConnection>;
}

export interface TelecamConstructor {
  new (
    token: string,
    options?: TelegramBot.ConstructorOptions
  ): TelegramBotClient;
}

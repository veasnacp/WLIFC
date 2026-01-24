import TelegramBot from 'node-telegram-bot-api';
import {
  TelecamConstructor,
  TelegramBotClient,
  BusinessConnection as BC,
} from './types';

export declare namespace Telecam {
  interface Client extends TelegramBotClient {}
  interface Bot extends TelegramBotClient {}
  interface BusinessConnection extends BC {}
}
class BaseTelecam extends TelegramBot {
  constructor(token: string, options?: TelegramBot.ConstructorOptions) {
    super(token, options);
  }
}

export const Telecam = BaseTelecam as TelecamConstructor;

import TelegramBot from 'node-telegram-bot-api';
import {
  addSurrogate,
  delSurrogate,
  stripText,
  withinSurrogate,
} from '../helpers';
import { MessageEntity } from '../types';

export const DEFAULT_DELIMITERS: { [key: string]: MessageEntity } = {
  '**': { type: 'bold', offset: 0, length: 0 },
  _: { type: 'italic', offset: 0, length: 0 },
  __: { type: 'underline', offset: 0, length: 0 },
  '~~': { type: 'strikethrough', offset: 0, length: 0 },
  '`': { type: 'code', offset: 0, length: 0 },
  '```': { type: 'pre', offset: 0, length: 0 },
  '||': { type: 'spoiler', offset: 0, length: 0 },
  '>>': { type: 'blockquote', offset: 0, length: 0 },
  '*>>': { type: 'expandable_blockquote', offset: 0, length: 0 },
};

export const DEFAULT_URL_RE = /\[([^\]]+)\]\(([^)]+)\)/;
export function defaultUrlFormat(text: string, link: string) {
  return `[${text}](${link})`;
}

export function parse(
  message: string,
  delimiters: { [key: string]: MessageEntity } | null = null,
  url_re: RegExp | null = null
): [string, TelegramBot.MessageEntity[]] {
  if (!message) {
    return [message, []];
  }

  if (url_re === null) {
    url_re = DEFAULT_URL_RE;
  }

  if (!delimiters) {
    if (delimiters === null) {
      delimiters = DEFAULT_DELIMITERS;
    } else {
      return [message, []];
    }
  }

  const delimRe = new RegExp(
    Object.keys(delimiters)
      .sort((a, b) => b.length - a.length)
      .map((k) => `(${escapeMarkdownV2(k)})`)
      .join('|')
  );

  const entities: MessageEntity[] = [];
  let i = 0;
  message = addSurrogate(message);

  while (i < message.length) {
    const m = message.substring(i).match(delimRe);

    if (m && message.substring(i).startsWith(m[0])) {
      const delim = m.slice(1).find((d) => d)!;
      const end = message.indexOf(delim, i + delim.length + 1);

      if (end !== -1) {
        const text = message.substring(i + delim.length, end);
        message =
          message.substring(0, i) +
          text +
          message.substring(end + delim.length);

        for (const ent of entities) {
          if (ent.offset + ent.length > i) {
            if (
              ent.offset <= i &&
              ent.offset + ent.length >= end + delim.length
            ) {
              ent.length -= delim.length * 2;
            } else {
              ent.length -= delim.length;
            }
          }
        }
        const EntityType = delimiters[delim];
        const isCodeBlock =
          EntityType.type === 'code' || EntityType.type === 'pre';
        if (isCodeBlock) {
          entities.push({
            ...EntityType,
            offset: i,
            length: text.length,
          });
        } else {
          entities.push({ ...EntityType, offset: i, length: text.length });
        }

        if (isCodeBlock) {
          i = end - delim.length;
        }
        continue;
      }
    } else if (message.substring(i).trim().startsWith('$')) {
      const CASH_TAG_RE =
        /(?<!\w)\$([A-Z]{1,10})(?:@([a-zA-Z0-9_]{5,32}))?(?!\w)/;
      const cashTagMatch = message.substring(i).match(CASH_TAG_RE);
      if (cashTagMatch && message.substring(i).startsWith(cashTagMatch[0])) {
        const cashTagText = cashTagMatch[0];
        message =
          message.substring(0, i) +
          cashTagText +
          message.substring(i + cashTagMatch[0].length);

        const delimSize = cashTagMatch[0].length - cashTagText.length;
        for (const ent of entities) {
          if (ent.offset + ent.length > i) {
            ent.length -= delimSize;
          }
        }
        entities.push({
          type: 'cashtag',
          offset: i,
          length: cashTagText.length,
        });
        i += cashTagText.length;
        continue;
      }
    } else if (url_re) {
      const urlMatch = message.substring(i).match(url_re);
      if (urlMatch && message.substring(i).startsWith(urlMatch[0])) {
        const urlText = urlMatch[1];
        const url = urlMatch[2];
        message =
          message.substring(0, i) +
          urlText +
          message.substring(i + urlMatch[0].length);

        const delimSize = urlMatch[0].length - urlText.length;
        for (const ent of entities) {
          if (ent.offset + ent.length > i) {
            ent.length -= delimSize;
          }
        }
        entities.push({
          type: 'text_link',
          offset: i,
          length: urlText.length,
          url: delSurrogate(url),
        });
        i += urlText.length;
        continue;
      }
    }
    i++;
  }

  const strippedText = stripText(message, entities);
  return [delSurrogate(strippedText), entities as TelegramBot.MessageEntity[]];
}

export function unparse(
  text: string,
  entities: Iterable<MessageEntity>,
  delimiters: { [key: string]: MessageEntity } | null = null
): string {
  if (!text || !entities) {
    return text;
  }

  if (!delimiters) {
    if (delimiters === null) {
      delimiters = DEFAULT_DELIMITERS;
    } else {
      return text;
    }
  }

  const delimMap: { [key: string]: string } = {};
  for (const key in delimiters) {
    delimMap[delimiters[key].type] = key;
  }

  text = addSurrogate(text);
  const insertAt: [number, number, string][] = [];

  for (const [i, entity] of Array.from(entities).entries()) {
    const s = entity.offset;
    const e = entity.offset + entity.length;
    const delimiter = delimMap[entity.type];
    if (delimiter) {
      insertAt.push([s, i, delimiter]);
      insertAt.push([e, -i, delimiter]);
    } else {
      let url: string | undefined;
      if (entity.type === 'text_link') {
        url = entity.url;
      } else if (entity.type === 'mention') {
        url = `tg://user?id=${entity.user?.id}`;
      }
      if (url) {
        insertAt.push([s, i, '[']);
        insertAt.push([e, -i, `](${url})`]);
      }
    }
  }

  insertAt.sort((a, b) => b[0] - a[0] || b[1] - a[1]);

  while (insertAt.length) {
    let [at, _, what] = insertAt.pop()!;
    while (withinSurrogate(text, at)) {
      at++;
    }
    text = text.slice(0, at) + what + text.slice(at);
  }

  return delSurrogate(text);
}

export function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\\\]]/g, '\\$&'); // $& means the whole matched string
}
export function escapeMarkdownV2(text: string) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

export const markdown = {
  parse,
  unparse,
};

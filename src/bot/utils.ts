import TelegramBot from 'node-telegram-bot-api';
import { addSurrogate, delSurrogate } from './helpers';
import { escapeMarkdownV2 } from './extensions/markdown';
import { escapeHtml } from './extensions/html';

export function updateEntity<T extends TelegramBot.MessageEntity>(
  ent: T,
  updates: Partial<TelegramBot.MessageEntity>
): T {
  const newEnt = { ...ent, ...updates };
  return newEnt;
}

export function splitTextWithEntities(
  text: string,
  entities: TelegramBot.MessageEntity[],
  limit: number = 4096,
  maxEntities: number = 100,
  splitAt: RegExp[] = [/\n/g, /\s/g, /./g]
): [string, TelegramBot.MessageEntity[]][] {
  const results: [string, TelegramBot.MessageEntity[]][] = [];
  text = addSurrogate(text);

  while (true) {
    let currentLimit = limit;
    if (entities.length > maxEntities) {
      const lastEnt = entities[maxEntities - 1];
      currentLimit = Math.min(limit, lastEnt.offset + lastEnt.length);
    }

    if (text.length <= currentLimit) {
      break;
    }

    let splitFound = false;
    for (const splitRe of splitAt) {
      for (let i = currentLimit - 1; i >= 0; i--) {
        const match = text.substring(i).match(splitRe);
        if (match && (match.index || match.length > 0)) {
          const matchEnd = i + match[0].length;
          const curText = text.substring(0, matchEnd);
          const newText = text.substring(matchEnd);

          const curEnt: TelegramBot.MessageEntity[] = [];
          const newEnt: TelegramBot.MessageEntity[] = [];

          for (const ent of entities) {
            if (ent.offset < matchEnd) {
              if (ent.offset + ent.length > matchEnd) {
                curEnt.push(
                  updateEntity(ent, { length: matchEnd - ent.offset })
                );
                newEnt.push(
                  updateEntity(ent, {
                    offset: 0,
                    length: ent.offset + ent.length - matchEnd,
                  })
                );
              } else {
                curEnt.push(ent);
              }
            } else {
              newEnt.push(updateEntity(ent, { offset: ent.offset - matchEnd }));
            }
          }

          results.push([delSurrogate(curText), curEnt]);
          text = newText;
          entities = newEnt;
          splitFound = true;
          break;
        }
      }
      if (splitFound) {
        break;
      }
    }
    if (!splitFound) {
      break;
    }
  }

  results.push([delSurrogate(text), entities]);
  return results;
}

type ParseMode = TelegramBot.ParseMode;
type FormatContent = string | ((builder: ParseModeConvert) => void);

export class ParseModeConvert {
  private result: string = '';
  private with_escape: boolean = true;
  private readonly mode: ParseMode | null | undefined;

  constructor(mode: ParseModeConvert['mode'], with_escape = true) {
    this.mode = mode || 'MarkdownV2';
    this.with_escape = with_escape;
  }

  /**
   * Internal helper to escape text based on the selected mode.
   */
  private _escape(text: string, isCode: boolean = false): string {
    if (!this.with_escape) return text;
    if (this.mode === 'HTML') {
      return escapeHtml(text);
    } else {
      if (isCode) {
        // Inside code blocks, only backtick and backslash need escaping
        return text.replace(/[`\\]/g, '\\$&');
      }
      // Standard MarkdownV2 reserved characters
      return escapeMarkdownV2(text);
    }
  }

  /**
   * Processes input: if it's a string, escape it.
   * If it's a function, execute it with a new sub-builder.
   */
  private _process(content: FormatContent): string {
    if (typeof content === 'function') {
      const subBuilder = new ParseModeConvert(this.mode, this.with_escape);
      content(subBuilder);
      return subBuilder.build(); // Result is already escaped/formatted
    }
    return this._escape(content);
  }

  // --- Basic Formatting ---

  public text(content: FormatContent, with_escape = true): this {
    const str = this._process(content);
    this.result += with_escape && this.with_escape ? this._escape(str) : str;
    return this;
  }

  public b(str: string) {
    return this.mode === 'HTML' ? `<b>${str}</b>` : `**${str}**`;
  }
  public bold(content: FormatContent): this {
    const inner = this._process(content);
    this.result += this.b(inner);
    return this;
  }

  public i(str: string) {
    return this.mode === 'HTML' ? `<i>${str}</i>` : `_${str}_`;
  }
  public italic(str: string): this {
    str = this._escape(str);
    this.result += this.i(str);
    return this;
  }

  public u(str: string) {
    return this.mode === 'HTML' ? `<u>${str}</u>` : `__${str}__`;
  }
  public underline(str: string): this {
    str = this._escape(str);
    this.result += this.u(str);
    return this;
  }

  public s(str: string) {
    return this.mode === 'HTML' ? `<s>${str}</s>` : `~${str}~`;
  }
  public strike(str: string): this {
    str = this._escape(str);
    this.result += this.s(str);
    return this;
  }

  public sp(str: string) {
    return this.mode === 'HTML'
      ? `<tg-spoiler>${str}</tg-spoiler>`
      : `||${str}||`;
  }
  public spoiler(content: FormatContent): this {
    const inner = this._process(content);
    this.result += this.sp(inner);
    return this;
  }

  // --- Advanced Entities ---
  public l(text: string, url: string) {
    return this.mode === 'HTML'
      ? `<a href="${url}">${text}</a>`
      : `[${text}](${url})`;
  }
  public link(text: string, url: string): this {
    const str = this._escape(text);
    this.result += this.l(str, url);
    return this;
  }

  public m(text: string, userId: number | string) {
    return this.l(text, `tg://user?id=${userId}`);
  }
  public mention(text: string, userId: number | string): this {
    return this.link(text, `tg://user?id=${userId}`);
  }

  public c(str: string) {
    return this.mode === 'HTML' ? `<code>${str}</code>` : `\`${str}\``;
  }
  public code(str: string): this {
    str = this._escape(str, true);
    this.result += this.c(str);
    return this;
  }

  public p(str: string, language: string = '') {
    return this.mode === 'HTML'
      ? `<pre><code class="language-${language}">${str}</code></pre>`
      : `\`\`\`${language ? language + '\n' : ''}${str}\n\`\`\``;
  }
  public pre(str: string, language: string = ''): this {
    str = this._escape(str, true);
    this.result += this.p(str, language);
    return this;
  }

  /**
   * Telegram 2026 supports expandable blockquotes
   */
  public bl(inner: string, expandable: boolean = false) {
    if (this.mode === 'HTML') {
      const attr = expandable ? ' expandable' : '';
      return `<blockquote${attr}>${inner}</blockquote>`;
    } else {
      const prefix = expandable ? '*>>' : '>>';
      return `\n${prefix}${inner}${prefix}\n`;
    }
  }
  public blockquote(content: FormatContent, expandable: boolean = false): this {
    const inner = this._process(content);
    this.result += this.bl(inner, expandable);
    return this;
  }

  /**
   * Custom Emoji (Requires Premium bot/user context)
   */
  public ce(emoji: string, customEmojiId: string) {
    if (this.mode === 'HTML') {
      return `<tg-emoji emoji-id="${customEmojiId}">${emoji}</tg-emoji>`;
    } else {
      return `![${emoji}](tg://emoji?id=${customEmojiId})`;
    }
  }
  public customEmoji(emoji: string, customEmojiId: string): this {
    this.result += this.ce(emoji, customEmojiId);
    return this;
  }

  public nl(count: number = 1) {
    return '\n'.repeat(count);
  }
  public newline(count: number = 1): this {
    this.result += this.nl(count);
    return this;
  }

  public build(): string {
    return this.result;
  }
}

import { parse as parseHtml } from 'node-html-parser';
import type { HTMLElement, Node } from 'node-html-parser';
import { MessageEntity } from '../types';
import { addSurrogate, delSurrogate, stripText } from '../helpers';
import TelegramBot from 'node-telegram-bot-api';

/**
 * Parses an HTML string into a text string and a list of Telegram message entities.
 * @param html The HTML string to parse.
 * @returns An object containing the parsed text and entities.
 */
export function parse(html: string): [string, TelegramBot.MessageEntity[]] {
  if (!html) {
    return [html, []];
  }

  let text = '';
  const entities: MessageEntity[] = [];
  const open_tags: { tag: string; entity?: Partial<MessageEntity> }[] = [];

  function walk(node: Node) {
    if (node.nodeType === 3) {
      // Text node
      text += node.textContent;
    } else if (node.nodeType === 1) {
      // Element node
      const element = node as HTMLElement;
      const tag = element?.tagName?.toLowerCase();
      let entity: Partial<MessageEntity> | undefined = undefined;

      let EntityType: MessageEntity['type'] | undefined;
      const args: Partial<MessageEntity> = {};

      if (tag === 'strong' || tag === 'b') {
        EntityType = 'bold';
      } else if (tag === 'em' || tag === 'i') {
        EntityType = 'italic';
      } else if (tag === 'u' || tag === 'ins') {
        EntityType = 'underline';
      } else if (tag === 'del' || tag === 's' || tag === 'strike') {
        EntityType = 'strikethrough';
      } else if (tag === 'blockquote') {
        EntityType = 'blockquote';
        if (element.getAttribute('expandable')) {
          EntityType = 'expandable_blockquote';
        }
      } else if (tag === 'code') {
        // In Telegram, a code tag inside a pre tag is used for syntax highlighting
        // We will handle this in the 'pre' tag case
        if (!element.closest('pre')) {
          EntityType = 'code';
        }
      } else if (tag === 'pre') {
        EntityType = 'pre';
        const code = element.querySelector('code');
        const codeClass = code?.getAttribute('class');
        if (codeClass && codeClass.startsWith('language-')) {
          args.language = codeClass.substring('language-'.length);
        }
      } else if (tag === 'a') {
        const href = element.getAttribute('href');
        if (href) {
          if (href.startsWith('mailto:')) {
            EntityType = 'email';
          } else if (element.textContent === href) {
            EntityType = 'url';
          } else {
            EntityType = 'text_link';
            args.url = href;
          }
        }
      } else if (tag === 'tg-emoji') {
        const emojiId = element.getAttribute('emoji-id');
        if (emojiId) {
          EntityType = 'custom_emoji';
          args.custom_emoji_id = emojiId;
        }
      } else if (
        tag === 'tg-spoiler' ||
        (tag === 'span' && element.classList.contains('tg-spoiler'))
      ) {
        EntityType = 'spoiler';
      }

      const offset = text.length;

      if (EntityType) {
        entity = { type: EntityType, ...args };
        open_tags.unshift({ tag, entity });
      } else {
        open_tags.unshift({ tag });
      }

      element.childNodes.forEach(walk);

      const open_tag = open_tags.shift();
      if (open_tag && open_tag.entity) {
        const length = text.length - offset;
        if (length > 0) {
          entities.push({
            ...open_tag.entity,
            offset,
            length,
          } as MessageEntity);
        }
      }
    }
  }

  const root = parseHtml(addSurrogate(html));
  walk(root);

  // Sort entities by offset to ensure correct order
  entities.sort((a, b) => a.offset - b.offset);
  text = stripText(text, entities);
  return [delSurrogate(text), entities as TelegramBot.MessageEntity[]];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Converts a text string and a list of message entities into an HTML string.
 * @param text The text string.
 * @param entities The list of message entities.
 * @returns An HTML representation of the text and entities.
 */
export function unparse(
  text: string,
  entities: ReadonlyArray<MessageEntity>
): string {
  if (!text) {
    return '';
  }
  if (!entities || entities.length === 0) {
    return escapeHtml(text);
  }

  const insertions: { index: number; text: string; order: number }[] = [];

  entities.forEach((entity, i) => {
    const { type, offset, length } = entity;

    let startTag: string | null = null;
    let endTag: string | null = null;

    switch (type) {
      case 'bold':
        startTag = '<b>';
        endTag = '</b>';
        break;
      case 'italic':
        startTag = '<i>';
        endTag = '</i>';
        break;
      case 'underline':
        startTag = '<u>';
        endTag = '</u>';
        break;
      case 'strikethrough':
        startTag = '<s>';
        endTag = '</s>';
        break;
      case 'blockquote':
        startTag = '<blockquote>';
        endTag = '</blockquote>';
        break;
      case 'code':
        startTag = '<code>';
        endTag = '</code>';
        break;
      case 'pre':
        startTag = entity.language
          ? `<pre><code class="language-${entity.language}">`
          : '<pre>';
        endTag = entity.language ? '</code></pre>' : '</pre>';
        break;
      case 'email':
        startTag = `<a href="mailto:${text.substring(
          offset,
          offset + length
        )}">`;
        endTag = '</a>';
        break;
      case 'url':
        startTag = `<a href="${text.substring(offset, offset + length)}">`;
        endTag = '</a>';
        break;
      case 'text_link':
        startTag = `<a href="${entity.url}">`;
        endTag = '</a>';
        break;
      case 'custom_emoji':
        startTag = `<tg-emoji emoji-id="${entity.custom_emoji_id}">`;
        endTag = `</tg-emoji>`;
        break;
      case 'spoiler':
        startTag = `<tg-spoiler>`;
        endTag = `</tg-spoiler>`;
        break;
    }

    if (startTag) {
      insertions.push({ index: offset, text: startTag, order: i });
      insertions.push({ index: offset + length, text: endTag!, order: -i });
    }
  });

  insertions.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index;
    return a.order - b.order;
  });

  let result = text;
  let next_escape_bound = result.length;

  while (insertions.length > 0) {
    const insertion = insertions.pop()!;
    const at = insertion.index;
    const what = insertion.text;

    const head = result.substring(0, at);
    const between = escapeHtml(result.substring(at, next_escape_bound));
    const tail = result.substring(next_escape_bound);

    result = head + what + between + tail;
    next_escape_bound = at;
  }

  result =
    escapeHtml(result.substring(0, next_escape_bound)) +
    result.substring(next_escape_bound);

  return result;
}

export const html = { parse, unparse };

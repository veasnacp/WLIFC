import TelegramBot from 'node-telegram-bot-api';
import { addSurrogate, delSurrogate } from './helpers';

function updateEntity<T extends TelegramBot.MessageEntity>(
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
        if (match && match.index === 0) {
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

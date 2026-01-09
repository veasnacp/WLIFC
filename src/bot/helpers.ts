import TelegramBot from 'node-telegram-bot-api';

const { createHash, randomBytes } = process.getBuiltinModule('crypto');
const fs = process.getBuiltinModule('fs');
const path = process.getBuiltinModule('path');

export const log = {
  getLogger: (name: string) => ({
    debug: (...args: any[]) => console.debug(`[${name}]`, ...args),
    info: (...args: any[]) => console.info(`[${name}]`, ...args),
    warn: (...args: any[]) => console.warn(`[${name}]`, ...args),
    error: (...args: any[]) => console.error(`[${name}]`, ...args),
    exception: (...args: any[]) => console.error(`[${name}]`, ...args),
  }),
};

export function generateRandomLong(signed = true): BigInt {
  const buf = Buffer.from(randomBytes(8));
  if (signed) {
    return buf.readBigInt64LE();
  } else {
    return buf.readBigUInt64LE();
  }
}

export function ensureParentDirExists(filePath: string): void {
  const parent = path.dirname(filePath);
  if (parent) {
    fs.mkdirSync(parent, { recursive: true });
  }
}

export function addSurrogate(text: string): string {
  return Array.from(text)
    .map((x) => {
      const code = x.charCodeAt(0);
      if (code >= 0x10000 && code <= 0x10ffff) {
        const high = Math.floor((code - 0x10000) / 0x400) + 0xd800;
        const low = ((code - 0x10000) % 0x400) + 0xdc00;
        return String.fromCharCode(high, low);
      }
      return x;
    })
    .join('');
}

export function delSurrogate(text: string): string {
  return Buffer.from(text, 'utf16le').toString('utf16le');
}

export function withinSurrogate(
  text: string,
  index: number,
  length?: number
): boolean {
  if (length === undefined) {
    length = text.length;
  }

  return (
    index > 1 &&
    index < length &&
    text.charCodeAt(index - 1) >= 0xd800 &&
    text.charCodeAt(index - 1) <= 0xdbff &&
    text.charCodeAt(index) >= 0xdc00 &&
    text.charCodeAt(index) <= 0xdfff
  );
}

export function stripText(
  text: string,
  entities: TelegramBot.MessageEntity[]
): string {
  if (!entities) {
    return text.trim();
  }

  const lenOri = text.length;
  text = text.trimStart();
  const leftOffset = lenOri - text.length;
  text = text.trimEnd();
  const lenFinal = text.length;

  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i];
    if (e.length === 0) {
      entities.splice(i, 1);
      continue;
    }

    if (e.offset + e.length > leftOffset) {
      if (e.offset >= leftOffset) {
        e.offset -= leftOffset;
      } else {
        e.length = e.offset + e.length - leftOffset;
        e.offset = 0;
      }
    } else {
      entities.splice(i, 1);
      continue;
    }

    if (e.offset + e.length > lenFinal) {
      if (e.offset >= lenFinal) {
        entities.splice(i, 1);
      } else {
        e.length = lenFinal - e.offset;
      }
    }
  }

  return text;
}

export async function maybeAwait<T>(value: T | Promise<T>): Promise<T> {
  if (value instanceof Promise) {
    return await value;
  } else {
    return value;
  }
}

export function generateKeyDataFromNonce(
  serverNonce: bigint,
  newNonce: bigint
): [Buffer, Buffer] {
  const serverNonceBytes = Buffer.alloc(16);
  serverNonceBytes.writeBigInt64LE(serverNonce);

  const newNonceBytes = Buffer.alloc(32);
  newNonceBytes.writeBigInt64LE(newNonce);

  const hash1 = createHash('sha1')
    .update(Buffer.concat([newNonceBytes, serverNonceBytes]))
    .digest();
  const hash2 = createHash('sha1')
    .update(Buffer.concat([serverNonceBytes, newNonceBytes]))
    .digest();
  const hash3 = createHash('sha1')
    .update(Buffer.concat([newNonceBytes, newNonceBytes]))
    .digest();

  const key = Buffer.concat([hash1, hash2.slice(0, 12)]);
  const iv = Buffer.concat([
    hash2.slice(12, 20),
    hash3,
    newNonceBytes.slice(0, 4),
  ]);
  return [key, iv];
}

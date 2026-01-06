export function isObject(obj: unknown): obj is object {
  return (
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    obj !== null &&
    obj !== undefined
  );
}

export function isArray<T>(array: T) {
  return (
    typeof array === 'object' &&
    Array.isArray(array) &&
    array !== null &&
    array !== undefined
  );
}

export function removeUndefined<T extends any = any>(obj: T) {
  return Object.fromEntries(
    Object.entries(obj as any).filter(([, value]) => value !== undefined)
  ) as T;
}

export function isNumber(n: unknown) {
  if (typeof n === 'number' || typeof n === 'string')
    return !isNaN(parseFloat(n as string)) && isFinite(n as number);
  return false;
}

export function toCapitalized(words: string) {
  return words.replace(/(^\w{1})|(\s+\w{1})/g, (letter) =>
    letter.toUpperCase()
  );
}

export function sleep(delayInSecond: number) {
  return new Promise((resolve) => setTimeout(resolve, delayInSecond * 1000));
}

export function removeDuplicateObjArray<T extends unknown = any>(
  arr: T[],
  key: keyof T
) {
  return [...new Map(arr.map((item) => [item[key], item])).values()];
}

export function removeDuplicateArray<T>(arr: Array<T>) {
  return [...new Set(arr)];
}

export function validJson<T extends object = any>(
  value?: unknown,
  defaultValue = {} as T
): T {
  defaultValue = defaultValue || ({} as T);
  if (typeof value === 'string') {
    try {
      const handleJsonString = value
        .replace(/(\t|\n|\r|\  )/g, '')
        .replace(/\": "/g, '":"')
        .replace(/\,}/g, '}')
        .replace(/\,]/g, ']');
      const obj = JSON.parse(handleJsonString);
      if (typeof obj === 'object' && obj !== null && obj !== undefined) {
        return obj;
      } else {
        return defaultValue;
      }
    } catch (e) {}
  }
  return defaultValue;
}

export function stringify(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Splits an array into smaller chunks of a specified size.
 * Useful for adhering to API limits like Telegram's 10-item limit for sendMediaGroup.
 *
 * @template T The type of elements in the array.
 * @param {T[]} array The array to chunk.
 * @param {number} chunkSize The maximum size of each chunk.
 * @returns {T[][]} An array of arrays (chunks).
 */
export const chunkArray = <T>(array: T[], chunkSize: number): T[][] => {
  const result: T[][] = [];

  for (let i = 0; i < array.length; i += chunkSize) {
    // The slice method extracts up to 'chunkSize' elements starting from 'i'
    const chunk = array.slice(i, i + chunkSize);
    result.push(chunk);
  }

  return result;
};

/**
 * Splits a long string into chunks of a specified size.
 * Tries to split at newlines or spaces to avoid cutting words.
 */
export function splitText(text: string, limit = 4000) {
  const chunks = [];
  let str = text;

  while (str.length > limit) {
    // 1. Look for the last newline before the limit
    let splitIndex = str.lastIndexOf('\n', limit);

    // 2. If no newline, look for the last space
    if (splitIndex === -1) splitIndex = str.lastIndexOf(' ', limit);

    // 3. If no space (one giant word), force a hard cut
    if (splitIndex === -1) splitIndex = limit;

    chunks.push(str.substring(0, splitIndex).trim());
    str = str.substring(splitIndex).trim();
  }

  if (str.length > 0) chunks.push(str);
  return chunks;
}

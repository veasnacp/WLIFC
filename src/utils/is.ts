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

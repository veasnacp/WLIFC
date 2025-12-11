export function isNumber(n: unknown) {
  if (typeof n === 'number' || typeof n === 'string')
    return !isNaN(parseFloat(n as string)) && isFinite(n as number);
  return false;
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
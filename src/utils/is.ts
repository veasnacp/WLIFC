export function isNumber(n: unknown) {
  if (typeof n === 'number' || typeof n === 'string')
    return !isNaN(parseFloat(n as string)) && isFinite(n as number);
  return false;
}

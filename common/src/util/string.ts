export function removeEmojis(str: string) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[^\x00-\x7F]/g, '').trim()
}
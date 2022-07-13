export default function getManalinkUrl(slug: string) {
  return `${location.protocol}//${location.host}/link/${slug}`
}

export default function getLinkUrl(slug: string) {
  return `${location.protocol}//${location.host}/link/${slug}`
}

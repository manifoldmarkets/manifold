import { capitalize } from 'lodash'

export default function stringOrStringArrayToText(fields: {
  text: string[] | string
  preText?: string
  postText?: string
  asSentence?: boolean
  capitalizeFirstLetterOption?: boolean
}): string | null {
  const {
    text,
    preText = '',
    postText = '',
    asSentence,
    capitalizeFirstLetterOption,
  } = fields

  if (!text || text.length < 1) {
    return null
  }

  const formatText = capitalizeFirstLetterOption
    ? capitalize
    : (text: string) => text

  if (Array.isArray(text)) {
    let formattedText = ''

    if (asSentence) {
      formattedText =
        text.slice(0, -1).map(formatText).join(', ') +
        (text.length > 1 ? ' and ' : '') +
        formatText(text[text.length - 1])
    } else {
      formattedText = text.map(formatText).join(' • ')
    }

    return `${preText} ${formattedText} ${postText}`.trim()
  }

  return `${preText} ${formatText(text)} ${postText}`.trim()
}

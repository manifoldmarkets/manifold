import { capitalize } from 'lodash'

export default function stringOrStringArrayToText(fields: {
  text: string[] | string
  preText?: string
  postText?: string
  asSentence?: boolean
  capitalizeFirstLetterOption?: boolean
}): string {
  const { text, preText, postText, asSentence, capitalizeFirstLetterOption } =
    fields
  if (Array.isArray(text)) {
    let formattedText = ''

    const formatText = capitalizeFirstLetterOption
      ? capitalize
      : (text: string) => text

    if (asSentence) {
      formattedText = text
        .map((item, index, array) =>
          index === array.length - 1 && array.length > 1
            ? `and ${formatText(item)}`
            : formatText(item)
        )
        .join(', ')
    } else {
      formattedText = text.map(formatText).join(' • ')
    }

    return `${preText ?? ''} ${formattedText} ${postText ?? ''}`.trim()
  }

  return `${preText ?? ''} ${
    capitalizeFirstLetterOption ? capitalize(text) : text
  } ${postText ?? ''}`.trim()
}

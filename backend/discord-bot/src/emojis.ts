import { GuildEmoji, MessageReaction } from 'discord.js'

type emojiDetails = {
  outcome: 'YES' | 'NO'
  amount: number
}

// Custom emojis use id, not name
const bettingEmojis: { [key: string]: emojiDetails } = {
  '1085251697930158170': { outcome: 'YES', amount: 5 },
  '1085271643112357899': { outcome: 'YES', amount: 10 },
  '1085251716150198333': { outcome: 'YES', amount: 25 },
  '1085253198496931901': { outcome: 'NO', amount: 5 },
  '1085271640272797776': { outcome: 'NO', amount: 10 },
  '1085253196236202116': { outcome: 'NO', amount: 25 },
}

const oldBettingEmojis: { [key: string]: emojiDetails } = {
  '1083425137480712213': { outcome: 'YES', amount: 5 },
  '1075904553758756914': { outcome: 'YES', amount: 10 },
  '1083425136570544228': { outcome: 'YES', amount: 25 },
  '1085251715156164731': { outcome: 'YES', amount: 50 },
  '1083425138961285201': { outcome: 'NO', amount: 5 },
  '1075904582909165720': { outcome: 'NO', amount: 10 },
  '1083425134943158334': { outcome: 'NO', amount: 25 },
  '1085253194512339067': { outcome: 'NO', amount: 50 },
}
// Handled emojis used to contain non-betting emojis, but now it's just betting emojis
const handledEmojis = Object.keys(bettingEmojis).concat(
  Object.keys(oldBettingEmojis)
)

// Custom emojis are emojis that aren't standard emojis, so we have to cache them
export const customEmojis = Object.keys(bettingEmojis).concat(
  Object.keys(oldBettingEmojis)
)
export const customEmojiCache: { [key: string]: GuildEmoji } = {}

const getEmojiFromCache = (emojiKey: string) => {
  if (customEmojis.includes(emojiKey)) {
    return customEmojiCache[emojiKey]
  } else return emojiKey
}

export const emojis = Object.keys(bettingEmojis)

export const getBetInfoFromReaction = (reaction: MessageReaction) => {
  const emojiKey = getAnyHandledEmojiKey(reaction)
  if (!emojiKey) return {}
  const { amount, outcome } =
    bettingEmojis[emojiKey] ?? oldBettingEmojis[emojiKey] ?? {}
  return { amount, outcome }
}

export const getAnyHandledEmojiKey = (reaction: MessageReaction) => {
  const emojiKey = customEmojis.includes(reaction.emoji.id ?? '_')
    ? reaction.emoji.id
    : reaction.emoji.name
  if (!emojiKey || !handledEmojis.includes(emojiKey)) return
  return emojiKey
}

export const getBettingEmojisAsStrings = () => {
  let yesBetsEmojis = ''
  let noBetsEmojis = ''
  for (const emoji in bettingEmojis) {
    const emojiText = `${getEmojiFromCache(emoji)}`
    bettingEmojis[emoji].outcome === 'YES'
      ? (yesBetsEmojis += emojiText)
      : (noBetsEmojis += emojiText)
  }
  return { yesBetsEmojis, noBetsEmojis }
}

import { GuildEmoji, MessageReaction } from 'discord.js'

type emojiDetails = {
  outcome: 'YES' | 'NO'
  amount: number
}

// Custom emojis use id, not name
export const bettingEmojis: { [key: string]: emojiDetails } = {
  '1083425137480712213': { outcome: 'YES', amount: 5 },
  '1075904553758756914': { outcome: 'YES', amount: 10 },
  '1083425136570544228': { outcome: 'YES', amount: 25 },
  '1083425138961285201': { outcome: 'NO', amount: 5 },
  '1075904582909165720': { outcome: 'NO', amount: 10 },
  '1083425134943158334': { outcome: 'NO', amount: 25 },
}
export const customEmojis = Object.keys(bettingEmojis)
export const customEmojiCache: { [key: string]: GuildEmoji } = {}

export const getEmoji = (emojiKey: string) => {
  if (customEmojis.includes(emojiKey)) {
    return customEmojiCache[emojiKey]
  } else return emojiKey
}

export const emojis = Object.keys(bettingEmojis)

export const getBetEmojiKey = (reaction: MessageReaction) => {
  const emojiKey = customEmojis.includes(reaction.emoji.id ?? '_')
    ? reaction.emoji.id
    : reaction.emoji.name
  if (!emojiKey || !Object.keys(bettingEmojis).includes(emojiKey)) return
  return emojiKey
}

export const getAnyHandledEmojiKey = (reaction: MessageReaction) => {
  const emojiKey = customEmojis.includes(reaction.emoji.id ?? '_')
    ? reaction.emoji.id
    : reaction.emoji.name
  if (!emojiKey || !Object.keys(bettingEmojis).includes(emojiKey)) return
  return emojiKey
}

export const getBettingEmojisAsStrings = () => {
  let yesBetsEmojis = ''
  let noBetsEmojis = ''
  for (const emoji in bettingEmojis) {
    const emojiText = `${getEmoji(emoji)}`
    bettingEmojis[emoji].outcome === 'YES'
      ? (yesBetsEmojis += emojiText)
      : (noBetsEmojis += emojiText)
  }
  return { yesBetsEmojis, noBetsEmojis }
}

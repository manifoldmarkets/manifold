import { Guild } from 'discord.js'

type emojiDetails = {
  outcome: 'YES' | 'NO'
  amount: number
}

// Custom emojis use id, not name
export const bettingEmojis: { [key: string]: emojiDetails } = {
  '👍': { outcome: 'YES', amount: 10 },
  '1029761176336334918': { outcome: 'YES', amount: 100 }, // green 100
  '👎': { outcome: 'NO', amount: 10 },
  '💯': { outcome: 'NO', amount: 100 },
}

export const customEmojis = ['1029761176336334918']

export const otherEmojis: { [key: string]: string } = {
  '❓': 'What is this?',
  ℹ️: 'Get the market details sent to you',
}

export const getEmoji = (guild: Guild | null, emojiKey: string) => {
  if (customEmojis.includes(emojiKey) && guild) {
    // TODO: this only works on my guild rn
    return guild.emojis.cache.find((e) => e.id === emojiKey)
  } else return emojiKey
}

export const emojis = Object.keys(bettingEmojis).concat(
  Object.keys(otherEmojis)
)

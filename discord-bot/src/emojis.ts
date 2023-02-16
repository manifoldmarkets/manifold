import { Guild } from 'discord.js'

type emojiDetails = {
  outcome: 'YES' | 'NO'
  amount: number
}

// Custom emojis use id, not name
export const bettingEmojis: { [key: string]: emojiDetails } = {
  '1075904553758756914': { outcome: 'YES', amount: 10 },
  '1075828981720416296': { outcome: 'YES', amount: 50 },
  '1029761176336334918': { outcome: 'YES', amount: 100 },
  '1075904582909165720': { outcome: 'NO', amount: 10 },
  '1075829025093722146': { outcome: 'NO', amount: 50 },
  '💯': { outcome: 'NO', amount: 100 },
}

export const customEmojis = [
  '1075828981720416296',
  '1029761176336334918',
  '1075829025093722146',
  '1075904582909165720',
  '1075904553758756914',
]

export const otherEmojis: { [key: string]: string } = {
  ℹ️: 'Get the market details sent to you',
  '❓': 'What is this?',
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

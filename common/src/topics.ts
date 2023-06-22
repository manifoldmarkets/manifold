export const TOPICS_TO_SUBTOPICS: { [key: string]: string[] } = {
  '🗳️ Politics': ['🇺🇸 US Politics', '🟠 Trump'],
  '💻 Technology': [
    '🤖 AI',
    '🪙 Crypto',
    '🪸 Climate',
    '🧬 Biotech',
    '💻 Programming',
    '🔬 Science',
    '🧮 Math',
    '☢️ Nuclear',
    '🚀 Space',
  ],

  '🏟️ Sports': [
    '🏀 Basketball',
    '⚽ Soccer',
    '♟️ Chess',
    '🏎️ Racing',
    '🏅 Sports',
  ],

  '🍿 Media': [
    '📺 TV Shows',
    '🎮 Gaming',
    '🎵 Music',
    '📚 Books',
    '🌐 Internet Culture',
    '👥 Celebrities',
  ],
  '💼 Business': [
    '🪙 Crypto',
    '💵 Finance',
    '💰 Economics',
    '🚀 Startups',
    '🚘 Elon Musk',
  ],

  '🪂 Lifestyle': ['🏳️‍🌈 LGBTQIA+', '⛪ Religion', '💪 Personal Development'],

  '🌍 World': [
    '🇷🇺🇺🇦 Russia & Ukraine',
    '🇨🇳 China',
    '🇮🇳 India',
    '🌏 Asia',
    '🌍 Europe',
    '🌎 Latin America',
    '🌍 Middle East',
  ],

  '👥 Communities': ['💗 Effective Altruism', '🎮 Destiny.gg'],
}

const GROUP_IDs: { [key: string]: string } = {
  'CGP Grey': 'yXIziLaaVxHFOPG1aMrJ',
  'Effective Altruism': 'znYsWa9eZRkBvSHwmaNz',
  'Destiny.gg': 'W2ES30fRo6CCbPNwMTTj',
  'Wall Street Bets': '8Gu77XZbp4YnYEhLkOKm',
  Proofniks: 'HWg8Z5SraHRjoEjHCcIJ',
  ACX: 'UCM2uiHxr7Rftaa1KB29',
}

export const cleanTopic = (topic: string) =>
  topic
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/g, '')
    .trim()

export const getEmojiFromTopic = (topic: string) => {
  const textWithEmoji = Object.values(TOPICS_TO_SUBTOPICS)
    .flat()
    .find((t) => t.includes(topic))
  return textWithEmoji ? textWithEmoji.split(' ')[0] : ''
}

export const getSubtopics = (topic: string) =>
  TOPICS_TO_SUBTOPICS[topic].map(
    (subtopicWithEmoji) =>
      [
        subtopicWithEmoji,
        cleanTopic(subtopicWithEmoji),
        GROUP_IDs[cleanTopic(subtopicWithEmoji)],
      ] as const
  )
export const ALL_TOPICS = Object.keys(TOPICS_TO_SUBTOPICS)
  .map((topic) => getSubtopics(topic).map(([_, subtopic]) => subtopic))
  .flat()
export const ALL_TOPICS_WITH_EMOJIS = Object.keys(TOPICS_TO_SUBTOPICS)
  .map((topic) => getSubtopics(topic).map(([subtopic]) => subtopic))
  .flat()

export const TOPICS_TO_SUBTOPICS: { [key: string]: string[] } = {
  '🗳️ Politics': ['🇺🇸 US Politics', '🟠 Trump'],

  '💻 Technology': [
    '🤖 AI',
    '🪙 Crypto',
    '🚀 Space',
    '🪸 Climate',
    '☢️ Nuclear',
    '🧬 Biotech',
    '💻 Programming',
    '🔬 Science',
    '🧮 Math',
  ],

  '💼 Business': ['💵 Finance', '💰 Economics', '🚀 Startups', '🚘 Elon Musk'],

  '🏟️ Sports': [
    '🏈 NFL',
    '🏀 Basketball',
    '⚽ Soccer',
    '♟️ Chess',
    '🏎️ Racing',
    '🏅 Sports',
  ],

  '🍿 Media': [
    '🍿 Movies',
    '🎮 Gaming',
    '📺 TV Shows',
    '🎵 Music',
    '🌐 Internet Culture',
  ],

  '🌍 World': [
    '🇷🇺🇺🇦 Russia & Ukraine',
    '🇨🇳 China',
    '🇮🇳 India',
    // '🌏 Asia',
    '🇪🇺 Europe',
    // '🌎 Latin America',
    // '🌍 Middle East',
    // '🌍 Africa',
  ],

  '🪂 Lifestyle': ['🏳️‍🌈 LGBTQIA+', '❤️‍🔥 Sex and love', '💪 Personal Development'],

  '👥 Communities': ['💗 Effective Altruism', '🎮 Destiny.gg'],
}

export const SELECTABLE_TOPICS = [
  '🗳️ Politics',
  '💻 Technology',
  '🏟️ Sports',
  '💰 Economics',
  '🍿 Movies',
  '🇷🇺🇺🇦 Russia & Ukraine',
  '🇨🇳 China',
  '🪙 Crypto',
  '🎮 Gaming',
  '🚀 Space',
]

const COMMUNITY_TO_GROUP_ID: { [key: string]: string } = {
  'CGP Grey': 'yXIziLaaVxHFOPG1aMrJ',
  'Effective Altruism': 'znYsWa9eZRkBvSHwmaNz',
  'Destiny.gg': 'W2ES30fRo6CCbPNwMTTj',
  'Wall Street Bets': '8Gu77XZbp4YnYEhLkOKm',
  Proofniks: 'HWg8Z5SraHRjoEjHCcIJ',
  ACX: 'UCM2uiHxr7Rftaa1KB29',
}

export const TOPICS_TO_GROUP_ID: { [key: string]: string } = {
  'US Politics': 'AjxQR8JMpNyDqtiqoA96',
  Trump: 'cEzcLXuitr6o4VPI01Q1',
  AI: 'yEWvvwFFIqzf8JklMewp',
  Crypto: 'YuJw0M1xvUHrpiRRuKso',
  Space: 'SmJk6RHToaLxLk0I1ZSC',
  Climate: '97oNExy8iFftY2EgdkLw',
  Nuclear: '27a193db-f997-4533-86a6-386d9a915045',
  Biotech: 'zx0Pik5lD4jydGPxbLjB',
  Programming: 'PZJMbrLekgJBy7OOBKGT',
  Science: 'XMhZ5LbQoLMZiOpQJRnj',
  Math: 'S1tbcVt1t5Bd9O5mVCx1',
  Finance: 'CgB83AAMkkOHSrTnzani',
  Economics: 'p88Ycq6yFd5ECKqq9PFO',
  Startups: '19c319ca-033c-474f-b417-5f07efe88ec0',
  'Elon Musk': '9OR5MrEu1F01FhmBRcre',
  NFL: 'TNQwmbE5p6dnKx2e6Qlp',
  Basketball: 'NjkFkdkvRvBHoeMDQ5NB',
  Soccer: 'ypd6vR44ZzJyN9xykx6e',
  Chess: 'ED7Cu6lVPshJkZ7FYePW',
  Sports: '2hGlgVhIyvVaFyQAREPi',
  Movies: 'KSeNIu7AWgiBBM5FqVuB',
  Gaming: '5FaFmmaNNFTSA5r0vTAi',
  'TV Shows': '8isZHbaQMsoFz30XuZTo',
  Music: 'Xuc2UY8gGfjQqFXwxq5d',
  'Russia & Ukraine': 'OxcXOuxXvwsXtC0Dx5sr',
  China: 'oWTzfoeemQGkSoPFn2T7',
  India: 'Y2J00UcVhr3wKq2lAOAy',
  Europe: 'ue52QI4BQgJgAJJNjLHr',
  'LGBTQIA+': 'cLtLfm3NSrhXU6lV6Cuy',
  'Sex and love': '3syjPCC7PxE5KurTiTT3',
  'Personal Development': 'izQp87CKagOVJp9Olm1p',
  Brazil: 'ZQt0sCK1Hxn0HVJhH108',
}
export const cleanTopic = (topic: string) =>
  topic
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/g, '')
    .trim()

export const getSubtopics = (topic: string) =>
  TOPICS_TO_SUBTOPICS[topic].map(
    (subtopicWithEmoji) =>
      [
        subtopicWithEmoji,
        cleanTopic(subtopicWithEmoji),
        TOPICS_TO_GROUP_ID[cleanTopic(subtopicWithEmoji)] ??
          COMMUNITY_TO_GROUP_ID[cleanTopic(topic)],
      ] as const
  )
export const ALL_TOPICS = Object.keys(TOPICS_TO_SUBTOPICS)
  .map((topic) => getSubtopics(topic).map(([_, subtopic]) => subtopic))
  .flat()

export const ALL_TOPICS_WITH_EMOJIS = Object.keys(TOPICS_TO_SUBTOPICS)
  .map((topic) => getSubtopics(topic).map(([subtopic]) => subtopic))
  .flat()

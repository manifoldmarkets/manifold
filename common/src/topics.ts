export const TOPICS_TO_SUBTOPICS: { [key: string]: string[] } = {
  '🗳️ Politics': ['🟠 Trump', '🇺🇸 US Politics', '🇬🇧 UK Politics'],

  '💻 Technology': [
    '💻 Technology',
    '🤖 AI',
    '🪙 Crypto',
    '🚀 Space',
    '🪸 Climate',
    '☢️ Nuclear',
    '🧬 Biotech',
    '☤ Health',
    '👨‍💻 Programming',
    '🔬 Science',
    '🧮 Math',
  ],

  '💼 Business': [
    '💵 Finance',
    '💰 Economics',
    '📈 Stocks',
    '🪙 Crypto',
    '🚀 Startups',
    '🚘 Elon Musk',
  ],

  '🏟️ Sports': [
    '🏅 Sports',
    '🏈 NFL',
    '🏀 Basketball',
    '⚽ Soccer',
    '♟️ Chess',
    '🏎️ F1',
    '🎾 Tennis',
  ],

  '🍿 Media': [
    '🍿 Movies',
    '🎮 Gaming',
    '📺 TV Shows',
    '🎵 Music',
    '💅 Celebrities',
  ],

  '🌍 World': [
    '🇷🇺 Russia',
    '🇨🇳 China',
    '🇮🇳 India',
    '🇪🇺 Europe',
    '🇷🇺🇺🇦 Russia & Ukraine',
    '🌎 Latin America',
    '🌍 Middle East',
    '🌍 Africa',
  ],

  '🪂 Lifestyle': ['💪 Personal Development', '❤️‍🔥 Sex and love', '🏳️‍🌈 LGBTQIA+'],
}

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
  'UK Politics': 'aavkiDd6uZggfL3geuV2',
  Trump: 'cEzcLXuitr6o4VPI01Q1',
  AI: 'yEWvvwFFIqzf8JklMewp',
  Crypto: 'YuJw0M1xvUHrpiRRuKso',
  Space: 'SmJk6RHToaLxLk0I1ZSC',
  Climate: '97oNExy8iFftY2EgdkLw',
  F1: 'ZdXq6X0Q8kZtA0Iyty7Q',
  Nuclear: '27a193db-f997-4533-86a6-386d9a915045',
  Biotech: 'zx0Pik5lD4jydGPxbLjB',
  Health: 'JpUqUqRn9sSWxrk0Sq35',
  Programming: 'PZJMbrLekgJBy7OOBKGT',
  Celebrities: '4QIcUOfCSSha0JZHAg9X',
  Science: 'XMhZ5LbQoLMZiOpQJRnj',
  Math: 'S1tbcVt1t5Bd9O5mVCx1',
  Finance: 'CgB83AAMkkOHSrTnzani',
  Economics: 'p88Ycq6yFd5ECKqq9PFO',
  Technology: 'IlzY3moWwOcpsVZXCVej',
  Startups: '19c319ca-033c-474f-b417-5f07efe88ec0',
  Stocks: 'QDQfgsFiQrNNlZhsRGf5',
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
  Russia: 'TIpf6j0hLpifpXN93FxE',
  Africa: 'dFsZaGwyohGDVkJi1C3E',
  Europe: 'ue52QI4BQgJgAJJNjLHr',
  'Latin America': 'DX94A1LQmpckcVdz5Hb3',
  'Middle East': 'xg8wCPeM9JP6gD0igBrA',
  'LGBTQIA+': 'cLtLfm3NSrhXU6lV6Cuy',
  'Sex and love': '3syjPCC7PxE5KurTiTT3',
  'Personal Development': 'izQp87CKagOVJp9Olm1p',
  Brazil: 'ZQt0sCK1Hxn0HVJhH108',
  Tennis: '1mvN9vIVIopcWiAsXhzp',
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

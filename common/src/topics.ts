import {
  HIDE_FROM_NEW_USER_SLUGS,
  PROD_MANIFOLD_LOVE_GROUP_SLUG,
} from 'common/envs/constants'

type TopicInfo = { name: string; groupIds: string[] }

export const TOPICS_TO_SUBTOPICS: { [key: string]: TopicInfo[] } = {
  '🗳️ Politics': [
    { name: '🇺🇸 US Politics', groupIds: ['AjxQR8JMpNyDqtiqoA96'] },
    { name: '🇬🇧 UK Politics', groupIds: ['aavkiDd6uZggfL3geuV2'] },
    {
      name: '🌍 Geopolitics',
      groupIds: ['2wNGnksxJzypXZtiTLNL'],
    },
  ],
  '💻 Technology & Science': [
    {
      name: '💻 Technology & Science',
      groupIds: [
        'IlzY3moWwOcpsVZXCVej', // Technology,
        'yEWvvwFFIqzf8JklMewp', // AI
        'SmJk6RHToaLxLk0I1ZSC', // Space
        '97oNExy8iFftY2EgdkLw', // Climate
        '27a193db-f997-4533-86a6-386d9a915045', // Nuclear
        'zx0Pik5lD4jydGPxbLjB', // Biotech
        'JpUqUqRn9sSWxrk0Sq35', // Health
        'XMhZ5LbQoLMZiOpQJRnj', // Science
        '49148d79-ce4e-4856-962c-3f90256abeab', // Engineering
        'rraS2YIDaAckq3bR5lfQ', // Energy
      ],
    },
    {
      name: '👨‍💻 Programming',
      groupIds: [
        // Programming, Software, Math
        'PZJMbrLekgJBy7OOBKGT',
        'GWdXBr6Y3UmboIMUxv6w',
        'S1tbcVt1t5Bd9O5mVCx1',
      ],
    },
  ],
  '💼 Business & Finance': [
    {
      // Finance and startups
      name: '💵 Finance',
      groupIds: [
        'CgB83AAMkkOHSrTnzani',
        '19c319ca-033c-474f-b417-5f07efe88ec0',
      ],
    },
    { name: '💰 Economics', groupIds: ['p88Ycq6yFd5ECKqq9PFO'] },
    {
      name: '📈 Stocks',
      groupIds: ['QDQfgsFiQrNNlZhsRGf5'],
    },
    { name: '🪙 Crypto', groupIds: ['YuJw0M1xvUHrpiRRuKso'] },
  ],
  '🏟️ Sports': [
    { name: '🏈 NFL', groupIds: ['TNQwmbE5p6dnKx2e6Qlp'] },
    { name: '🏈 College Football', groupIds: ['ky1VPTuxrLXMnHyajZFp'] },
    { name: '🏀 Basketball', groupIds: ['NjkFkdkvRvBHoeMDQ5NB'] },
    { name: '⚽ Soccer', groupIds: ['ypd6vR44ZzJyN9xykx6e'] },
    { name: '♟️ Chess', groupIds: ['ED7Cu6lVPshJkZ7FYePW'] },
    { name: '🏎️ F1', groupIds: ['ZdXq6X0Q8kZtA0Iyty7Q'] },
    { name: '🎾 Tennis', groupIds: ['1mvN9vIVIopcWiAsXhzp'] },
    { name: '🚲 Cycling', groupIds: ['2yisxJryUq9V5sG7P6Gy'] },
    { name: '⚾ Baseball', groupIds: ['786nRQzgVyUnuUtaLTGW'] },
    { name: '🏏 Cricket', groupIds: ['LcPYoqxSRdeQMms4lR3g'] },
  ],
  '🍿 Media & Culture': [
    // Movies, TV Shows, Music, Celebrities, Culture
    {
      name: '🍿 Media & Culture',
      groupIds: [
        'KSeNIu7AWgiBBM5FqVuB',
        '8isZHbaQMsoFz30XuZTo',
        'Xuc2UY8gGfjQqFXwxq5d',
        '4QIcUOfCSSha0JZHAg9X',
        'eJZecx6r22G2NriYYXcC',
        'EUSEngFk1dGGBfaMeAmh',
      ],
    },
    { name: '🎮 Gaming', groupIds: ['5FaFmmaNNFTSA5r0vTAi'] },
    {
      name: '🎮️ Destiny.gg',
      groupIds: ['W2ES30fRo6CCbPNwMTTj'],
    },
    {
      name: '🏴‍☠️ One Piece',
      groupIds: ['uJSql24HUqpEpVU0FrjI'],
    },
  ],
  '🌍 Global': [
    // Europe, China, India, Russia, Latam, Middle East, Africa, Asia
    {
      name: '🌍 World',
      groupIds: [
        'ue52QI4BQgJgAJJNjLHr',
        'oWTzfoeemQGkSoPFn2T7',
        'Y2J00UcVhr3wKq2lAOAy',
        'xg8wCPeM9JP6gD0igBrA',
        'dFsZaGwyohGDVkJi1C3E',
        '5mzNYaPKc4qXC5J0npKe',
        'bPTxMZhUYsIUXsWT969d',
        'DX94A1LQmpckcVdz5Hb3',
      ],
    },
    {
      name: '🇮🇱🇵🇸 Israel & Hamas',
      groupIds: ['cea99c1c-afb9-49b2-adfa-9be739adce10'],
    },
    { name: '🇷🇺🇺🇦 Russia & Ukraine', groupIds: ['OxcXOuxXvwsXtC0Dx5sr'] },
  ],
  '🪂 NSFW': [{ name: '❤️‍🔥 Sex and love', groupIds: ['3syjPCC7PxE5KurTiTT3'] }],
}

export const TOPIC_NAMES_TO_HIDE_FROM_WELCOME_FLOW = [
  '👴 Trump',
  '👴🏼 Joe Biden',
  '🍿 Entertainment and Pop Culture',
  'Bitcoin maxi',
  'Bitcoin',
  '2024',
  'CoolFold',
  '🏟️ Sports',
  '💪 Personal Goals',
  '🌐 Internet',
  '⚽ 🏈 Football',
]

export const GROUP_SLUGS_TO_HIDE_FROM_WELCOME_FLOW = [
  'magaland',
  'world-default',
  'shortterm-markets',
  'global-macro',
  'video-games',
  'politics-default', // should follow US Politics instead
  '2024-us-presidential-election', // same
  'elon-musk-14d9d9498c7e',
  'crypto-prices', // same as crypto,
  'technical-ai-timelines', // same as ai
  PROD_MANIFOLD_LOVE_GROUP_SLUG,
  'donald-trump-adb8f1bbf890',
  ...HIDE_FROM_NEW_USER_SLUGS,
]

export const SLUGS_TO_EXCLUDE_FROM_NEW_USER_HOME_SECTION = [
  'death-markets',
  'rationalussy',
  'personal',
  'manifold-6748e065087e',
  'manifold-features-25bad7c7792e',
  'manifold-drama',
  'personal-goals',
]

export const removeEmojis = (input: string) =>
  // eslint-disable-next-line no-control-regex
  input.replace(/[^\x00-\x7F]/g, '').trim()

export const getSubtopics = (topic: string) =>
  TOPICS_TO_SUBTOPICS[topic].map(
    (subtopic) =>
      [subtopic.name, removeEmojis(subtopic.name), subtopic.groupIds] as const
  )
export const ALL_TOPICS = Object.keys(TOPICS_TO_SUBTOPICS)
  .map((topic) => getSubtopics(topic).map(([_, subtopic]) => subtopic))
  .flat()

import {
  HIDE_FROM_NEW_USER_SLUGS,
  PROD_MANIFOLD_LOVE_GROUP_SLUG,
} from 'common/envs/constants'
import { removeEmojis } from './util/string'

type TopicInfo = { name: string; groupIds: string[] }

export const TOPICS_TO_SUBTOPICS: { [key: string]: TopicInfo[] } = {
  '🗳️ Politics': [
    {
      // US Politics, 2024 US Presidential Election
      name: '🇺🇸 USA',
      groupIds: ['AjxQR8JMpNyDqtiqoA96', 'rr3rBJMwh9PW8hwrgR4J'],
    },
    { name: '🇨🇳 China', groupIds: ['oWTzfoeemQGkSoPFn2T7'] },
    {
      // Ukraine-Russia War, Russia, Ukraine
      name: '🇷🇺🇺🇦 Russia & Ukraine',
      groupIds: [
        'OxcXOuxXvwsXtC0Dx5sr',
        'TIpf6j0hLpifpXN93FxE',
        '0AKCBNjWsHwpfmPOsGf6',
      ],
    },
    {
      name: '🇮🇱🇵🇸 Israel & Hamas',
      groupIds: [
        'cea99c1c-afb9-49b2-adfa-9be739adce10',
        'ECjphikMbmosJsDAAJoU', // Israel
      ],
    },
    { name: '🇬🇧 UK', groupIds: ['aavkiDd6uZggfL3geuV2'] },
    { name: '🇪🇺 Europe', groupIds: ['ue52QI4BQgJgAJJNjLHr'] },
    { name: '🇮🇳 India', groupIds: ['Y2J00UcVhr3wKq2lAOAy'] },
    { name: '🌎 LatAm', groupIds: ['DX94A1LQmpckcVdz5Hb3'] },
    { name: '🌏 Africa', groupIds: ['dFsZaGwyohGDVkJi1C3E'] },
    { name: '🌏 Middle East', groupIds: ['xg8wCPeM9JP6gD0igBrA'] },
    { name: '🌎 Asia', groupIds: ['bPTxMZhUYsIUXsWT969d'] },
  ],
  '💻 Tech': [
    {
      name: '💻 Technology',
      groupIds: [
        'IlzY3moWwOcpsVZXCVej', // Technology
        'SmJk6RHToaLxLk0I1ZSC', // Space
      ],
    },
    {
      name: '🔬 Science',
      groupIds: [
        'XMhZ5LbQoLMZiOpQJRnj', // Science
        '97oNExy8iFftY2EgdkLw', // Climate
      ],
    },
    {
      name: '🏥 Health',
      groupIds: ['JpUqUqRn9sSWxrk0Sq35'],
    },
    {
      // AI, Technical AI Timelines
      name: '🤖 AI',
      groupIds: ['yEWvvwFFIqzf8JklMewp', 'GbbX9U5pYnDeftX9lxUh'],
    },
    {
      name: '👨‍💻 Code',
      groupIds: ['PZJMbrLekgJBy7OOBKGT'],
    },
    {
      name: '🧮 Math',
      groupIds: ['S1tbcVt1t5Bd9O5mVCx1'],
    },
  ],
  '🏟️ Sports': [
    {
      name: '🏀 Basketball',
      groupIds: [
        'NjkFkdkvRvBHoeMDQ5NB', // Basketball
        // 'Tp4TDTWUGnEUMvBcCPIR', // March Madness
        '9a003f6b-9fd1-46ab-871d-2904953c4d5b', // March Madness 2024
        'beeb69e0-b36f-451a-80e1-e059df456bb1', // College Basketball
        'i0v3cXwuxmO9fpcInVYb', // NBA
      ],
    },
    {
      // NFL, College Football
      name: '🏈 NFL',
      groupIds: ['TNQwmbE5p6dnKx2e6Qlp', 'ky1VPTuxrLXMnHyajZFp'],
    },
    { name: '⚾ Baseball', groupIds: ['786nRQzgVyUnuUtaLTGW'] },
    { name: '⚽ Soccer', groupIds: ['ypd6vR44ZzJyN9xykx6e'] },
    { name: '🏒 NHL', groupIds: ['lccgApXa1l7O5ZH3XfhH'] },
    { name: '🏎️ F1', groupIds: ['OyHBKJOz9YaGkDctpwuY'] },
    { name: '♟️ Chess', groupIds: ['ED7Cu6lVPshJkZ7FYePW'] },
    { name: '🚲 Cycling', groupIds: ['2yisxJryUq9V5sG7P6Gy'] },
    { name: '🎾 Tennis', groupIds: ['1mvN9vIVIopcWiAsXhzp'] },
    { name: '🏏 Cricket', groupIds: ['LcPYoqxSRdeQMms4lR3g'] },
  ],
  '🎬 Entertainment': [
    {
      name: '🤩 Pop culture',
      groupIds: [
        'eJZecx6r22G2NriYYXcC', // Culture
        'XU1fOYURSnb58lgsqaly', // Entertainment & Pop culture
        '4QIcUOfCSSha0JZHAg9X', // celebrities
      ],
    },
    {
      name: '🍿 Movies & TV',
      groupIds: [
        'KSeNIu7AWgiBBM5FqVuB', // Movies
        'EUSEngFk1dGGBfaMeAmh', // TV and Film
      ],
    },
    {
      name: '🎶 Music',
      groupIds: ['Xuc2UY8gGfjQqFXwxq5d'],
    },
    {
      name: '🎮 Gaming',
      groupIds: [
        '5FaFmmaNNFTSA5r0vTAi', // Gaming
        '9FaZmHrfS8IcDJyu6pUD', // Video Games
      ],
    },
    {
      name: '🎮️ Destiny.gg',
      groupIds: ['W2ES30fRo6CCbPNwMTTj'],
    },
    {
      name: '🏴‍☠️ One Piece',
      groupIds: ['uJSql24HUqpEpVU0FrjI'],
    },
  ],
  '💵 Business': [
    {
      name: '📈 Finance & Stocks',
      groupIds: [
        'pmK8sntWL1SDkMm53UBR', // Business
        'CgB83AAMkkOHSrTnzani', // Finance
        'QDQfgsFiQrNNlZhsRGf5', // Stocks
        'pK06hNX8MsNw8zaBsX2N', // Tech Stocks
        '1a9ef4d5-dcc6-468f-a9b7-feccdaa92733', // Big Tech
      ],
    },
    {
      name: '📊 Econ',
      groupIds: [
        'p88Ycq6yFd5ECKqq9PFO', // Economics
      ],
    },
    {
      // Crypto, Bitcoin
      name: '🪙 Crypto',
      groupIds: ['YuJw0M1xvUHrpiRRuKso', 'WBeBD6FyMd0NvSL0qjMb'],
    },
  ],

  '🤪 Fun': [
    {
      name: '🎲 Fun & games',
      groupIds: [
        '5V0GjAyN99OQpb96fwo8', // whale watching
        'J8Z1KAZV31icklA4tgJW', // fairly random
        'bBwafyeaiuwWwobwm2c4', // fun
      ],
    },
    {
      name: '🌐 Manifold',
      groupIds: ['hzyCW27Hf9NzuXZRizeZ'],
    },
    {
      name: '💪 Personal Goals',
      groupIds: [
        'izQp87CKagOVJp9Olm1p', // Personal goals
        'wxAGTtNee5f2PTzjqSI2', // Personal
      ],
    },
    {
      // Sex and love, Dating
      name: '❤️‍🔥 Sex and love',
      groupIds: ['3syjPCC7PxE5KurTiTT3', 'j3ZE8fkeqiKmRGumy3O1'],
    },
    {
      name: '🐸 Meme stocks',
      groupIds: [
        '524e08a3-3589-4267-9009-818d6c89cfa4', // meme-stocks
        '2T4mM0N5az2lYcaN5G50', // permanent-markets
      ],
    },
  ],
}

export const TOPICS_TO_HIDE_FROM_WELCOME_FLOW = [] as string[]
if (
  !TOPICS_TO_HIDE_FROM_WELCOME_FLOW.every((topic) =>
    Object.keys(TOPICS_TO_SUBTOPICS).includes(topic)
  )
) {
  throw new Error(
    `${TOPICS_TO_HIDE_FROM_WELCOME_FLOW.join(', ')} contains invalid topics`
  )
}

export const GROUP_SLUGS_TO_HIDE_FROM_WELCOME_FLOW = [
  'world-default',
  'shortterm-markets',
  'daily-markets',
  'global-macro',
  'politics-default', // US Politics
  'magaland',
  'donald-trump',
  'the-life-of-biden',
  // 'elon-musk-14d9d9498c7e',
  'crypto-prices', // Crypto,
  'bitcoin-maxi',
  'nasdaq', // Stocks
  'stock-marketdaily',
  'ai-stocks',
  'prices',
  'entertainment', // should follow smaller groups instead
  'entertainment-12ba84d9b720',
  'gpt5-speculation', // AI
  'chatgpt',
  '2024-3d9da60b52f8',
  'coolfold',
  'grab-bag',
  'internet',
  'sports-default',
  'football', // ambiguous - both soccer and american football
  'manifold-drama',
  'permanent-markets',
  'testing',
  PROD_MANIFOLD_LOVE_GROUP_SLUG,
  ...HIDE_FROM_NEW_USER_SLUGS,
]

export const getSubtopics = (topic: string) =>
  TOPICS_TO_SUBTOPICS[topic].map(
    (subtopic) =>
      [subtopic.name, removeEmojis(subtopic.name), subtopic.groupIds] as const
  )
export const ALL_TOPICS = Object.keys(TOPICS_TO_SUBTOPICS)
  .map((topic) => getSubtopics(topic).map(([_, subtopic]) => subtopic))
  .flat()

export const ALL_PARENT_TOPICS = Object.keys(TOPICS_TO_SUBTOPICS).filter(
  (topic) => topic !== '🪂 NSFW'
)

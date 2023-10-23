type TopicInfo = { name: string; groupId: string }

export const TOPICS_TO_SUBTOPICS: { [key: string]: TopicInfo[] } = {
  '🗳️ Politics': [
    { name: '🇺🇸 US Politics', groupId: 'AjxQR8JMpNyDqtiqoA96' },
    { name: '🇬🇧 UK Politics', groupId: 'aavkiDd6uZggfL3geuV2' },
    { name: '🟠 Trump', groupId: 'cEzcLXuitr6o4VPI01Q1' },
    { name: '👴🏼 Biden', groupId: 'pYwsGvORZFlcq7QrkI6n' },
  ],
  '💻 Technology': [
    { name: '💻 Technology', groupId: 'IlzY3moWwOcpsVZXCVej' },
    { name: '🤖 AI', groupId: 'yEWvvwFFIqzf8JklMewp' },
    { name: '🪙 Crypto', groupId: 'YuJw0M1xvUHrpiRRuKso' },
    { name: '🌌 Space', groupId: 'SmJk6RHToaLxLk0I1ZSC' },
    { name: '🪸 Climate', groupId: '97oNExy8iFftY2EgdkLw' },
    { name: '☢️ Nuclear', groupId: '27a193db-f997-4533-86a6-386d9a915045' },
    { name: '🧬 Biotech', groupId: 'zx0Pik5lD4jydGPxbLjB' },
    { name: '☤ Health', groupId: 'JpUqUqRn9sSWxrk0Sq35' },
    { name: '👨‍💻 Programming', groupId: 'PZJMbrLekgJBy7OOBKGT' },
    { name: '🧪 Science', groupId: 'XMhZ5LbQoLMZiOpQJRnj' },
    { name: '🧮 Math', groupId: 'S1tbcVt1t5Bd9O5mVCx1' },
    { name: '🌐 Internet', groupId: 'raDuDKuBOp5D9l7301XV' },
    { name: '🐦 Twitter/X', groupId: 'Y8DDxYXrqOlQFv5AsilH' },
  ],
  '💼 Business': [
    { name: '💵 Finance', groupId: 'CgB83AAMkkOHSrTnzani' },
    { name: '💰 Economics', groupId: 'p88Ycq6yFd5ECKqq9PFO' },
    { name: '📈 Stocks', groupId: 'QDQfgsFiQrNNlZhsRGf5' },
    { name: '🪙 Crypto', groupId: 'YuJw0M1xvUHrpiRRuKso' },
    { name: '🚀 Startups', groupId: '19c319ca-033c-474f-b417-5f07efe88ec0' },
    { name: '🚘 Elon Musk', groupId: '9OR5MrEu1F01FhmBRcre' },
  ],
  '🏟️ Sports': [
    { name: '🏅 Sports', groupId: '2hGlgVhIyvVaFyQAREPi' },
    { name: '🏈 NFL', groupId: 'TNQwmbE5p6dnKx2e6Qlp' },
    { name: '🏀 Basketball', groupId: 'NjkFkdkvRvBHoeMDQ5NB' },
    { name: '⚽ Soccer', groupId: 'ypd6vR44ZzJyN9xykx6e' },
    { name: '♟️ Chess', groupId: 'ED7Cu6lVPshJkZ7FYePW' },
    { name: '🏎️ F1', groupId: 'ZdXq6X0Q8kZtA0Iyty7Q' },
    { name: '🎾 Tennis', groupId: '1mvN9vIVIopcWiAsXhzp' },
    { name: '🚲 Cycling', groupId: '2yisxJryUq9V5sG7P6Gy' },
    { name: '⚾ Baseball', groupId: '786nRQzgVyUnuUtaLTGW' },
  ],
  '🍿 Media': [
    { name: '🍿 Movies', groupId: 'KSeNIu7AWgiBBM5FqVuB' },
    { name: '🎮 Gaming', groupId: '5FaFmmaNNFTSA5r0vTAi' },
    { name: '📺 TV Shows', groupId: '8isZHbaQMsoFz30XuZTo' },
    { name: '🎵 Music', groupId: 'Xuc2UY8gGfjQqFXwxq5d' },
    { name: '💅 Celebrities', groupId: '4QIcUOfCSSha0JZHAg9X' },
    { name: '🎨 Culture', groupId: 'eJZecx6r22G2NriYYXcC' },
  ],
  '🌍 World': [
    { name: '🇷🇺 Russia', groupId: 'TIpf6j0hLpifpXN93FxE' },
    { name: '🇨🇳 China', groupId: 'oWTzfoeemQGkSoPFn2T7' },
    { name: '🇪🇺 Europe', groupId: 'ue52QI4BQgJgAJJNjLHr' },
    { name: '🇮🇳 India', groupId: 'Y2J00UcVhr3wKq2lAOAy' },
    { name: '🇷🇺🇺🇦 Russia & Ukraine', groupId: 'OxcXOuxXvwsXtC0Dx5sr' },
    { name: '🌎 Latin America', groupId: 'DX94A1LQmpckcVdz5Hb3' },
    { name: '🌍 Middle East', groupId: 'xg8wCPeM9JP6gD0igBrA' },
    { name: '🌍 Africa', groupId: 'dFsZaGwyohGDVkJi1C3E' },
    { name: '🌏 Asia', groupId: 'bPTxMZhUYsIUXsWT969d' },
  ],
  '🪂 Lifestyle': [
    { name: '💪 Personal Development', groupId: 'izQp87CKagOVJp9Olm1p' },
    { name: '❤️‍🔥 Sex and love', groupId: '3syjPCC7PxE5KurTiTT3' },
    { name: '🏳️‍🌈 LGBTQIA+', groupId: 'cLtLfm3NSrhXU6lV6Cuy' },
  ],
}

export const removeEmojis = (input: string) =>
  // eslint-disable-next-line no-control-regex
  input.replace(/[^\x00-\x7F]/g, '').trim()

export const getSubtopics = (topic: string) =>
  TOPICS_TO_SUBTOPICS[topic].map(
    (subtopic) =>
      [subtopic.name, removeEmojis(subtopic.name), subtopic.groupId] as const
  )
export const ALL_TOPICS = Object.keys(TOPICS_TO_SUBTOPICS)
  .map((topic) => getSubtopics(topic).map(([_, subtopic]) => subtopic))
  .flat()

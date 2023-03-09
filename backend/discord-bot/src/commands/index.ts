import { Command } from 'discord-bot/command'
import { marketCommand } from 'discord-bot/commands/market-react-bets'
import { leaderboardCommand } from 'discord-bot/commands/leaderboard'
import { searchCommand } from 'discord-bot/commands/search'

export const commands: Command[] = [
  marketCommand,
  leaderboardCommand,
  searchCommand,
]

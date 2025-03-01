import { Command } from 'discord-bot/command'
import { marketCommand } from 'discord-bot/commands/react-to-bet-on-market'
import { searchCommand } from 'discord-bot/commands/search'
import { createCommand } from 'discord-bot/commands/create'
import { aboutCommand } from 'discord-bot/commands/about'

export const commands: Command[] = [
  marketCommand,
  searchCommand,
  createCommand,
  aboutCommand,
]

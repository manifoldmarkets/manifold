import { Command } from 'discord-bot/command'
import { questionCommand } from 'discord-bot/commands/react-to-bet-on-question'
import { searchCommand } from 'discord-bot/commands/search'
import { createCommand } from 'discord-bot/commands/create'
import { aboutCommand } from 'discord-bot/commands/about'

export const commands: Command[] = [
  questionCommand,
  searchCommand,
  createCommand,
  aboutCommand,
]

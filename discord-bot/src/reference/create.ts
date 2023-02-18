import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'
import { CreateMarketArgs } from 'manifold-sdk'
import { channelMarkets, getAPIInstance } from '../storage.js'

export const data = new SlashCommandBuilder()
  .setName('create')
  .setDescription('Creates a new binary market')
  .addStringOption((option) =>
    option
      .setName('question')
      .setDescription(
        'the question/title of the market; required if not in a channel with a default market'
      )
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('description')
      .setDescription('a description of the market')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('closes')
      .setDescription('the date the market closes')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('type')
      .setDescription('the type of market to create')
      .setRequired(true)
      .setChoices(
        { name: 'binary market', value: 'BINARY' },
        { name: 'free response', value: 'FREE_RESPONSE' },
        { name: 'numeric market', value: 'NUMERIC' }
      )
  )
  .addIntegerOption((option) =>
    option
      .setName('initial_probability')
      .setDescription(
        'the initial probability of the market - required for binary markets only'
      )
  )
  .addIntegerOption((option) =>
    option
      .setName('min')
      .setDescription(
        'the minimum value of the market - required for numeric markets only'
      )
  )
  .addIntegerOption((option) =>
    option
      .setName('max')
      .setDescription(
        'the maximum value of the market - required for numeric markets only'
      )
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply('Creating market...')
  const api = await getAPIInstance(interaction.user)
  if (!api) return

  const closes = interaction.options.getString('closes') || ''
  const closeTime = new Date(closes).getTime()
  if (closeTime < Date.now() || !closeTime) {
    await interaction.editReply(
      'You must specify a valid closing date (YYYY-MM-DD)'
    )
    return
  }

  const type = interaction.options.getString('type') as
    | 'BINARY'
    | 'FREE_RESPONSE'
    | 'NUMERIC'
  const initialProb = interaction.options.getInteger('initial_probability')
  if (initialProb && type !== 'BINARY') {
    await interaction.editReply(
      'Intial probabilities can only be specified for binary markets.'
    )
    return
  }

  const min = interaction.options.getInteger('min')
  const max = interaction.options.getInteger('max')
  if ((min || max) && type !== 'NUMERIC') {
    await interaction.editReply(
      'Minimum and maximum values can only be specified for numeric markets.'
    )
    return
  }
  if (type === 'NUMERIC' && (!min || !max)) {
    await interaction.editReply(
      'You must specify both a minimum and maximum value for numeric markets.'
    )
    return
  }

  try {
    const options: { [k: string]: any } = {
      outcomeType: type,
      question: interaction.options.getString('question')!,
      description: interaction.options.getString('description')!,
      closeTime,
    }
    if (type === 'BINARY') options.initialProb = initialProb || 50
    if (type === 'NUMERIC') {
      options.min = min
      options.max = max
    }

    const market = await api.createMarket(options as CreateMarketArgs)
    const channel = interaction.channel?.id
    if (channel) channelMarkets[channel] = market.id
    await interaction.editReply(
      `Successfully created the market ${market.question} with ID ${market.id}.` +
        `\n<https://manifold.markets/${market.creatorName}/${market.slug}>` +
        (channel ? `\nThis market is now the default for <#${channel}>.` : '')
    )
  } catch (e) {
    await interaction.editReply(`Error: ${e}`)
  }
  return
}

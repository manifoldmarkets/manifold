import { FullMarket, LiteMarket } from 'common/api/market-types'
import { floatingEqual } from 'common/util/math'
import { MINUTE_MS } from 'common/util/time'
import { Command } from 'discord-bot/command'
import { replyWithMarketToBetOn } from 'discord-bot/commands/react-to-bet-on-market'
import { config } from 'discord-bot/constants/config'

import { shouldIgnoreMessageFromGuild, truncateText } from 'discord-bot/helpers'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js'
const MARKETS_PER_PAGE = 5
const DROPDOWN_PLACEHOLDER = 'Select a market from the dropdown'
const searchMessageIdToSearchState = new Map<
  string,
  { page: number; markets: LiteMarket[] }
>()
export const searchButtonTypes = ['back', 'next', 'done']

const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search for markets on Manifold')
  .addStringOption((option) =>
    option
      .setName('keywords')
      .setDescription('The keywords to search for')
      .setRequired(true)
  ) as SlashCommandBuilder

async function execute(interaction: ChatInputCommandInteraction) {
  if (shouldIgnoreMessageFromGuild(interaction.guildId)) return
  await interaction.deferReply()

  const keywords = interaction.options.getString('keywords')
  if (!keywords) {
    await interaction.editReply('Please provide some keywords to search for')
    return
  }
  const markets = await searchMarkets(keywords).catch(async (error) => {
    await interaction.editReply(
      'Error searching markets, please try again later.'
    )
    console.error('Error searching markets', error)
    return
  })
  if (!markets) return
  if (markets.length === 0) {
    await interaction.editReply('No markets found, try different keywords.')
    return
  }

  const stringSelectRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select')
        .setPlaceholder(DROPDOWN_PLACEHOLDER)
        .addOptions(
          markets
            .slice(0, MARKETS_PER_PAGE)
            .map((market) => getMarketItem(market))
        )
    )

  const message = await interaction.editReply({
    content: 'Searching markets for terms: ' + keywords,
    components: [stringSelectRow, getButtonRow(0, markets.length)],
  })
  const page = 0
  searchMessageIdToSearchState.set(message.id, { page, markets })
  const collector = message.createMessageComponentCollector({
    time: 10 * MINUTE_MS,
  })

  collector.on('collect', async (i) => {
    console.log('collected', i.customId)
    // Handle button clicks
    if (i.customId === 'done') {
      searchMessageIdToSearchState.delete(message.id)
      await interaction.deleteReply().catch((e) => {
        console.error('Error deleting search reply', e)
      })
      return
    }
    if (['next', 'back'].includes(i.customId)) {
      let page = searchMessageIdToSearchState.get(message.id)?.page ?? 0
      page = limit(
        i.customId === 'next' ? page + 1 : page - 1,
        0,
        Math.round(markets.length / MARKETS_PER_PAGE) - 1
      )
      searchMessageIdToSearchState.set(message.id, { page, markets })
      const newSelectRow =
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select')
            .setPlaceholder(DROPDOWN_PLACEHOLDER)
            .addOptions(
              markets
                .slice(page * MARKETS_PER_PAGE, (page + 1) * MARKETS_PER_PAGE)
                .map((market) => getMarketItem(market))
            )
        )

      await i.update({
        content: i.message.content,
        components: [newSelectRow, getButtonRow(page, markets.length)],
      })
      return
    }

    // Handle market selection
    const marketSelectInteraction = i as StringSelectMenuInteraction
    if (marketSelectInteraction) {
      const market = markets.find(
        (m) => m.url === marketSelectInteraction.values[0]
      )
      if (!market) return
      await replyWithMarketToBetOn(marketSelectInteraction, market)
    }
  })

  collector.on('end', async () => {
    const stillExists = searchMessageIdToSearchState.has(message.id)
    if (stillExists) {
      searchMessageIdToSearchState.delete(message.id)
      await interaction.deleteReply()
    }
  })
}

export const searchCommand = {
  data,
  execute,
} as Command

export const searchMarkets = async (terms: string) => {
  const resp = await fetch(
    `${config.domain}api/v0/search-markets?term=${encodeURIComponent(terms)}`
  )
  if (!resp.ok) {
    throw new Error('Market not found with query: ' + terms)
  }
  const fullMarkets = (await resp.json()) as FullMarket[]
  // filter markets that are closed or resolved already

  return fullMarkets.filter(
    (market) =>
      market.closeTime &&
      market.closeTime > Date.now() &&
      !market.isResolved &&
      market.outcomeType === 'BINARY'
  )
}

const getMarketDescription = (market: FullMarket) => {
  let description = truncateText(market.creatorName, 25) + ' | '
  // if it has a text description, use that limited
  if (market.textDescription) {
    description += truncateText(market.textDescription, 69)
  }
  // if it has a close date, use that
  if (description.length < 85 && market.closeTime) {
    description += `${new Date(market.closeTime).toLocaleDateString()}`
  }
  // otherwise use the creator
  return description
}

const limit = (n: number, min: number, max: number) =>
  Math.max(Math.min(n, max), min)

const getButtonRow = (page: number, maxItems: number) => {
  const maxPage = Math.round(maxItems / MARKETS_PER_PAGE) - 1
  console.log('page', page, 'max page', maxPage)

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(searchButtonTypes[0])
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(searchButtonTypes[1])
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(floatingEqual(page, maxPage)),
    new ButtonBuilder()
      .setCustomId(searchButtonTypes[2])
      .setLabel('Done')
      .setStyle(ButtonStyle.Secondary)
  )
}
const getMarketItem = (market: FullMarket) => ({
  label: truncateText(market.question, 69),
  description: getMarketDescription(market),
  value: market.url,
})

export const handleSearchButtonInteraction = async (
  interaction: ButtonInteraction
) => {
  // Recent searches handled via collector
  if (searchMessageIdToSearchState.has(interaction.message.id)) return
  // Otherwise, it's a stale interaction from a previous cloud run instance
  else {
    await interaction.message
      .delete()
      .catch((e) => {
        console.log('Could not delete old search results', e.message)
      })
      .then(async () => {
        await interaction.reply({
          content: 'That search expired, try a new one by typing /search!',
          ephemeral: true,
        })
      })
  }
}

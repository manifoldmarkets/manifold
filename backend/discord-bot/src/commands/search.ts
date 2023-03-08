import { FullMarket, LiteMarket } from 'common/api-market-types'
import { floatingEqual } from 'common/util/math'
import { MINUTE_MS } from 'common/util/time'
import { Command } from 'discord-bot/command'
import { replyWithMarketToBetOn } from 'discord-bot/commands/market-react-bets'
import { config } from 'discord-bot/constants/config'

import { shouldIgnoreMessageFromGuild, truncateText } from 'discord-bot/helpers'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js'

const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search for markets on Manifold Markets')
  .addStringOption((option) =>
    option
      .setName('keywords')
      .setDescription('The keywords to search for')
      .setRequired(true)
  ) as SlashCommandBuilder

const interactionToPageAndMarkets = new Map<
  string,
  { page: number; markets: LiteMarket[] }
>()
const MARKETS_PER_PAGE = 5
const DROPDOWN_PLACEHOLDER = 'Select a market from the dropdown'
async function execute(interaction: ChatInputCommandInteraction) {
  if (shouldIgnoreMessageFromGuild(interaction.guildId)) return
  await interaction.deferReply()

  const keywords = interaction.options.getString('keywords')
  if (!keywords) {
    await interaction.editReply('Please provide some keywords to search for')
    return
  }
  const markets = await searchMarkets(keywords)
  if (markets.length === 0) {
    await interaction.editReply('No markets found')
    return
  }
  const page = 0
  interactionToPageAndMarkets.set(interaction.id, { page, markets })

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

  const collector = message.createMessageComponentCollector({
    time: 0.1 * MINUTE_MS,
  })

  collector.on('collect', async (i) => {
    console.log('collected', i.customId)
    // Handle button clicks
    if (i.customId === 'done') {
      // deleteReply doesn't seem to work?
      interactionToPageAndMarkets.delete(interaction.id)
      await interaction.deleteReply()
      return
    }
    if (['next', 'back'].includes(i.customId)) {
      let page = interactionToPageAndMarkets.get(interaction.id)?.page ?? 0
      page = limit(
        i.customId === 'next' ? page + 1 : page - 1,
        0,
        Math.round(markets.length / MARKETS_PER_PAGE) - 1
      )
      interactionToPageAndMarkets.set(interaction.id, { page, markets })
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
    const stringSelectInteraction = i as StringSelectMenuInteraction
    if (stringSelectInteraction) {
      const market = markets.find(
        (m) => m.url === stringSelectInteraction.values[0]
      )
      if (!market) return
      await replyWithMarketToBetOn(stringSelectInteraction, market)
    }
  })

  collector.on('end', async () => {
    const stillExists = interactionToPageAndMarkets.has(interaction.id)
    console.log('end', stillExists)
    if (stillExists) {
      interactionToPageAndMarkets.delete(interaction.id)
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
    `${config.domain}api/v0/search-markets?terms=${terms}`
  )
  if (!resp.ok) {
    throw new Error('Market not found with slug: ' + terms)
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
      .setCustomId('back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(floatingEqual(page, maxPage)),
    new ButtonBuilder()
      .setCustomId('done')
      .setLabel('Done')
      .setStyle(ButtonStyle.Secondary)
  )
}
const getMarketItem = (market: FullMarket) => ({
  label: truncateText(market.question, 69),
  description: getMarketDescription(market),
  value: market.url,
})

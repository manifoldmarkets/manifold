import { FullQuestion, LiteQuestion } from 'common/api-question-types'
import { floatingEqual } from 'common/util/math'
import { MINUTE_MS } from 'common/util/time'
import { Command } from 'discord-bot/command'
import { replyWithQuestionToBetOn } from 'discord-bot/commands/react-to-bet-on-question'
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
const DROPDOWN_PLACEHOLDER = 'Select a question from the dropdown'
const searchMessageIdToSearchState = new Map<
  string,
  { page: number; questions: LiteQuestion[] }
>()
export const searchButtonTypes = ['back', 'next', 'done']

const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search for questions on Manifold Questions')
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
  const questions = await searchQuestions(keywords).catch(async (error) => {
    await interaction.editReply(
      'Error searching questions, please try again later.'
    )
    console.error('Error searching questions', error)
    return
  })
  if (!questions) return
  if (questions.length === 0) {
    await interaction.editReply('No questions found, try different keywords.')
    return
  }

  const stringSelectRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select')
        .setPlaceholder(DROPDOWN_PLACEHOLDER)
        .addOptions(
          questions
            .slice(0, MARKETS_PER_PAGE)
            .map((question) => getQuestionItem(question))
        )
    )

  const message = await interaction.editReply({
    content: 'Searching questions for terms: ' + keywords,
    components: [stringSelectRow, getButtonRow(0, questions.length)],
  })
  const page = 0
  searchMessageIdToSearchState.set(message.id, { page, questions })
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
        Math.round(questions.length / MARKETS_PER_PAGE) - 1
      )
      searchMessageIdToSearchState.set(message.id, { page, questions })
      const newSelectRow =
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select')
            .setPlaceholder(DROPDOWN_PLACEHOLDER)
            .addOptions(
              questions
                .slice(page * MARKETS_PER_PAGE, (page + 1) * MARKETS_PER_PAGE)
                .map((question) => getQuestionItem(question))
            )
        )

      await i.update({
        content: i.message.content,
        components: [newSelectRow, getButtonRow(page, questions.length)],
      })
      return
    }

    // Handle question selection
    const questionSelectInteraction = i as StringSelectMenuInteraction
    if (questionSelectInteraction) {
      const question = questions.find(
        (m) => m.url === questionSelectInteraction.values[0]
      )
      if (!question) return
      await replyWithQuestionToBetOn(questionSelectInteraction, question)
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

export const searchQuestions = async (terms: string) => {
  const resp = await fetch(
    `${config.domain}api/v0/search-questions?terms=${terms}`
  )
  if (!resp.ok) {
    throw new Error('Question not found with slug: ' + terms)
  }
  const fullQuestions = (await resp.json()) as FullQuestion[]
  // filter questions that are closed or resolved already

  return fullQuestions.filter(
    (question) =>
      question.closeTime &&
      question.closeTime > Date.now() &&
      !question.isResolved &&
      question.outcomeType === 'BINARY'
  )
}

const getQuestionDescription = (question: FullQuestion) => {
  let description = truncateText(question.creatorName, 25) + ' | '
  // if it has a text description, use that limited
  if (question.textDescription) {
    description += truncateText(question.textDescription, 69)
  }
  // if it has a close date, use that
  if (description.length < 85 && question.closeTime) {
    description += `${new Date(question.closeTime).toLocaleDateString()}`
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
const getQuestionItem = (question: FullQuestion) => ({
  label: truncateText(question.question, 69),
  description: getQuestionDescription(question),
  value: question.url,
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

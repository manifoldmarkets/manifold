import {
  Contract,
  MAX_DESCRIPTION_LENGTH,
  MAX_QUESTION_LENGTH,
} from 'common/contract'
import { createQuestion, getQuestionFromId } from 'discord-bot/api'
import { Command } from 'discord-bot/command'
import { replyWithQuestionToBetOn } from 'discord-bot/commands/react-to-bet-on-question'
import { getUserInfo } from 'discord-bot/storage'
import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { shouldIgnoreMessageFromGuild } from 'discord-bot/helpers'

const data = new SlashCommandBuilder()
  .setName('create')
  .setDescription(
    'Create a Yes/No question on manifold. Hit enter to bring up the creation modal.'
  )

async function execute(interaction: ChatInputCommandInteraction) {
  if (shouldIgnoreMessageFromGuild(interaction.guildId)) return
  const api = await getUserInfo(interaction.user, interaction)
  if (!api) return

  // Create the modal
  const modal = new ModalBuilder()
    .setCustomId('creationModal')
    .setTitle('Create a question')
  // Create the text input components
  const questionQuestionTitle = new TextInputBuilder()
    .setCustomId('questionQuestionTitle')
    .setMaxLength(MAX_QUESTION_LENGTH)
    .setPlaceholder('E.g. Michelle Obama runs for president in 2024')
    .setLabel('Question title')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)

  const questionDescription = new TextInputBuilder()
    .setCustomId('questionDescription')
    .setMaxLength(Math.min(4000, MAX_DESCRIPTION_LENGTH))
    .setPlaceholder(
      'E.g. Resolves YES if Michelle Obama runs for president in 2024 and NO otherwise.'
    )
    .setLabel('Question description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)

  // An action row only holds one text input,
  // so you need one action row per text input.
  const firstActionRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      questionQuestionTitle
    )
  const secondActionRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      questionDescription
    )

  // Add inputs to the modal
  modal.addComponents(firstActionRow, secondActionRow)

  // Show the modal to the user
  await interaction.showModal(modal)
}

export const handleCreateQuestion = async (
  interaction: ModalSubmitInteraction
) => {
  if (interaction.customId !== 'creationModal') return
  const api = await getUserInfo(interaction.user, interaction)
  if (!api) return
  const question = interaction.fields.getTextInputValue('questionQuestionTitle')
  const description = interaction.fields.getTextInputValue(
    'questionDescription'
  )
  const resp = await createQuestion(api, question, description)
  if (resp.status === 200) {
    const contract = (await resp.json()) as Contract
    const question = await getQuestionFromId(contract.id)
    await replyWithQuestionToBetOn(interaction, question)
  } else {
    await interaction.reply({
      content: 'Error creating question',
      ephemeral: true,
    })
  }
}

export const createCommand = {
  data,
  execute,
} as Command

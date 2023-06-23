import { FullQuestion } from 'common/api-question-types'
import { filterDefined } from 'common/util/array'
import { getOpenBinaryQuestionFromSlug } from 'discord-bot/api'
import { Command } from 'discord-bot/command'
import { config } from 'discord-bot/constants/config'
import {
  customEmojiCache,
  customEmojis,
  emojis,
  getAnyHandledEmojiKey,
} from 'discord-bot/emojis'
import {
  getCurrentQuestionDescription,
  getSlug,
  handleReaction,
  messageEmbedsToRefresh,
  shouldIgnoreMessageFromGuild,
} from 'discord-bot/helpers'
import {
  getQuestionInfoFromMessageId,
  messagesHandledViaCollector,
  saveQuestionToMessageId,
} from 'discord-bot/storage'
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  MessageReaction,
  ModalSubmitInteraction,
  PartialMessageReaction,
  PartialUser,
  SlashCommandBuilder,
  StringSelectMenuInteraction,
  TextChannel,
  User,
} from 'discord.js'
import { track } from 'discord-bot/analytics'

const data = new SlashCommandBuilder()
  .setName('question')
  .setDescription(
    'Link to a question that other users can bet on with reactions'
  )
  .addStringOption((option) =>
    option
      .setName('link')
      .setDescription('The link to the question to bet on')
      .setRequired(true)
  ) as SlashCommandBuilder

async function execute(interaction: ChatInputCommandInteraction) {
  if (shouldIgnoreMessageFromGuild(interaction.guildId)) return

  const link = interaction.options.getString('link')
  if (!link || !link.startsWith(config.domain)) {
    await interaction.reply(
      `You must specify a question link starting with ${config.domain}`
    )
    return
  }
  const slug = getSlug(link)
  if (!slug) {
    await interaction.reply(
      'Invalid question link, could not find slug from link'
    )
    return
  }
  const question = await getOpenBinaryQuestionFromSlug(slug).catch(
    async (error) => {
      console.error('Failed to get question', error)
      await interaction.reply({ content: error.message })
      return
    }
  )
  if (!question) return
  await replyWithQuestionToBetOn(interaction, question)
}

export const replyWithQuestionToBetOn = async (
  interaction:
    | ChatInputCommandInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  question: FullQuestion
) => {
  try {
    const message = await sendQuestionIntro(interaction, question)
    const channel = interaction.channel as TextChannel
    await saveQuestionToMessageId(
      message.id,
      question.id,
      getSlug(question.url),
      channel.id
    )

    const filter = (reaction: MessageReaction, user: User) => {
      if (user.id === message.author.id) return false
      return !!reaction.emoji
    }

    const collector = message.createReactionCollector({ filter, dispose: true })
    collector.on('collect', async (reaction, user) => {
      await handleReaction(reaction, user, channel, question)
    })
  } catch (error) {
    console.error(
      'error on send question embed',
      error,
      'for link',
      question.url
    )
  }
}

const sendQuestionIntro = async (
  interaction:
    | ChatInputCommandInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  question: FullQuestion
) => {
  await interaction.deferReply()

  const { coverImageUrl } = question
  const getAttachment = async (url: string, name: string) => {
    try {
      const blob = await fetch(url).then((r) => r.blob())
      const arrayBuffer = await blob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      return new AttachmentBuilder(buffer, { name })
    } catch (error) {
      console.error('error on get attachment', error)
      return undefined
    }
  }
  const fallbackImage = 'https://manifold.markets/logo-cover.png'
  const [cover, author] = await Promise.all([
    getAttachment(coverImageUrl ?? fallbackImage, 'cover.png').catch(() =>
      getAttachment(fallbackImage, 'cover.png')
    ),
    getAttachment(question.creatorAvatarUrl ?? fallbackImage, 'author.png'),
  ])

  const questionEmbed = new EmbedBuilder()
  questionEmbed
    .setColor(0x0099ff)
    .setTitle(
      question.question +
        ` ${Math.round((question.probability ?? 0) * 100)}% chance`
    )
    .setURL(question.url)
    .setDescription(getCurrentQuestionDescription(question))
    .setThumbnail(`attachment://cover.png`)
    .setTimestamp(question.closeTime)
    .setFooter({
      text: `${question.creatorName}`,
      iconURL: `attachment://author.png`,
    })
  const message = await interaction.editReply({
    components: [getButtonRow()],
    embeds: [questionEmbed],
    files: filterDefined([cover, author]),
  })

  // Let client listener know we've this message in memory
  messagesHandledViaCollector.add(message.id)
  messageEmbedsToRefresh.add({
    message,
    questionId: question.id,
    createdTime: Date.now(),
  })
  // Add emoji reactions
  for (const emoji of emojis) {
    if (customEmojis.includes(emoji)) {
      const reactionEmoji = customEmojiCache[emoji]
      if (reactionEmoji) await message.react(reactionEmoji)
    } else await message.react(emoji)
  }

  return message
}
const getButtonRow = () => {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('details')
      .setEmoji('ℹ️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('my-position')
      .setEmoji('💰') // other ideas: 💰, 📈, 📉
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('leaderboard')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('question')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary)
  )
}

export const handleOldReaction = async (
  pReaction: MessageReaction | PartialMessageReaction,
  pUser: User | PartialUser,
  client: Client
) => {
  const { message } = pReaction

  // Check if the collector is handling this message already
  const ignore = messagesHandledViaCollector.has(message.id)
  if (ignore) {
    console.log('ignoring reaction with message id:', message.id)
    return
  }

  // Check if it's a dev guild
  const guildId =
    message.guildId === null ? (await message.fetch()).guildId : message.guildId
  if (shouldIgnoreMessageFromGuild(guildId)) return

  // Check if it's one of our handled emojis
  const reaction = pReaction.partial
    ? await pReaction.fetch().catch((e) => {
        console.error('Failed to fetch reaction', e)
      })
    : pReaction
  if (!reaction) return
  const emojiKey = getAnyHandledEmojiKey(reaction)
  if (!emojiKey) return

  // Check if the message has a question matched to it
  const questionInfo = await getQuestionInfoFromMessageId(message.id)
  if (!questionInfo) return
  await track(pUser.id, 'react to bet', {
    guildId,
    questionSlug: questionInfo.question_slug,
    emoji: reaction.emoji.name,
  })

  const user = pUser.partial
    ? await pUser
        .fetch()
        .then((u) => u)
        .catch((e) => {
          console.error('Failed to fetch user', e)
        })
    : pUser
  if (!user) return

  const channelId = questionInfo.channel_id ?? reaction.message.channelId
  const hasCachedChannel = client.channels.cache.has(channelId)
  const channel = hasCachedChannel
    ? client.channels.cache.get(channelId)
    : await client.channels
        .fetch(channelId)
        .then((c) => c)
        .catch((e) => {
          console.error('Failed to fetch channel', e)
        })

  console.log('got channel', channel?.id)
  if (!channel || !channel.isTextBased()) return

  const question = await getOpenBinaryQuestionFromSlug(
    questionInfo.question_slug
  ).catch((e) => {
    console.error('Failed to fetch question', e)
  })
  if (!question) return
  console.log('got question', question.url)

  await handleReaction(
    reaction,
    user,
    channel as TextChannel,
    question,
    questionInfo.thread_id
  )
}

export const questionCommand = {
  data,
  execute,
} as Command

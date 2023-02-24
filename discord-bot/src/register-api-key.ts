import { User } from 'common/user'
import { config } from './constants/config.js'
import { Message } from 'discord.js'
import { writeApiKeyToDiscordUserId } from './storage.js'

export const registerApiKey = async (message: Message) => {
  const key = message.content.trim()
  if (key.length !== 36) {
    await message.reply(
      `API key should be 36 characters long, find it at ${config.domain}my-api-key`
    )
    return
  }
  const p1 = message.reply({
    content: 'Checking API key...',
  })
  const p2 = fetch(`${config.domain}api/v0/me`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${key}`,
    },
  })
    .then((r) => r.json().then((j) => j as User))
    .catch(() => {
      console.log('Failed to fetch api key', key)
      return
    })
  const [_, me] = await Promise.all([p1, p2])
  if (!me || !me.name) {
    await message.reply(
      `Encountered an error using that API key to connect to Manifold -- find yours at ${config.domain}my-api-key`
    )
    return
  }

  await writeApiKeyToDiscordUserId(key, message.author.id)
  await message.reply(
    `Registered Manifold account ${me.name} to user <@!${message.author.id}>`
  )
}

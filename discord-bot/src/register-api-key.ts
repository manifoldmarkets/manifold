import { Message } from 'discord.js'
import { Manifold } from 'manifold-sdk'
import { manifoldMap, saveManifoldMap } from './storage.js'

export const registerApiKey = async (message: Message) => {
  const key = message.content.trim()
  if (key.length !== 36) {
    await message.reply(
      'API key should be 36 characters long, find it at https://manifold.markets/my-api-key'
    )
    return
  }
  let me
  await message.reply({
    content: 'Checking API key...',
  })
  let failed = false
  try {
    const api = new Manifold(key)
    me = await fetch('https://manifold.markets/api/v0/me', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${api.apiKey}`,
      },
    }).then((r) => r.json())
  } catch (e) {
    failed = true
  }
  if (failed || !me) {
    await message.reply(
      `Encountered an error using that API key to connect to Manifold -- find yours at https://manifold.markets/my-api-key`
    )
    return
  }

  manifoldMap[message.author.id] = key
  saveManifoldMap()
  await message.reply(
    `Registered Manifold account ${me.name} to user <@!${message.author.id}>`
  )
}

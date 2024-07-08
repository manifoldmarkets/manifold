// import { getSecrets } from 'common/secrets'
import Anthropic from '@anthropic-ai/sdk'
import { removeUndefinedProps } from 'common/util/object'

export const models = {
  sonnet: 'claude-3-5-sonnet-20240620' as const,
  haiku: 'claude-3-haiku-20240307' as const,
}

type models = (typeof models)[keyof typeof models]

export const promptClaude = async (
  prompt: string,
  options: { system?: string; model?: models } = {}
) => {
  const { model = models.sonnet, system } = options

  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY')
  }

  const anthropic = new Anthropic({ apiKey })

  const msg = await anthropic.messages.create(
    removeUndefinedProps({
      model,
      max_tokens: 4096,
      temperature: 0,
      system,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    })
  )
  const message = msg.content[0]
  if ('text' in message) {
    return message.text
  }
  return ''
}

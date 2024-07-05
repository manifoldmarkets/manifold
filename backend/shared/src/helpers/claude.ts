// import { getSecrets } from 'common/secrets'
import Anthropic from '@anthropic-ai/sdk'
import { removeUndefinedProps } from 'common/util/object'

export const promptClaude = async (
  prompt: string,
  options: { system?: string } = {}
) => {
  const { system } = options
  const apiKey = process.env.ANTHROPIC_API_KEY4

  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY4')
  }

  const anthropic = new Anthropic({ apiKey })

  const msg = await anthropic.messages.create(
    removeUndefinedProps({
      model: 'claude-3-5-sonnet-20240620',
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

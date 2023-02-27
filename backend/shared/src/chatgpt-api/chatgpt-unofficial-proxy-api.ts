import { randomString } from 'common/util/random'

import * as types from './types'
import { fetch as globalFetch } from './fetch'

export class ChatGPTUnofficialProxyAPI {
  protected _accessToken: string
  protected _apiReverseProxyUrl: string
  protected _debug: boolean
  protected _model: string
  protected _headers: Record<string, string>
  protected _fetch: types.FetchFn

  /**
   * @param fetch - Optional override for the `fetch` implementation to use. Defaults to the global `fetch` function.
   */
  constructor(opts: {
    accessToken: string

    /** @defaultValue `https://chat.openai.com/backend-api/conversation` **/
    apiReverseProxyUrl?: string

    /** @defaultValue `text-davinci-002-render-sha` **/
    model?: string

    /** @defaultValue `false` **/
    debug?: boolean

    /** @defaultValue `undefined` **/
    headers?: Record<string, string>

    fetch?: types.FetchFn
  }) {
    const {
      accessToken,
      apiReverseProxyUrl = 'https://chat.duti.tech/api/conversation',
      model = 'text-davinci-002-render-sha',
      debug = false,
      headers,
      fetch = globalFetch,
    } = opts

    this._accessToken = accessToken
    this._apiReverseProxyUrl = apiReverseProxyUrl
    this._debug = !!debug
    this._model = model
    this._fetch = fetch
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this._headers = headers

    if (!this._accessToken) {
      throw new Error('ChatGPT invalid accessToken')
    }

    if (!this._fetch) {
      throw new Error('Invalid environment; fetch is not defined')
    }

    if (typeof this._fetch !== 'function') {
      throw new Error('Invalid "fetch" is not a function')
    }
  }

  get accessToken(): string {
    return this._accessToken
  }

  set accessToken(value: string) {
    this._accessToken = value
  }

  /**
   * Sends a message to ChatGPT, waits for the response to resolve, and returns
   * the response.
   *
   * If you want your response to have historical context, you must provide a valid `parentMessageId`.
   *
   * If you want to receive a stream of partial responses, use `opts.onProgress`.
   * If you want to receive the full response, including message and conversation IDs,
   * you can use `opts.onConversationResponse` or use the `ChatGPTAPI.getConversation`
   * helper.
   *
   * Set `debug: true` in the `ChatGPTAPI` constructor to log more info on the full prompt sent to the OpenAI completions API. You can override the `promptPrefix` and `promptSuffix` in `opts` to customize the prompt.
   *
   * @param message - The prompt message to send
   * @param opts.conversationId - Optional ID of a conversation to continue (defaults to a random UUID)
   * @param opts.parentMessageId - Optional ID of the previous message in the conversation (defaults to `undefined`)
   * @param opts.messageId - Optional ID of the message to send (defaults to a random UUID)
   * @param opts.timeoutMs - Optional timeout in milliseconds (defaults to no timeout)
   * @param opts.onProgress - Optional callback which will be invoked every time the partial response is updated
   * @param opts.abortSignal - Optional callback used to abort the underlying `fetch` call using an [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
   *
   * @returns The response from ChatGPT
   */
  async sendMessage(
    text: string,
    opts: types.SendMessageBrowserOptions = {}
  ): Promise<types.ChatMessage> {
    const {
      conversationId,
      parentMessageId = randomString(16),
      messageId = randomString(16),
      action = 'next',
      timeoutMs,
      onProgress,
    } = opts

    let { abortSignal } = opts
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    let abortController: AbortController = null
    if (timeoutMs && !abortSignal) {
      abortController = new AbortController()
      abortSignal = abortController.signal
    }

    const body: types.ConversationJSONBody = {
      action,
      messages: [
        {
          id: messageId,
          role: 'user',
          content: {
            content_type: 'text',
            parts: [text],
          },
        },
      ],
      model: this._model,
      parent_message_id: parentMessageId,
    }

    if (conversationId) {
      body.conversation_id = conversationId
    }

    const result: types.ChatMessage = {
      role: 'assistant',
      id: randomString(16),
      parentMessageId: messageId,
      conversationId,
      text: '',
    }

    const responseP = new Promise<types.ChatMessage>((resolve, reject) => {
      const url = this._apiReverseProxyUrl
      const headers = {
        ...this._headers,
        Authorization: `Bearer ${this._accessToken}`,
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      }

      if (this._debug) {
        console.log('POST', url, { body, headers })
      }

      fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: abortSignal,
      }).catch((err) => {
        const errMessageL = err.toString().toLowerCase()

        if (
          result.text &&
          (errMessageL === 'error: typeerror: terminated' ||
            errMessageL === 'typeerror: terminated')
        ) {
          // OpenAI sometimes forcefully terminates the socket from their end before
          // the HTTP request has resolved cleanly. In my testing, these cases tend to
          // happen when OpenAI has already send the last `response`, so we can ignore
          // the `fetch` error in this case.
          return resolve(result)
        } else {
          return reject(err)
        }
      })
    })

    return responseP
  }
}

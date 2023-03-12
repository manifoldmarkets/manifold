import * as mailgun from 'mailgun-js'
import { tryOrLogError } from 'shared/utils'

const initMailgun = () => {
  const apiKey = process.env.MAILGUN_KEY as string
  return mailgun({ apiKey, domain: 'mg.manifold.markets' })
}

export const sendTextEmail = async (
  to: string,
  subject: string,
  text: string,
  options?: Partial<mailgun.messages.SendData>
) => {
  const data: mailgun.messages.SendData = {
    ...options,
    from: options?.from ?? 'Manifold Markets <info@manifold.markets>',
    to,
    subject,
    text,
    // Don't rewrite urls in plaintext emails
    'o:tracking-clicks': 'htmlonly',
  }
  const mg = initMailgun().messages()
  const result = await tryOrLogError(mg.send(data))
  if (result != null) {
    console.log('Sent text email', to, subject)
  }
  return result
}

export const sendTemplateEmail = async (
  to: string,
  subject: string,
  templateId: string,
  templateData: Record<string, string>,
  options?: Partial<mailgun.messages.SendTemplateData>
) => {
  const data: mailgun.messages.SendTemplateData = {
    ...options,
    from: options?.from ?? 'Manifold Markets <info@manifold.markets>',
    to,
    subject,
    template: templateId,
    'h:X-Mailgun-Variables': JSON.stringify(templateData),
    'o:tag': templateId,
    'o:tracking': true,
  }
  const mg = initMailgun().messages()
  const result = await tryOrLogError(mg.send(data))
  if (result != null) {
    console.log('Sent template email', templateId, to, subject)
  }
  return result
}

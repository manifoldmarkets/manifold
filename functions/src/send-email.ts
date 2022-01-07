import * as mailgun from 'mailgun-js'
import * as functions from 'firebase-functions'

const DOMAIN = 'mg.manifold.markets'
const mg = mailgun({ apiKey: functions.config().mailgun.key, domain: DOMAIN })

export const sendEmail = (to: string, subject: string, text: string) => {
  const data = {
    from: 'Manifold Markets <no-reply@manifold.markets>',
    to,
    subject,
    text,
  }

  return mg.messages().send(data, (error, body) => {
    console.log('Sent email', error, body)
  })
}

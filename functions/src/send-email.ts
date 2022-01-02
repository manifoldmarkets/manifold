import * as mailgun from 'mailgun-js'
import * as functions from 'firebase-functions'

const DOMAIN = 'mg.mantic.markets'
const mg = mailgun({ apiKey: functions.config().mailgun.key, domain: DOMAIN })

export const sendEmail = (to: string, subject: string, text: string) => {
  const data = {
    from: 'Mantic Markets <no-reply@mantic.markets>',
    to,
    subject,
    text,
  }

  return mg.messages().send(data, (error, body) => {
    console.log('Sent email', error, body)
  })
}

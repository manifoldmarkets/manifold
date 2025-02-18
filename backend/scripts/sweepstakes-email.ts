import { runScript } from 'run-script'
import fetch from 'node-fetch'

const MAILGUN_API_KEY = '' // add API key

const TEST_SEND_TO_SELF = process.argv.includes('--test-self') // Add flag to script to send email to yourself to test
const TEST_ONLY_FETCH = process.argv.includes('--test-fetch') // Add flag to script to fetch number of users but don’t send emails

const MY_USER_ID = '' // Update for --test-self email

type SweepstakesUser = {
  id: string
  username: string
  email: string
}

async function getSweepstakesVerifiedUsers(
  pg: any
): Promise<SweepstakesUser[]> {
  const users: SweepstakesUser[] = await pg.manyOrNone(
    `
    SELECT 
      u.id, 
      u.username, 
      pu.data ->> 'email' AS email
    FROM users u
    JOIN private_users pu ON u.id = pu.id
    WHERE u.data ->> 'sweepstakesVerified' = 'true'
    `
  )

  return users.filter((user) => user.email !== null)
}

async function getMyUser(pg: any): Promise<SweepstakesUser | null> {
  const user: SweepstakesUser | null = await pg.oneOrNone(
    `
    SELECT 
      u.id, 
      u.username, 
      pu.data ->> 'email' AS email
    FROM users u
    JOIN private_users pu ON u.id = pu.id
    WHERE u.id = $1
    `,
    [MY_USER_ID]
  )

  return user && user.email ? user : null
}

async function sendBulkEmails(users: SweepstakesUser[]) {
  if (users.length === 0) {
    console.log('No users to send emails to.')
    return
  }

  const mailgunUrl = `https://api.mailgun.net/v3/mg.manifold.markets/messages`

  const recipientData = users.reduce((acc, user) => {
    acc[user.email] = { username: user.username }
    return acc
  }, {} as Record<string, { username: string }>)

  const emailParams = new URLSearchParams()
  emailParams.append('from', 'Manifold <info@manifold.markets>')
  emailParams.append('to', users.map((u) => u.email).join(','))
  emailParams.append(
    'subject',
    '[ACTION REQ] Redeem your sweepcash by March 28th'
  ) // Update to change email subject
  emailParams.append('template', 'manifold announcement template') // Create template in mailgun and update here to send
  emailParams.append('h:X-Mailgun-Variables2', JSON.stringify(recipientData))

  try {
    const response = await fetch(mailgunUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString(
          'base64'
        )}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: emailParams,
    })

    const responseText = await response.text()
    if (!response.ok) {
      throw new Error(
        `Failed to send emails: ${response.status} - ${responseText}`
      )
    }

    console.log('Emails sent successfully:', responseText)
  } catch (error) {
    console.error('Error sending emails:', error)
  }
}

runScript(async ({ pg }) => {
  if (TEST_SEND_TO_SELF) {
    console.log(`Testing: Sending email to myself (User ID: ${MY_USER_ID})`)
    const myUser = await getMyUser(pg)

    if (!myUser) {
      console.log('No email found for the test user.')
      return
    }

    console.log(`Sending test email to: ${myUser.email}`)
    await sendBulkEmails([myUser])
    return
  }

  console.log('Fetching sweepstakes-verified users...')
  const users = await getSweepstakesVerifiedUsers(pg)
  console.log(`Found ${users.length} sweepstakes-verified users.`)

  if (TEST_ONLY_FETCH) {
    console.log(
      'Test mode: Not sending emails. Just logging the number of recipients.'
    )
    return
  }

  await sendBulkEmails(users)
})

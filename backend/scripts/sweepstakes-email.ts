import { runScript } from 'run-script'
import { sendBulkEmails } from 'shared/emails'

const TEST_SEND_TO_SELF = process.argv.includes('--test-self')
const TEST_ONLY_FETCH = process.argv.includes('--test-fetch')
const TEST_ARRAY = process.argv.includes('--test-array')

const MY_USER_ID = 'uglwf3YKOZNGjjEXKc5HampOFRE2'

type SweepstakesUser = {
  id: string
  name: string
  email: string
}

async function getSweepstakesVerifiedUsers(
  pg: any
): Promise<SweepstakesUser[]> {
  const users: SweepstakesUser[] = await pg.manyOrNone(
    `
    SELECT 
      u.id, 
      u.name, 
      pu.data ->> 'email' AS email
    FROM users u
    JOIN private_users pu ON u.id = pu.id
    WHERE u.data ->> 'sweepstakesVerified' = 'true'
    `
  )
  return users.filter((user: SweepstakesUser) => user.email !== null)
}

async function getMyUser(pg: any): Promise<SweepstakesUser | null> {
  const user: SweepstakesUser | null = await pg.oneOrNone(
    `
    SELECT 
      u.id, 
      u.name, 
      pu.data ->> 'email' AS email
    FROM users u
    JOIN private_users pu ON u.id = pu.id
    WHERE u.id = $1
    `,
    [MY_USER_ID]
  )
  return user && user.email ? user : null
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
    await sendBulkEmails(
      '[ACTION REQ] Redeem your sweepcash by March 28th',
      'manifold announcement template',
      [[myUser.email, { name: myUser.name }]]
    )
    return
  }

  if (TEST_ARRAY) {
    const testRecipients: [string, { name: string }][] = [
      ['', { name: 'testname1' }], //add userid and filler name
      ['', { name: 'testname2' }],
      ['', { name: 'testname3' }],
    ]
    console.log(
      'Test mode: Sending bulk email to simulated recipients:',
      testRecipients
    )
    await sendBulkEmails(
      '[ACTION REQ] Redeem your sweepcash by March 28th',
      'manifold announcement template',
      testRecipients
    )
    return
  }

  console.log('Fetching sweepstakes-verified users...')
  const users = await getSweepstakesVerifiedUsers(pg)
  console.log(`Found ${users.length} sweepstakes-verified users.`)

  if (TEST_ONLY_FETCH) {
    console.log('Test mode: Not sending emails. Just logging recipients.')
    return
  }

  const recipients: [string, { name: string }][] = users.map((user) => [
    user.email,
    { name: user.name },
  ])

  await sendBulkEmails(
    '[ACTION REQ] Redeem your sweepcash by March 28th',
    'manifold announcement template',
    recipients
  )
})

import { runScript } from 'run-script'
import { sendBulkEmails } from 'shared/emails'
import { formatSweepies } from 'common/util/format'
import * as readline from 'readline'

const TEST_SEND_TO_SELF = process.argv.includes('--test-self')
const TEST_ONLY_FETCH = process.argv.includes('--test-fetch')
const TEST_ARRAY = process.argv.includes('--test-array')

const MY_USER_ID = 'uglwf3YKOZNGjjEXKc5HampOFRE2'

const EMAIL_SUBJECT = '[Urgent] Last day to redeem your sweepcash on Manifold'

type SweepstakesUser = {
  id: string
  name: string
  email: string
  cash_balance: number
}

function confirmAction(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(`${prompt} (y/N): `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}

async function getUsersWithMinimumCashBalance(
  pg: any,
  minimumBalance: number = 25
): Promise<SweepstakesUser[]> {
  const users: SweepstakesUser[] = await pg.manyOrNone(
    `
    SELECT 
      u.id, 
      u.name, 
      u.cash_balance,
      pu.data ->> 'email' AS email
    FROM users u
    JOIN private_users pu ON u.id = pu.id
    WHERE u.cash_balance >= $1
    `,
    [minimumBalance]
  )
  return users.filter((user: SweepstakesUser) => user.email !== null)
}

async function getMyUser(pg: any): Promise<SweepstakesUser | null> {
  const user: SweepstakesUser | null = await pg.oneOrNone(
    `
    SELECT 
      u.id, 
      u.name, 
      u.cash_balance,
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

    const formattedBalance =
      myUser.cash_balance !== undefined
        ? formatSweepies(myUser.cash_balance)
        : '0'
    console.log(
      `Sending test email to: ${myUser.email} with balance: ${formattedBalance}`
    )
    await sendBulkEmails(EMAIL_SUBJECT, 'manifold announcement template', [
      [myUser.email, { name: myUser.name, cashBalance: formattedBalance }],
    ])
    return
  }

  if (TEST_ARRAY) {
    const testRecipients: [string, { name: string; cashBalance?: string }][] = [
      ['d4vidchee@gmail.com', { name: 'testname1', cashBalance: '100.022345' }],
      [
        'velocity.chee@gmail.com',
        { name: 'testname2', cashBalance: '200.345637' },
      ],
    ]
    console.log(
      'Test mode: Sending bulk email to simulated recipients:',
      testRecipients
    )
    await sendBulkEmails(
      EMAIL_SUBJECT,
      'manifold announcement template',
      testRecipients
    )
    return
  }

  const minimumCashBalance = 25
  console.log(
    `Fetching users with cash balance of ${minimumCashBalance} or more...`
  )
  const users = await getUsersWithMinimumCashBalance(pg, minimumCashBalance)
  console.log(`Found ${users.length} users with sufficient cash balance.`)

  if (TEST_ONLY_FETCH) {
    console.log('Test mode: Not sending emails. Just logging recipients.')

    if (users.length > 0) {
      console.log('Top 5 users by sweepcash balance:')

      const topUsers = users
        .sort((a, b) => (b.cash_balance ?? 0) - (a.cash_balance ?? 0))
        .slice(0, 5)

      topUsers.forEach((user) => {
        const formattedBalance = formatSweepies(user.cash_balance)
        console.log(`- ${user.name} (${user.email}): ${formattedBalance}`)
      })
    }

    return
  }

  const confirmed = await confirmAction(
    `Are you sure you want to send emails to ${users.length} users?`
  )
  if (!confirmed) {
    console.log('Operation cancelled.')
    return
  }

  const recipients: [string, { name: string; cashBalance?: string }][] =
    users.map((user) => [
      user.email,
      {
        name: user.name,
        cashBalance:
          user.cash_balance !== undefined
            ? formatSweepies(user.cash_balance)
            : '0',
      },
    ])

  console.log(`Sending emails to ${recipients.length} users...`)
  await sendBulkEmails(
    EMAIL_SUBJECT,
    'manifold announcement template',
    recipients
  )
  console.log('Emails sent successfully.')
})

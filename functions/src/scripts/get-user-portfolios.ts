import * as admin from 'firebase-admin'
import * as fs from 'fs'

import { initAdmin } from './script-init'
initAdmin()

import { getPrivateUser, getValues } from '../utils'
import { PortfolioMetrics, User } from 'common/user'
import { groupBy, minBy, keyBy, chunk } from 'lodash'
import { filterDefined } from 'common/util/array'

const firestore = admin.firestore()

async function getUserPortfolios() {
  console.log('Get user portfolios')
  const users = await getValues<User>(firestore.collection('users'))
  const usersById = keyBy(users, 'id')

  const privateUsers = await Promise.all(users.map((u) => getPrivateUser(u.id)))
  const privateUsersById = keyBy(privateUsers, 'id')

  // console.log(`Loaded ${users.length} users. Calculating stuff...`)
  const userPortfolioValues: any = {}

  const chunks = chunk(users, 100)
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (user) => {
        console.log(user.id)
        const portfolioValues = await getValues<PortfolioMetrics>(
          firestore
            .collection('users')
            .doc(user.id)
            .collection('portfolioHistory')
            .where('timestamp', '<', 1676437200000)
            .orderBy('timestamp', 'desc')
            // .where('timestamp', '<', 1676523600000)
            .limit(1)
        )
        userPortfolioValues[user.id] = portfolioValues[0]
      })
    )
  }
  console.log('userPortfolioValues', userPortfolioValues)
  const portfolioValues = Object.values(userPortfolioValues) as any[]

  console.log('portfolio values', portfolioValues.length)
  const portfoliosByUserId = filterDefined(
    Object.values(groupBy(portfolioValues, 'userId')).map((values) =>
      minBy(values, 'timestamp')
    )
  )
  console.log('portfoliosByUserId', portfoliosByUserId.length)

  const objects = portfoliosByUserId
    .map((portfolio) => {
      return {
        email: privateUsersById[portfolio.userId]?.email,
        name: usersById[portfolio.userId]?.name,
        portfolioValue: portfolio.balance + portfolio.investmentValue,
      }
    })
    .map((obj) => `${obj.email},${obj.name},${obj.portfolioValue}`)

  const str = objects.join('\n')

  try {
    fs.writeFileSync('./portfolios.csv', str, { flag: 'w+' })
    // file written successfully
  } catch (err) {
    console.error(err)
  }

  console.log(`Finished.`)
}

if (require.main === module) {
  getUserPortfolios()
    .then(() => process.exit())
    .catch(console.log)
}

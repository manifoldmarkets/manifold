import { type APIHandler } from './helpers/endpoint'
import axios from 'axios'
import { log } from 'shared/utils'

export const getSportsFixtures: APIHandler<
  'get-sports-fixtures'
> = async () => {
  log('Fetching sports fixtures')
  const API_URL =
    'https://www.thesportsdb.com/api/v2/json/schedule/next/league/4328'
  const response = await axios.get(API_URL, {
    headers: {
      'X-API-KEY': process.env.SPORTSDB_KEY,
    },
  })
  return {schedule: response.data.schedule } 
}

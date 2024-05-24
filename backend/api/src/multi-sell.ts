import * as admin from 'firebase-admin'
import { APIError, type APIHandler } from './helpers/endpoint'
import { Answer } from 'common/answer'
import { onCreateBets } from 'api/on-create-bet'
import {
  getUnfilledBetsAndUserBalances,
  processNewBetResult,
} from 'api/place-bet'
import { getContractSupabase, getUser, log } from 'shared/utils'
import * as crypto from 'crypto'
import { groupBy, mapValues, sum, sumBy } from 'lodash'
import { getCpmmMultiSellSharesInfo } from 'common/sell-bet'
import { incrementBalance } from 'shared/supabase/users'
import { runEvilTransaction } from 'shared/evil-transaction'
import { convertBet } from 'common/supabase/bets'

export const multiSell: APIHandler<'multi-sell'> = async (props, auth) => {
  throw new APIError(500, 'This endpoint is disabled.')
}

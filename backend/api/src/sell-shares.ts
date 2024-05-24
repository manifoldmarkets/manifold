import { mapValues, groupBy, sumBy } from 'lodash'
import * as admin from 'firebase-admin'
import { APIError, type APIHandler } from './helpers/endpoint'
import { Contract, CPMM_MIN_POOL_QTY } from 'common/contract'
import { getCpmmMultiSellBetInfo, getCpmmSellBetInfo } from 'common/sell-bet'
import { removeUndefinedProps } from 'common/util/object'
import { floatingEqual, floatingLesserEqual } from 'common/util/math'
import { getUnfilledBetsAndUserBalances, updateMakers } from './place-bet'
import { removeUserFromContractFollowers } from 'shared/follow-market'
import { Answer } from 'common/answer'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { onCreateBets } from 'api/on-create-bet'
import { getUser, log } from 'shared/utils'
import * as crypto from 'crypto'
import { formatMoneyWithDecimals } from 'common/util/format'
import { incrementBalance } from 'shared/supabase/users'
import { runEvilTransaction } from 'shared/evil-transaction'
import { cancelLimitOrders, insertBet } from 'shared/supabase/bets'
import { convertBet } from 'common/supabase/bets'

export const sellShares: APIHandler<'market/:contractId/sell'> = async (
  props,
  auth
) => {
  throw new APIError(500, 'This endpoint is disabled.')
}

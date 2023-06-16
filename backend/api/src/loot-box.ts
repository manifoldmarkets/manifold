import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { createSupabaseClient } from 'shared/supabase/init'
import { SupabaseClient } from '@supabase/supabase-js'

import { User } from 'common/user'
import { APIError, authEndpoint } from './helpers'
import { LootBoxPuchaseTxn } from 'common/txn'
import { BinaryContract, CPMMContract } from 'common/contract'
import { getProbability } from 'common/calculate'
import { LOOTBOX_COST, createLootBox, createLootBet } from 'common/loot-box'
import { redeemShares } from './redeem-shares'
import { sum } from 'lodash'

export const lootbox = authEndpoint(async (req, auth) => {
  const firestore = admin.firestore()
  const db = createSupabaseClient()

  const box = await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) throw new APIError(400, 'User not found')
    const user = userSnap.data() as User

    if (user.balance < LOOTBOX_COST)
      throw new APIError(400, 'Insufficient balance')

    const contracts = await loadUserContracts(db, auth.uid)
    if (contracts.length === 0) throw new APIError(400, 'No contracts found')

    const box = createLootBox(contracts)
    console.log(
      'Created loot box for',
      user.name,
      box.map((b) => ({ ...b, contract: b.contract.slug }))
    )

    const betPaths = []
    for (const { contract, outcome, amount, shares } of box) {
      const newBet = createLootBet(
        user,
        contract,
        outcome,
        getProbability(contract),
        amount,
        shares
      )

      const betDoc = firestore.collection(`contracts/${contract.id}/bets`).doc()
      betPaths.push(betDoc.path)
      transaction.create(betDoc, { ...newBet, id: betDoc.id })
    }

    transaction.update(userDoc, {
      balance: FieldValue.increment(-LOOTBOX_COST),
      // don't change totalDeposits; user is receiving shares of equal value
    })

    const newTxnDoc = firestore.collection('txns').doc()
    const txn: LootBoxPuchaseTxn = {
      id: newTxnDoc.id,
      createdTime: Date.now(),
      fromId: auth.uid,
      fromType: 'USER',
      toId: 'BANK',
      toType: 'BANK',
      amount: LOOTBOX_COST,
      category: 'LOOTBOX_PURCHASE',
      token: 'M$',
      data: { betPaths },
    }
    transaction.create(newTxnDoc, txn)

    transaction.create(firestore.collection('loot-boxes').doc(), {
      createdTime: Date.now(),
      username: user.username,
      userId: user.id,
      value: sum(box.map((b) => b.amount)),
      box,
      betPaths,
    })

    return box
  })

  await Promise.all(
    box.map((b) => redeemShares(auth.uid, b.contract as CPMMContract))
  )

  return { success: true, box }
})

const loadUserContracts = async (db: SupabaseClient, userId: string, n = 100) =>
  db
    .rpc('get_recommended_contracts_embeddings', {
      uid: userId,
      n,
      excluded_contract_ids: [],
    })
    .then((res) =>
      (res.data ?? [])
        .map((row) => row.data as BinaryContract)
        .filter((c) => c.outcomeType === 'BINARY' && c.volume > 100 && c.visibility === 'public')
    )

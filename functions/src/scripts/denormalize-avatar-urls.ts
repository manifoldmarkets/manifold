// Script for lining up users and contracts/comments to make sure the denormalized avatar URLs in the contracts and
// comments match the user avatar URLs.

import * as admin from 'firebase-admin'
import { initAdmin } from './script-init'
import {
  DocumentCorrespondence,
  findDiffs,
  describeDiff,
  applyDiff,
} from './denormalize'
import { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'

initAdmin()
const firestore = admin.firestore()

async function getUsersById(
  transaction: Transaction
): Promise<Map<string, DocumentSnapshot>> {
  const results = new Map()
  const users = await transaction.get(firestore.collection('users'))
  users.forEach((doc) => {
    results.set(doc.get('id'), doc)
  })
  console.log(`Found ${results.size} unique users.`)
  return results
}

async function getContractsByUserId(
  transaction: Transaction
): Promise<Map<string, DocumentSnapshot[]>> {
  let n = 0
  const results = new Map()
  const contracts = await transaction.get(firestore.collection('contracts'))
  contracts.forEach((doc) => {
    let creatorId = doc.get('creatorId')
    let creatorContracts = results.get(creatorId) || []
    creatorContracts.push(doc)
    results.set(creatorId, creatorContracts)
    n++
  })
  console.log(`Found ${n} contracts from ${results.size} unique users.`)
  return results
}

async function getCommentsByUserId(
  transaction: Transaction
): Promise<Map<string, DocumentSnapshot[]>> {
  let n = 0
  let results = new Map()
  let comments = await transaction.get(firestore.collectionGroup('comments'))
  comments.forEach((doc) => {
    let userId = doc.get('userId')
    let userComments = results.get(userId) || []
    userComments.push(doc)
    results.set(userId, userComments)
    n++
  })
  console.log(`Found ${n} comments from ${results.size} unique users.`)
  return results
}

async function getAnswersByUserId(
  transaction: Transaction
): Promise<Map<string, DocumentSnapshot[]>> {
  let n = 0
  let results = new Map()
  let answers = await transaction.get(firestore.collectionGroup('answers'))
  answers.forEach((doc) => {
    let userId = doc.get('userId')
    let userAnswers = results.get(userId) || []
    userAnswers.push(doc)
    results.set(userId, userAnswers)
    n++
  })
  console.log(`Found ${n} answers from ${results.size} unique users.`)
  return results
}

if (require.main === module) {
  admin.firestore().runTransaction(async (transaction) => {
    let [usersById, contractsByUserId, commentsByUserId, answersByUserId] =
      await Promise.all([
        getUsersById(transaction),
        getContractsByUserId(transaction),
        getCommentsByUserId(transaction),
        getAnswersByUserId(transaction),
      ])

    let usersContracts = Array.from(
      usersById.entries(),
      ([id, doc]): DocumentCorrespondence => {
        return [doc, contractsByUserId.get(id) || []]
      }
    )
    let contractDiffs = findDiffs(
      usersContracts,
      'avatarUrl',
      'creatorAvatarUrl'
    )
    console.log(`Found ${contractDiffs.length} contracts with mismatches.`)
    contractDiffs.forEach((d) => {
      console.log(describeDiff(d))
      applyDiff(transaction, d)
    })

    let usersComments = Array.from(
      usersById.entries(),
      ([id, doc]): DocumentCorrespondence => {
        return [doc, commentsByUserId.get(id) || []]
      }
    )
    let commentDiffs = findDiffs(usersComments, 'avatarUrl', 'userAvatarUrl')
    console.log(`Found ${commentDiffs.length} comments with mismatches.`)
    commentDiffs.forEach((d) => {
      console.log(describeDiff(d))
      applyDiff(transaction, d)
    })

    let usersAnswers = Array.from(
      usersById.entries(),
      ([id, doc]): DocumentCorrespondence => {
        return [doc, answersByUserId.get(id) || []]
      }
    )
    let answerDiffs = findDiffs(usersAnswers, 'avatarUrl', 'avatarUrl')
    console.log(`Found ${answerDiffs.length} answers with mismatches.`)
    answerDiffs.forEach((d) => {
      console.log(describeDiff(d))
      applyDiff(transaction, d)
    })
  })
}

// Takes a tag and makes a new group with all the contracts in it.

import * as admin from 'firebase-admin'
import { initAdmin } from './script-init'
import { isProd, log } from '../utils'
import { getSlug } from '../create-group'
import { Group } from '../../../common/group'

const getTaggedContractIds = async (tag: string) => {
  const firestore = admin.firestore()
  const results = await firestore
    .collection('contracts')
    .where('lowercaseTags', 'array-contains', tag.toLowerCase())
    .get()
  return results.docs.map((d) => d.id)
}

const createGroup = async (
  name: string,
  about: string,
  contractIds: string[]
) => {
  const firestore = admin.firestore()
  const creatorId = isProd()
    ? 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2'
    : '94YYTk1AFWfbWMpfYcvnnwI1veP2'

  const slug = await getSlug(name)
  const groupRef = firestore.collection('groups').doc()
  const now = Date.now()
  const group: Group = {
    id: groupRef.id,
    creatorId,
    slug,
    name,
    about,
    createdTime: now,
    mostRecentActivityTime: now,
    contractIds: contractIds,
    anyoneCanJoin: true,
    memberIds: [],
  }
  return await groupRef.create(group)
}

const convertTagToGroup = async (tag: string, groupName: string) => {
  log(`Looking up contract IDs with tag ${tag}...`)
  const contractIds = await getTaggedContractIds(tag)
  log(`${contractIds.length} contracts found.`)
  if (contractIds.length > 0) {
    log(`Creating group ${groupName}...`)
    const about = `Contracts that used to be tagged ${tag}.`
    const result = await createGroup(groupName, about, contractIds)
    log(`Done. Group: `, result)
  }
}

if (require.main === module) {
  initAdmin()
  const args = process.argv.slice(2)
  if (args.length != 2) {
    console.log('Usage: convert-tag-to-group [tag] [group-name]')
  } else {
    convertTagToGroup(args[0], args[1]).catch((e) => console.error(e))
  }
}

// Takes a tag and makes a new group with all the contracts in it.

import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { isProd, log } from 'shared/utils'
import { getSlug } from 'api/create-group'
import { Group, GroupLink } from 'common/group'
import { uniq } from 'lodash'
import { Contract } from 'common/contract'

const getTaggedContracts = async (tag: string) => {
  const firestore = admin.firestore()
  const results = await firestore
    .collection('contracts')
    .where('lowercaseTags', 'array-contains', tag.toLowerCase())
    .get()
  return results.docs.map((d) => d.data() as Contract)
}

const createGroup = async (
  name: string,
  about: string,
  contracts: Contract[]
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
    anyoneCanJoin: true,
    totalContracts: contracts.length,
    totalMembers: 1,
    postIds: [],
    pinnedItems: [],
    privacyStatus: 'public',
    bannerUrl: '/group/default_group_banner_indigo.png',
  }
  await groupRef.create(group)
  // create a GroupMemberDoc for the creator
  const memberDoc = groupRef.collection('groupMembers').doc(creatorId)
  await memberDoc.create({
    userId: creatorId,
    createdTime: now,
  })

  // create GroupContractDocs for each contractId
  await Promise.all(
    contracts
      .map((c) => c.id)
      .map((contractId) =>
        groupRef.collection('groupContracts').doc(contractId).create({
          contractId,
          createdTime: now,
        })
      )
  )
  for (const market of contracts) {
    if (market.groupLinks?.some((l) => l.groupId === group.id)) continue // already in that group

    const newGroupLinks = [
      ...(market.groupLinks ?? []),
      {
        groupId: group.id,
        createdTime: Date.now(),
        slug: group.slug,
        name: group.name,
      } as GroupLink,
    ]
    await firestore
      .collection('contracts')
      .doc(market.id)
      .update({
        groupSlugs: uniq([...(market.groupSlugs ?? []), group.slug]),
        groupLinks: newGroupLinks,
      })
  }
  return { status: 'success', group: group }
}

const convertTagToGroup = async (tag: string, groupName: string) => {
  log(`Looking up contract IDs with tag ${tag}...`)
  const contracts = await getTaggedContracts(tag)
  log(`${contracts.length} contracts found.`)
  if (contracts.length > 0) {
    log(`Creating group ${groupName}...`)
    const about = `Contracts that used to be tagged ${tag}.`
    const result = await createGroup(groupName, about, contracts)
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

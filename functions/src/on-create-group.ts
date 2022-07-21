import * as functions from 'firebase-functions'
import { getUser } from './utils'
import { createNotification } from './create-notification'
import { Group } from '../../common/group'

export const onCreateGroup = functions.firestore
  .document('groups/{groupId}')
  .onCreate(async (change, context) => {
    const group = change.data() as Group
    const { eventId } = context

    const groupCreator = await getUser(group.creatorId)
    if (!groupCreator) throw new Error('Could not find group creator')
    // create notifications for all members of the group
    for (const memberId of group.memberIds) {
      await createNotification(
        group.id,
        'group',
        'created',
        groupCreator,
        eventId,
        group.about,
        {
          relatedUserId: memberId,
          slug: group.slug,
          title: group.name,
        }
      )
    }
  })

import { removeUndefinedProps } from 'common/util/object'
import * as admin from 'firebase-admin'
import { APIHandler } from './helpers/endpoint'
import { mapValues } from 'lodash'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'

export const updatePrivateUser: APIHandler<'me/private/update'> = async (
  props,
  auth
) => {
  await firestore
    .collection('private-users')
    .doc(auth.uid)
    .update(
      removeUndefinedProps(
        mapValues(props, (v) =>
          v === null ? admin.firestore.FieldValue.delete() : v
        )
      )
    )

  broadcastUpdatedPrivateUser(auth.uid)
}

const firestore = admin.firestore()

import { removeUndefinedProps } from 'common/util/object'
import * as admin from 'firebase-admin'
import { APIHandler } from './helpers/endpoint'

export const updatePrivateUser: APIHandler<'update-private-user'> = async (
  props,
  auth
) => {
  await firestore
    .collection('private-users')
    .doc(auth.uid)
    .update(removeUndefinedProps(props))
}

const firestore = admin.firestore()

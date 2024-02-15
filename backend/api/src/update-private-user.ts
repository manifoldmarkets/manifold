import { removeUndefinedProps } from 'common/util/object'
import * as admin from 'firebase-admin'
import { deleteField } from 'firebase/firestore'
import { APIHandler } from './helpers/endpoint'
import { mapValues } from 'lodash'

export const updatePrivateUser: APIHandler<'update-private-user'> = async (
  props,
  auth
) => {
  await firestore
    .collection('private-users')
    .doc(auth.uid)
    .update(
      removeUndefinedProps(
        mapValues(props, (v) => (v === null ? deleteField() : v))
      )
    )
}

const firestore = admin.firestore()

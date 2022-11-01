import { Cert } from 'common/cert'
import { slugify } from 'common/util/slugify'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from './init'
import { User } from './users'

export async function getCert(certId: string): Promise<Cert | null> {
  const certDoc = doc(db, 'certs', certId)
  const certSnap = await getDoc(certDoc)
  return certSnap.exists() ? (certSnap.data() as Cert) : null
}

export async function getCertFromSlug(slug: string) {
  const q = query(collection(db, 'certs'), where('slug', '==', slug))
  const snapshot = await getDocs(q)
  return snapshot.empty ? undefined : (snapshot.docs[0].data() as Cert)
}

export async function listAllCerts(): Promise<Cert[]> {
  const snapshot = await getDocs(collection(db, 'certs'))
  return snapshot.docs.map((doc) => doc.data() as Cert)
}

export async function createCert(partialCert: Partial<Cert>, creator: User) {
  const newRef = doc(collection(db, 'certs'))
  const cert: Cert = {
    id: newRef.id,
    slug: slugify(partialCert.title ?? newRef.id),
    creatorId: creator.id,
    creatorName: creator.name,
    creatorUsername: creator.username,
    creatorAvatarUrl: creator.avatarUrl ?? '',

    title: partialCert.title ?? '',
    description: '',

    createdTime: Date.now(),
    lastUpdatedTime: Date.now(),

    ...partialCert,
  }
  // Create a new cert in Firebase
  await setDoc(newRef, cert)
}

export async function transferShares(
  certId: string,
  fromUserId: string,
  toUserId: string,
  amount: number
) {}

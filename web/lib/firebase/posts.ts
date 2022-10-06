import {
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { DateDoc, Post } from 'common/post'
import {
  coll,
  getValue,
  getValues,
  listenForValue,
  listenForValues,
} from './utils'
import { getUserByUsername } from './users'

export const posts = coll<Post>('posts')

export function postPath(postSlug: string) {
  return `/post/${postSlug}`
}

export function updatePost(post: Post, updates: Partial<Post>) {
  return updateDoc(doc(posts, post.id), updates)
}

export function deletePost(post: Post) {
  return deleteDoc(doc(posts, post.id))
}

export function getPost(postId: string) {
  return getValue<Post>(doc(posts, postId))
}

export async function getPostBySlug(slug: string) {
  const q = query(posts, where('slug', '==', slug))
  const docs = (await getDocs(q)).docs
  return docs.length === 0 ? null : docs[0].data()
}

export function listenForPost(
  postId: string,
  setPost: (post: Post | null) => void
) {
  return listenForValue(doc(posts, postId), setPost)
}

export async function listPosts(postIds?: string[]) {
  if (postIds === undefined) return []
  return Promise.all(postIds.map(getPost))
}

export async function getDateDocs() {
  const q = query(posts, where('type', '==', 'date-doc'))
  return getValues<DateDoc>(q)
}

export function listenForDateDocs(setDateDocs: (dateDocs: DateDoc[]) => void) {
  const q = query(posts, where('type', '==', 'date-doc'))
  return listenForValues<DateDoc>(q, setDateDocs)
}

export async function getDateDoc(username: string) {
  const user = await getUserByUsername(username)
  if (!user) return null

  const q = query(
    posts,
    where('type', '==', 'date-doc'),
    where('creatorId', '==', user.id)
  )
  const docs = await getValues<DateDoc>(q)
  const post = docs.length === 0 ? null : docs[0]
  return { post, user }
}

import {
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { Post } from 'common/post'
import { coll, getValue, listenForValue } from './utils'

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

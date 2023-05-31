import { Post } from 'common/post'
import { deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { coll } from './utils'

const posts = coll<Post>('posts')

export function updatePost(post: Post, updates: Partial<Post>) {
  return updateDoc(doc(posts, post.id), updates)
}

export function deletePost(post: Post) {
  return deleteDoc(doc(posts, post.id))
}

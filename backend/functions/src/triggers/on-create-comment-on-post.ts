import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'
import { getPost } from 'shared/utils'

export const onCreateCommentOnPost = functions
  .runWith({ secrets })
  .firestore.document('posts/{postId}/comments/{commentId}')
  .onCreate(async (snapshot, context) => {
    const { postId } = context.params as {
      postId: string
    }

    const post = await getPost(postId)

    if (!post) throw new Error('Could not find post corresponding with comment')
    if (post) {
      console.log(post?.commentCount ?? 0)
      await snapshot.ref.parent.parent?.update({
        commentCount: (post?.commentCount ?? 0) + 1,
      })
    }
  })

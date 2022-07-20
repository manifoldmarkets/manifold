import type { CommentResolvers, Resolvers } from 'web/generated/graphql_api'

const commentResolvers: CommentResolvers = {
  market: async (comment) => comment.contract,

  answers: async (comment, _, { dataSources }) => {
    const result = await dataSources.firebaseAPI.listAllCommentAnswers(
      comment.id,
      comment.contract.id
    )

    return result.map((el) => ({
      ...el,
      contract: comment.contract,
    }))
  },

  user: async (comment) => ({
    id: comment.userId,
    avatarUrl: comment.userAvatarUrl,
    name: comment.userName,
    username: comment.userUsername,
  }),
}

const resolvers: Resolvers = {
  Comment: commentResolvers,
}

export default resolvers

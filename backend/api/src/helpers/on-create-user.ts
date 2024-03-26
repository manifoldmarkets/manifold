import { getUser, isProd } from 'shared/utils'
import { PrivateUser, User } from 'common/user'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { createPrivateUserMessageChannelMain } from 'api/create-private-user-message-channel'
import { JSONContent } from '@tiptap/core'
import { ChatVisibility } from 'common/chat-message'
import { createPrivateUserMessageMain } from 'api/create-private-user-message'
import { addNewUserToLeague } from 'shared/generate-leagues'
import { createReferralsProgramNotification } from 'shared/create-notification'
import { sendWelcomeEmail } from 'shared/emails'

export const onCreateUser = async (user: User, privateUser: PrivateUser) => {
  const pg = createSupabaseDirectClient()
  await addNewUserToLeague(pg, user.id)
  await createReferralsProgramNotification(user.id, pg)
  await createIntroHelpMessage(user)
  await sendWelcomeEmail(user, privateUser)
}
const createIntroHelpMessage = async (newUser: User) => {
  const pg = createSupabaseDirectClient()
  // const random = Math.round(Math.random() * NEW_USER_HERLPER_IDS.length)
  const creator = (await getUser(
    isProd() ? 'AJwLWoo3xue32XIiAVrL5SyR1WB2' : '6hHpzvRG0pMq8PNJs7RZj2qlZGn2'
  ))!

  const { channelId } = await createPrivateUserMessageChannelMain(
    creator.id,
    [creator.id, newUser.id],
    pg
  )
  const messages = [[introSystemMessage(newUser.name), 'introduction']] as [
    JSONContent,
    ChatVisibility
  ][]

  await Promise.all(
    messages.map(async ([message, visibility]) => {
      await createPrivateUserMessageMain(
        creator,
        channelId,
        message,
        pg,
        visibility
      )
    })
  )
}
const introSystemMessage = (userName: string) =>
  ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            text: `Hi ${userName}, I help out as moderator here. Let me know if you have any questions!`,
            type: 'text',
          },
        ],
      },
    ],
  } as JSONContent)

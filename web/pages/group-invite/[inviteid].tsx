import { GroupInvite } from 'common/group-invite'
import { getInvite } from 'common/supabase/group-invites'
import { getGroup } from 'common/supabase/groups'
import dayjs from 'dayjs'
import Lottie from 'react-lottie'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { fromNow } from 'web/lib/util/time'
import * as invitation from '../../public/lottie/invitation.json'
import { Button } from 'web/components/buttons/button'
import { firebaseLogin } from 'web/lib/firebase/users'
import {
  getUserIsGroupMember,
  joinGroupThroughInvite,
} from 'web/lib/firebase/api'
import { useIsGroupMember } from 'web/hooks/use-group-supabase'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { useState } from 'react'
import { useRouter } from 'next/router'

export async function getStaticProps(props: { params: { inviteid: string } }) {
  const { inviteid } = props.params
  const adminDb = await initSupabaseAdmin()
  const invite: GroupInvite = (await getInvite(inviteid, adminDb)) || null
  const group = invite ? await getGroup(invite.group_id, adminDb) : null
  return { props: { invite, groupName: group?.name, groupSlug: group?.slug } }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function GroupInvitePage(props: {
  invite: GroupInvite
  groupName: string
  groupSlug: string
}) {
  const { invite, groupName, groupSlug } = props
  console.log(invite, groupName)
  const whenExpires = dayjs(invite.expire_time).fromNow()
  const isExpired = invite.expire_time <= new Date()
  const isAuth = useIsAuthorized()
  const user = useUser()
  const isAlreadyGroupMember = useIsGroupMember(groupSlug)
  let errorMessage
  errorMessage = isExpired
    ? 'This invite has expired'
    : invite.is_max_uses_reached
    ? 'This invite has already reached its max uses'
    : isAlreadyGroupMember
    ? 'You are already a member of this group!'
    : null
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  return (
    <Page>
      <Col className="h-[80vh] w-full items-center justify-center">
        <Col className="bg-canvas-0 mx-8 my-auto max-w-lg gap-4 rounded-xl px-8  pt-4 pb-12 drop-shadow-lg">
          <Col className="gap-1">
            {invite.expire_time !== null && (
              <Row className="w-full justify-end">
                <div
                  className={clsx(
                    'text-sm',
                    isExpired ? 'text-red-600' : 'text-gray-400'
                  )}
                >
                  {isExpired
                    ? `Expired ${whenExpires}`
                    : `Expires ${whenExpires}`}
                </div>
              </Row>
            )}
            {invite.max_uses !== null && (
              <Row className="w-full justify-end">
                <div
                  className={clsx(
                    'text-sm',
                    invite.is_max_uses_reached
                      ? 'text-red-600'
                      : 'text-gray-400'
                  )}
                >
                  {invite.uses}/{invite.max_uses} uses
                </div>
              </Row>
            )}
          </Col>
          <Lottie
            options={{
              loop: true,
              autoplay: true,
              animationData: invitation,
              rendererSettings: {
                preserveAspectRatio: 'xMidYMid slice',
              },
            }}
            height={200}
            width={200}
            isStopped={false}
            isPaused={false}
            style={{
              color: '#6366f1',
              pointerEvents: 'none',
              background: 'transparent',
            }}
          />
          <div>
            You've been invited to join <b>{groupName}</b>!
          </div>
          <Col className="gap-1">
            <Button
              size="sm"
              loading={loading}
              onClick={async () => {
                if (!isAuth || !user) return firebaseLogin()
                setLoading(true)
                try {
                  await joinGroupThroughInvite({ inviteId: invite.id })
                  const intervalId = setInterval(async () => {
                    // Call the callback function to poll
                    const result = await getUserIsGroupMember({ groupSlug })

                    // Check if we got the result we were looking for
                    if (result.isGroupMember) {
                      // Clear the interval
                      clearInterval(intervalId)
                      // setLoading(false)
                      router.push(`/group/${groupSlug}`)
                    }
                  }, 500)
                } catch (e) {
                  errorMessage = e as string
                }
                // setLoading(false)
              }}
              disabled={
                isAlreadyGroupMember || isExpired || invite.is_max_uses_reached
              }
            >
              {loading ? 'Accepting Invite...' : 'Accept Invite'}
            </Button>
            {errorMessage && (
              <div className="text-sm text-red-600">{errorMessage}</div>
            )}
          </Col>
        </Col>
      </Col>
    </Page>
  )
}

// async function rerouteOnceSupabaseUserExists(
//   pollingIntervalMs: number,
//   groupSlug: string
//   router: Next
// ) {
//   // Set an interval to poll every x seconds
//   const intervalId = setInterval(async () => {
//     // Call the callback function to poll
//     const result = await getUserIsGroupMember({ groupSlug })
//     Router.push(`/group/${groupSlug}`)

//     // Check if we got the result we were looking for
//     if (result.isGroupMember) {
//       // Clear the interval
//       clearInterval(intervalId)
//     }
//   }, pollingIntervalMs)
// }

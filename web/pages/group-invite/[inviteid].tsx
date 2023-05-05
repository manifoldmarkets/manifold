import { getInvite } from 'common/group-invite'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { useUser } from 'web/hooks/use-user'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: { params: { inviteid: string } }) {
  const { inviteid } = props.params
  const adminDb = await initSupabaseAdmin()
  const invite = (await getInvite(inviteid, adminDb)) || null
  return { props: { invite } }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function GroupInvitePage(props: { invite: any }) {
  props = usePropz(props, getStaticPropz) ?? {}
  console.log(props.invite)

  const user = useUser()
  return <></>
}

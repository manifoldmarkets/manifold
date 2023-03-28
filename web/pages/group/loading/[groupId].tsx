import { groupPath } from 'common/group'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { getGroup } from 'web/lib/supabase/group'
import { LoadingNewThing } from 'web/pages/loading/[contractId]'

export async function getStaticProps(props: { params: { groupId: string } }) {
  const { groupId } = props.params
  return {
    props: {
      groupId,
    },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function LoadingNewGroup(props: { groupId: string }) {
  const { groupId } = props
  const router = useRouter()
  const pingInterval = 200
  useEffect(() => {
    const interval = setInterval(waitForGroup, pingInterval) // Adjust the interval as needed

    async function waitForGroup() {
      const newGroup = await getGroup(groupId)
      if (newGroup) {
        clearInterval(interval)
        router.replace(groupPath(newGroup.slug)).catch((e) => {
          console.log(e)
        })
      }
    }
    return () => {
      clearInterval(interval)
    }
  }, [])

  return <LoadingNewThing thing={'group'} />
}

import { Group, groupPath } from 'common/group'
import { NextRouter, useRouter } from 'next/router'
import { useEffect } from 'react'
import Lottie from 'react-lottie'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { getGroup } from 'web/lib/supabase/group'
import { LoadingNewThing } from 'web/pages/loading/[contractId]'
import loading from '../../../public/lottie/loading-icon.json'

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
    let interval: string | number | NodeJS.Timeout | undefined

    async function waitForGroup() {
      const newGroup = await getGroup(groupId)
      if (newGroup) {
        clearInterval(interval)
        router.replace(groupPath(newGroup.slug)).catch((e) => {
          console.log(e)
        })
      }
    }

    interval = setInterval(waitForGroup, pingInterval) // Adjust the interval as needed

    return () => {
      clearInterval(interval)
    }
  }, [])

  return <LoadingNewThing thing={'group'} />
}

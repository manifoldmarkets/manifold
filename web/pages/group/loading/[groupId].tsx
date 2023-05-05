import { groupPath } from 'common/group'
import { debounce } from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useRef } from 'react'
import Lottie from 'react-lottie'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import loading from '../../../public/lottie/loading-icon.json'
import { getGroup } from 'common/supabase/groups'
import { db } from 'web/lib/supabase/db'

export const LOADING_PING_INTERVAL = 100

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
  const waitForGroup = useRef(
    debounce(fetchGroup, LOADING_PING_INTERVAL)
  ).current

  async function fetchGroup() {
    const newGroup = await getGroup(groupId, db)
    if (newGroup) {
      router.replace(groupPath(newGroup.slug)).catch((e) => {
        console.log(e)
      })
    } else {
      waitForGroup()
    }
  }

  useEffect(() => {
    waitForGroup()
  }, [])

  return <LoadingNewThing thing={'group'} />
}

export function LoadingNewThing(props: { thing: 'group' | 'contract' }) {
  const { thing } = props
  return (
    <Page>
      <Col className=" mt-40 w-full items-center justify-center">
        <Col>
          <Lottie
            options={{
              loop: true,
              autoplay: true,
              animationData: loading,
              rendererSettings: {
                preserveAspectRatio: 'xMidYMid slice',
              },
            }}
            width={100}
            isStopped={false}
            isPaused={false}
            style={{
              color: '#6366f1',
              pointerEvents: 'none',
              background: 'transparent',
            }}
          />
        </Col>
        <div className="mt-6">Creating new {thing}...</div>
      </Col>
    </Page>
  )
}

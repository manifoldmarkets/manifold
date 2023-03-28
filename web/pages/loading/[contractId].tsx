import { Contract, contractPath } from 'common/contract'
import { Group, groupPath } from 'common/group'
import { NextRouter, useRouter } from 'next/router'
import { useEffect } from 'react'
import Lottie from 'react-lottie'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { getContract } from 'web/lib/supabase/contracts'
import { getGroup } from 'web/lib/supabase/group'
import loading from '../../public/lottie/loading-icon.json'

export async function getStaticProps(props: {
  params: { contractId: string }
}) {
  const { contractId } = props.params
  return {
    props: {
      contractId,
    },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function LoadingNewContract(props: { contractId: string }) {
  const { contractId } = props
  const router = useRouter()
  const pingInterval = 200
  useEffect(() => {
    let interval: string | number | NodeJS.Timeout | undefined

    async function waitForContract() {
      const newContract = await getContract(contractId)
      if (newContract) {
        clearInterval(interval)
        router.replace(contractPath(newContract as Contract)).catch((e) => {
          console.log(e)
        })
      }
    }

    interval = setInterval(waitForContract, pingInterval) // Adjust the interval as needed

    return () => {
      clearInterval(interval)
    }
  }, [])

  return <LoadingNewThing thing={'contract'} />
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

import { Contract, contractPath } from 'common/contract'
import { groupPath } from 'common/group'
import { debounce } from 'lodash'
import { NextRouter, useRouter } from 'next/router'
import { useEffect, useRef } from 'react'
import Lottie from 'react-lottie'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { getContract } from 'web/lib/supabase/contracts'
import { getGroup } from 'web/lib/supabase/group'
import { LOADING_PING_INTERVAL } from 'web/pages/group/loading/[groupId]'
import { Button } from '../buttons/button'
import { Row } from '../layout/row'

export default function WaitingForSupabaseButton(props: {
  contractId: string
  router: NextRouter
}) {
  const { contractId } = props
  const router = useRouter()
  const waitForContract = useRef(
    debounce(fetchContract, LOADING_PING_INTERVAL)
  ).current

  async function fetchContract() {
    const newContract = await getContract(contractId)
    if (newContract) {
      router.replace(contractPath(newContract as Contract)).catch((e) => {
        console.log(e)
      })
    } else {
      waitForContract()
    }
  }

  useEffect(() => {
    waitForContract()
  }, [])

  return (
    <Row className="w-full justify-center">
      <Button
        className="w-full"
        type="submit"
        color="indigo"
        size="xl"
        loading={true}
      >
        Creating...
      </Button>
    </Row>
  )
}

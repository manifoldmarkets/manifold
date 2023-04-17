import { Contract, contractPath } from 'common/contract'
import { debounce } from 'lodash'
import { NextRouter, useRouter } from 'next/router'
import { useEffect, useRef } from 'react'
import { getContract, getContractWithFields } from 'web/lib/supabase/contracts'
import { LOADING_PING_INTERVAL } from 'web/pages/group/loading/[groupId]'
import { Button } from '../buttons/button'

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
    const newContract = await getContractWithFields(contractId)
    if (newContract && newContract.visibility && newContract.slug) {
      router.push(contractPath(newContract as Contract)).catch((e) => {
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
    <Button
      className="w-full"
      type="submit"
      color="indigo"
      size="xl"
      loading={true}
    >
      Creating...
    </Button>
  )
}

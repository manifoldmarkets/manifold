import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useAdmin, useTrusted } from 'web/hooks/use-admin'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { ContractHistoryButton } from './contract-edit-history-button'
import { ShareEmbedButton, ShareIRLButton } from '../buttons/share-embed-button'
import { ShareQRButton } from '../buttons/share-qr-button'
import SuperBanControl from '../SuperBanControl'
import { Stats } from './contract-info-dialog'
import router from 'next/router'
import toast from 'react-hot-toast'
import { api } from 'web/lib/api/api'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { APIError } from 'common/api/utils'

export function TwombaContractInfoDialog(props: {
  playContract: Contract
  statsContract: Contract
  user: User | null | undefined
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { playContract, statsContract, user, open, setOpen } = props
  const isAdmin = useAdmin()
  const isTrusted = useTrusted()

  const convertToCashMarket = async () => {
    try {
      await api('create-cash-contract', {
        manaContractId: playContract.id,
        subsidyAmount: 100, // You may want to make this configurable
      })
      toast.success('Market converted to cash market successfully')
      router.reload()
    } catch (error) {
      if (error instanceof APIError) {
        toast.error(error.message)
        console.error(error.details)
      } else {
        toast.error('Failed to convert market to cash market')
        console.error(error)
      }
    }
  }

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 flex flex-col gap-4 rounded p-6"
    >
      <Stats contract={statsContract} user={user} />

      {!!user && (
        <>
          <Row className="my-2 flex-wrap gap-2">
            <ContractHistoryButton contract={playContract} />
            <ShareQRButton contract={playContract} />
            <ShareIRLButton contract={playContract} />
            <ShareEmbedButton contract={statsContract} />
          </Row>
          <Row className="flex-wrap gap-2">
            {isAdmin || isTrusted ? (
              <SuperBanControl userId={playContract.creatorId} />
            ) : null}
            {isAdmin && !playContract.siblingContractId && (
              <ConfirmationButton
                openModalBtn={{
                  label: 'Make sweepcash',
                  color: 'yellow-outline',
                }}
                submitBtn={{ label: 'Sweepify!', color: 'yellow' }}
                onSubmit={() => convertToCashMarket()}
              >
                Are you sure you want to convert this market to a sweepcash
                market?
              </ConfirmationButton>
            )}
          </Row>
        </>
      )}
    </Modal>
  )
}

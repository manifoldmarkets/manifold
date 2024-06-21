import { RefreshIcon } from '@heroicons/react/solid'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AiOutlineCopy } from 'react-icons/ai'
import { copyToClipboard } from 'web/lib/util/copy'
import { Button } from '../buttons/button'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import { Input } from '../widgets/input'
import ShortToggle from '../widgets/short-toggle'
import { Title } from '../widgets/title'
import { PrivateUser, User } from 'common/user'
import { useState } from 'react'
import { generateNewApiKey } from 'web/lib/api/api-key'
import { api } from 'web/lib/firebase/api'

export const Settings = (props: { user: User; privateUser: PrivateUser }) => {
  const { user, privateUser } = props

  const [apiKey, setApiKey] = useState(privateUser.apiKey || '')
  const [betWarnings, setBetWarnings] = useState(!user.optOutBetWarnings)
  const [advancedTraderMode, setAdvancedTraderMode] = useState(
    !!user.isAdvancedTrader
  )

  const updateApiKey = async (e?: React.MouseEvent) => {
    const newApiKey = await generateNewApiKey()
    setApiKey(newApiKey ?? '')
    e?.preventDefault()

    if (!privateUser.twitchInfo) return
    await api('save-twitch', { twitchInfo: { needsRelinking: true } })
  }

  return (
    <Col className="gap-2">
      <div>
        <label className="mb-1 block">
          Advanced trader mode <InfoTooltip text={'More advanced betting UI'} />
        </label>
        <ShortToggle
          on={advancedTraderMode}
          setOn={(enabled) => {
            setAdvancedTraderMode(enabled)
            api('me/update', { isAdvancedTrader: enabled })
          }}
        />
      </div>
      <div>
        <label className="mb-1 block">
          Bet warnings{' '}
          <InfoTooltip
            text={
              'Warnings before you place a bet that is either 1. a large portion of your balance, or 2. going to move the probability by a large amount'
            }
          />
        </label>
        <ShortToggle
          on={betWarnings}
          setOn={(enabled) => {
            setBetWarnings(enabled)
            api('me/update', { optOutBetWarnings: !enabled })
          }}
        />
      </div>

      <div>
        <label className="mb-1 block">API key</label>
        <Row className="items-stretch gap-3">
          <Input
            type="text"
            placeholder="Click refresh to generate key"
            value={apiKey}
            readOnly
            className={'w-24'}
          />
          <Button
            color={'indigo'}
            onClick={() => {
              copyToClipboard(apiKey)
              toast.success('Copied to clipboard')
            }}
          >
            <AiOutlineCopy className="h-5 w-5" />
          </Button>
          <ConfirmationButton
            openModalBtn={{
              className: 'p-2',
              label: '',
              icon: <RefreshIcon className="h-5 w-5" />,
              color: 'red',
            }}
            submitBtn={{
              label: 'Update key',
            }}
            onSubmitWithSuccess={async () => {
              updateApiKey()
              return true
            }}
          >
            <Col>
              <Title>Are you sure?</Title>
              <div>
                Updating your API key will break any existing applications
                connected to your account, <b>including the Twitch bot</b>. You
                will need to go to the{' '}
                <Link href="/twitch" className="underline focus:outline-none">
                  Twitch page
                </Link>{' '}
                to relink your account.
              </div>
            </Col>
          </ConfirmationButton>
        </Row>
      </div>
    </Col>
  )
}

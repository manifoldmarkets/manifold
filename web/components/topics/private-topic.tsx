import { LockClosedIcon } from '@heroicons/react/solid'
import { Col } from '../layout/col'
import { BiGhost } from 'react-icons/bi'
import { LoadingIndicator } from '../widgets/loading-indicator'

export function LoadingPrivateThing() {
  return (
    <Col className="mt-24 h-full w-full items-center justify-center gap-6 lg:mt-0">
      <LoadingIndicator />
      <div>Checking access</div>
    </Col>
  )
}

export function InaccessiblePrivateThing(props: { thing: string }) {
  const { thing } = props
  return (
    <Col className="mt-24 h-full w-full items-center justify-center lg:mt-0">
      <LockClosedIcon className="text-ink-400 h-36 w-36" />
      <div>You do not have access to this {thing}!</div>
    </Col>
  )
}

export function PrivateGroupPage() {
  return (
    <Col className="mt-24 h-full w-full items-center justify-center gap-4 lg:mt-0">
      <BiGhost className="text-ink-400 h-36 w-36" />
      <Col className="max-w-lg gap-2">
        <div className="text-primary-500 text-center text-lg">
          {`Private groups are being deprecated :(`}
        </div>
        You no longer have access to this page, but don't worry! You can still
        see the content within this group through search and your portfolio.
      </Col>
    </Col>
  )
}

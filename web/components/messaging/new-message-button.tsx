import { PlusIcon } from '@heroicons/react/solid'
import { Button } from '../buttons/button'
import { useState } from 'react'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Col } from '../layout/col'
import { SupabaseSearch } from '../supabase-search'

export default function NewMessageButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button className="h-fit gap-1" onClick={() => setOpen(true)}>
        <PlusIcon className="h-5 w-5" aria-hidden="true" />
        New Chat
      </Button>
      <Modal open={open} setOpen={setOpen}>
        <Col className={MODAL_CLASS}>
          <SupabaseSearch
            persistPrefix="message-search"
            useUrlParams
            headerClassName={'pt-0'}
            defaultSearchType="Users"
            hideContractFilters
            hideSearchTypes
            onUserClick
          />
        </Col>
      </Modal>
    </>
  )
}

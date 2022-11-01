'use client'

import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { SignInButton } from 'web/components/buttons/sign-in-button'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { createCert } from 'web/lib/firebase/certs'

export function CreateCert() {
  const user = useUser()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  // Let the user create a cert with a new title & description

  const create = async () => {
    if (!user) return
    await createCert({ title, description }, user)
    // Clear the form
    setTitle('')
    setDescription('')
  }

  return (
    <Col className="gap-2">
      <div className="text-2xl font-bold">Create a new cert</div>
      {/*  */}
      <label
        htmlFor="title"
        className="block text-sm font-medium text-gray-700"
      >
        Title
      </label>
      <input
        id="title"
        type="text"
        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {/*  */}
      <label
        htmlFor="description"
        className="block text-sm font-medium text-gray-700"
      >
        Description
      </label>
      <input
        id="description"
        type="text"
        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {/*  */}
      {user && <Button onClick={create}>Create cert</Button>}
      {!user && <SignInButton />}
    </Col>
  )
}

export default function CertsLayout(props: { children: React.ReactNode }) {
  const { children } = props
  return (
    <section className="max-w-lg p-10">
      <Col className="gap-4">
        {children}
        <div className="border-t border-gray-200" />
        <CreateCert />
      </Col>
    </section>
  )
}

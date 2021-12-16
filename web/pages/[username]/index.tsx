import { useRouter } from 'next/router'
import React from 'react'
import { Header } from '../../components/header'
import { Col } from '../../components/layout/col'
import { Title } from '../../components/title'

// For now, render a placeholder page
export default function ContractPage() {
  const router = useRouter()
  const { username } = router.query as { username: string }

  return (
    <Col className="max-w-7xl mx-auto sm:px-6 lg:px-8">
      <Header />
      <Title text={username} />
    </Col>
  )
}

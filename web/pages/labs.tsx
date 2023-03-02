import { useEffect } from 'react'
import { useRouter } from 'next/router'

export const getServerSideProps = async () => {
  return { redirect: { destination: '/directory', permanent: false } }
}

export default function LabsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace(`/directory`)
  }, [])

  return <></>
}

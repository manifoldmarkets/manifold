import { GetServerSideProps } from 'next'

export default function CommunityGuidelinesRedirect() {
  return null
}

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/community-guidelines',
      permanent: true,
    },
  }
}

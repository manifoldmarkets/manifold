import { GetServerSideProps } from 'next'

import CharityGiveawayPage from 'web/pages/charity'

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { giveawayNum } = context.params ?? {}
  const num = giveawayNum ? Number(giveawayNum) : undefined
  return {
    props: {
      giveawayNum: Number.isFinite(num) ? num : undefined,
    },
  }
}

export default CharityGiveawayPage

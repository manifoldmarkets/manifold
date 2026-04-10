import { GetServerSideProps } from 'next'

import SweepstakesPage, { getSweepstakesServerSideProps } from 'web/pages/prize'

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { sweepstakesNum } = context.params ?? {}
  const num = sweepstakesNum ? Number(sweepstakesNum) : undefined
  const baseProps = await getSweepstakesServerSideProps(context)

  if ('props' in baseProps) {
    return {
      ...baseProps,
      props: {
        ...(baseProps.props as object),
        sweepstakesNum: Number.isFinite(num) ? num : undefined,
      },
    }
  }
  return baseProps
}

export default SweepstakesPage

// The sweepstakesNum is now read client-side from useRouter().query rather
// than injected via getServerSideProps. That removed the SSR step that used
// to hit pro.ip-api.com — see comment in web/pages/prize.tsx for context.
import SweepstakesPage from 'web/pages/prize'

export default SweepstakesPage

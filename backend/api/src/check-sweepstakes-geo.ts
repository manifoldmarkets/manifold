import { APIHandler } from './helpers/endpoint'
import { isSweepstakesLocationAllowed } from 'shared/ip-geolocation'
import { getBestClientIp } from 'common/client-ip'

// Client-side counterpart of the old getServerSideProps geo check on /prize.
// Moving this off the SSR critical path means /prize navigations don't block
// on pro.ip-api.com — the page loads instantly and the banner appears only
// after this resolves (or stays hidden if we can't determine the location).
export const checkSweepstakesGeo: APIHandler<
  'check-sweepstakes-geo'
> = async (_props, _auth, req) => {
  const ip = getBestClientIp(req.headers, [
    req.socket?.remoteAddress,
    req.ip,
  ])

  const { allowed } = await isSweepstakesLocationAllowed(ip)
  return { allowed }
}

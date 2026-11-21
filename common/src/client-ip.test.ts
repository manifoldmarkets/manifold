import { getClientIpCandidates, getBestClientIp, isPublicIp } from './client-ip'

describe('client ip helpers', () => {
  it('rejects malformed ipv6 addresses', () => {
    expect(isPublicIp('::1::')).toBe(false)
    expect(isPublicIp(':::')).toBe(false)
    expect(isPublicIp('2001:db8:::1')).toBe(false)
  })

  it('accepts valid ipv6 addresses', () => {
    expect(isPublicIp('2606:4700:4700::1111')).toBe(true)
    expect(isPublicIp('::1')).toBe(false)
    expect(isPublicIp('::')).toBe(false)
  })

  it('filters invalid ipv6 candidates from headers', () => {
    expect(
      getClientIpCandidates({
        'x-forwarded-for': '::1::, :::, 2606:4700:4700::1111',
      })
    ).toEqual(['2606:4700:4700::1111'])
  })

  it('prefers the first valid public candidate', () => {
    expect(
      getBestClientIp(
        {
          'x-forwarded-for': '::1::, 10.0.0.1, 2606:4700:4700::1111',
        },
        ['127.0.0.1']
      )
    ).toBe('2606:4700:4700::1111')
  })
})

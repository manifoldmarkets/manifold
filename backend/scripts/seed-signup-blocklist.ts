import { runScript } from 'run-script'

const bannedDeviceTokens = [
  'fa807d664415',
  'dcf208a11839',
  'bbf18707c15d',
  '4c2d15a6cc0c',
  '0da6b4ea79d3',
]

const bannedIpAddresses = [
  '24.176.214.250',
  '2607:fb90:bd95:dbcd:ac39:6c97:4e35:3fed',
  '2607:fb91:389:ddd0:ac39:8397:4e57:f060',
  '2607:fb90:ed9a:4c8f:ac39:cf57:4edd:4027',
  '2607:fb90:bd36:517a:ac39:6c91:812c:6328',
]

runScript(async ({ pg }) => {
  const reason = 'Migrated from hardcoded create-user blocklist'

  await pg.none(
    `insert into signup_blocklist (entry_type, value, reason)
     select 'device_token', token, $1
     from unnest($2::text[]) as token`,
    [reason, bannedDeviceTokens]
  )

  await pg.none(
    `insert into signup_blocklist (entry_type, value, reason)
     select 'ip', ip_address, $1
     from unnest($2::text[]) as ip_address`,
    [reason, bannedIpAddresses]
  )

  console.log(
    `Seeded ${bannedDeviceTokens.length} device tokens and ${bannedIpAddresses.length} IP addresses.`
  )
})

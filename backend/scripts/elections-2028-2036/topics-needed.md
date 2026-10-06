# Topics to create before launch

Creation fails with a 404 on a missing topic id, so the generator attaches only topics that exist in prod. Create the ones below (Tod), paste their ids into `topics.json` → `existing`, and rerun `generate-manifests.ts`.

| slug | suggested name | used by | modelled on |
|---|---|---|---|
| `2028-us-congressional-elections` | 2028 US Congressional Elections | 2028 senate, 2028 house | 2026-us-congressional-elections (1f785ecd-2cbc-4a04-8c20-0459dc31e4ad) |
| `2032-us-elections` | 2032 US Elections | every 2032 market | 2028-us-elections |
| `2036-us-elections` | 2036 US Elections | every 2036 market | 2028-us-elections |
| `2032-us-congressional-elections` | 2032 US Congressional Elections | 2032 senate | 2026-us-congressional-elections |
| `2036-us-congressional-elections` | 2036 US Congressional Elections | 2036 senate | 2026-us-congressional-elections |

## Missing per generated cycle

- 2028: `2028-us-congressional-elections`
- 2032: `2032-us-congressional-elections`, `2032-us-elections`
- 2036: `2036-us-congressional-elections`, `2036-us-elections`

## Existing topics attached

- `us-politics` → `AjxQR8JMpNyDqtiqoA96`
- `elections` → `i5JOzjrK5ZMHPSkhgzoi`
- `us-senate` → `Scdb6UrBLNsi1zvLGSD5`
- `us-congress` → `e722513e-30fa-4116-80c1-594b8dfd0685`
- `governor` → `fbeb997f-3b2f-4220-ac54-ccba38fc2cbe`
- `2028-us-presidential-election` → `aa5ce4dd-faf2-47a3-85a2-030f9579c65a`
- `2028-us-elections` → `e5e38ea8-fdbc-4f79-9ab1-c28259c7c0aa`
- `2032-us-presidential-election` → `fb851aab-ea02-4aa3-8cbb-1ee2336ba396`
- `2036-us-presidential-election` → `25ae6316-429b-4257-a760-0d345bba413a`

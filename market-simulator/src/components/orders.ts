const data = `1,9
8,
,1
1,
,1
1,
,5
5,
,5
5,
,1
1,
100,
,10
10,
,10
10,
,10
10,
,10
10,
,10
10,
,10
10,
,10
10,
,10
10,
,10
10,
,10
10,
,10
10,
,10
10,
,10
10,
,10
10,
,10
10,
,10
10,
,10`

// Parse data into Yes/No orders
// E.g. `8,\n,1\n1,` =>
// [{yesBid: 8, noBid: 0}, {yesBid: 0, noBid: 1}, {yesBid: 1, noBid: 0}]
export const bids = data.split('\n').map((line) => {
  const [yesBid, noBid] = line.split(',')
  return {
    yesBid: parseInt(yesBid || '0'),
    noBid: parseInt(noBid || '0'),
  }
})

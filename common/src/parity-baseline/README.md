# parity-baseline

`main`'s versions of the `cpmm-1` and `cpmm-multi-1` pricing code, vendored
so `cpmm-multi-1-parity-probe.test.ts` can run every entry point through both
this branch and `main` on the same inputs and compare the results exactly.
Nothing outside that test imports this folder.

The files are `main` at the merge base of the cpmm-multi-2 branch with
`main`, commit `45766e228bfeda7087491981e9005a1bd54746d8`, with only their
imports changed: imports of each other point into this folder, and imports of
everything else point one level up at the branch's copies (`../bet`,
`../contract`, `../fees`, ...). Anything the vendored code shares with the
branch (types, fees, the limit-order fill record) is therefore the branch's,
so a difference the probe finds is in the pricing code, not in a fixture.

To regenerate, from the repository root:

```sh
MB=45766e228bfeda7087491981e9005a1bd54746d8
for f in calculate-cpmm.ts calculate-cpmm-arbitrage.ts sell-bet.ts new-bet.ts calculate.ts util/algos.ts; do
  git show $MB:common/src/$f > common/src/parity-baseline/$f
done
cd common/src/parity-baseline
sed -i \
  -e "s#from 'common/calculate-cpmm-arbitrage'#from './calculate-cpmm-arbitrage'#" \
  -e "s#from './bet'#from '../bet'#" \
  -e "s#from './fees'#from '../fees'#" \
  -e "s#from './liquidity-provision'#from '../liquidity-provision'#" \
  -e "s#from './util/math'#from '../util/math'#" \
  -e "s#from './answer'#from '../answer'#" \
  -e "s#from 'common/contract'#from '../contract'#" \
  -e "s#from './contract'#from '../contract'#" \
  -e "s#from 'common/util/object'#from '../util/object'#" \
  -e "s#from './util/object'#from '../util/object'#" \
  -e "s#from 'common/api/utils'#from '../api/utils'#" \
  -e "s#from 'common/calculate-metrics'#from '../calculate-metrics'#" \
  -e "s#from 'common/contract-metric'#from '../contract-metric'#" \
  -e "s#from 'common/util/time'#from '../util/time'#" \
  -e "s#from './calculate-fixed-payouts'#from '../calculate-fixed-payouts'#" \
  calculate-cpmm.ts calculate-cpmm-arbitrage.ts sell-bet.ts new-bet.ts calculate.ts
```

`./calculate-cpmm`, `./calculate-cpmm-arbitrage`, `./calculate` and
`./util/algos` are left as they are, since they resolve inside this folder.
The merge base is `git merge-base origin/main <cpmm-multi-2 branch>`; if the
branch is rebased, update the commit above and regenerate.

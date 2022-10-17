import { Bet, Contract, User } from 'common/types/manifold-internal-types';
import { initializeApp } from 'firebase/app';
import { collection, CollectionReference, doc, DocumentReference, DocumentSnapshot, getFirestore, onSnapshot } from 'firebase/firestore';
import { MANIFOLD_FIREBASE_CONFIG } from './envs';
import log from './logger';

const timers: { [k: string]: number } = {};
const ts = function (name: string) {
  timers[name] = Date.now();
};
const te = function (name: string) {
  return ((Date.now() - timers[name]) * 0.001).toFixed(1) + 's';
};

function registerChangeListener(doc: DocumentReference, listener: (snapshot?: DocumentSnapshot) => void) {
  let firstCall = true;
  onSnapshot(doc, (snapshot) => {
    if (firstCall) {
      firstCall = false;
    } else {
      listener(snapshot);
    }
  });
}

export default class ManifoldFirestore {
  private readonly contracts: CollectionReference<Contract>;
  private readonly users: CollectionReference<User>;

  private allUsers: { [k: string]: User } = {};

  constructor() {
    const app = initializeApp(MANIFOLD_FIREBASE_CONFIG, 'manifold');
    const db = getFirestore(app);
    this.contracts = <CollectionReference<Contract>>collection(db, 'contracts');
    this.users = <CollectionReference<User>>collection(db, 'users');

    log.info('Accessing Manifold Firestore...');

    this.loadAllUsers();

    // this.test();
  }

  async loadAllUsers() {
    ts('users');
    await new Promise<void>((r) =>
      onSnapshot(this.users, (changes?) => {
        changes.docs.map((d) => (this.allUsers[d.data().id] = d.data()));
        r();
      })
    );
    log.info(`Loaded ${Object.keys(this.allUsers).length} users in ${te('users')}.`);
  }

  getManifoldUserByManifoldID(manifoldID: string) {
    return this.allUsers[manifoldID];
  }

  // async getFullMarketByID(marketID: string): Promise<AbstractMarket> {
  //   const contract = (await getDoc(doc(this.contracts, marketID))).data();
  //   const betsQuery = await getDocs(query(collection(this.contracts, marketID, 'bets'), orderBy('createdTime', 'desc')));
  //   const bets = <Bet[]> betsQuery.docs.map((d) => d.data());

  //   const { id, creatorUsername, creatorName, creatorId, createdTime, closeTime, question, slug, isResolved, resolutionTime, resolution } = contract;

  //   const abstractMarket = {
  //     id,
  //     creatorUsername,
  //     creatorName,
  //     creatorId,
  //     createdTime,
  //     closeTime,
  //     question,
  //     description: undefined,
  //     url: `https://${MANIFOLD_API_BASE_URL}/${creatorUsername}/${slug}`,
  //     probability: contract.outcomeType === 'BINARY' ? this.getProbability(contract) : undefined,
  //     isResolved,
  //     resolutionTime,
  //     resolution,
  //     bets,
  //   };

  //   return abstractMarket;
  // }

  // getProbability(contract: Contract) {
  //   if (contract.mechanism === 'cpmm-1') {
  //     return this.getCpmmProbability(contract.pool, contract.p);
  //   }
  //   throw new Error('DPM probability not supported.');
  // }

  // getCpmmProbability(pool: { [outcome: string]: number }, p: number) {
  //   const { YES, NO } = pool;
  //   return (p * NO) / ((1 - p) * YES + p * NO);
  // }

  async test() {
    ts('contracts');
    // const docs = await getDocs(query(contracts));
    // log.info("Found " + docs.size + " markets in " + te("contracts"));
    // docs.forEach((d) => {
    //     const data = <Contract> d.data();
    //     log.info(data.slug)
    // })

    ts('contract');
    // console.log(await this.getFullMarketByID('ta1Drot634OoAi2AkXCj'));
    registerChangeListener(doc(this.contracts, 'ta1Drot634OoAi2AkXCj'), (s) => {
      log.info('Contract info updated.');
      // console.log(s.data());
    });

    let firstSnapshot = true;
    onSnapshot(collection(this.contracts, 'ta1Drot634OoAi2AkXCj', 'bets'), (bets) => {
      if (firstSnapshot) {
        firstSnapshot = false;
        return;
      }

      bets.docChanges().forEach((changedDoc) => {
        const data = <Bet>changedDoc.doc.data();
        if (data.isRedemption) {
          return;
        }
        switch (changedDoc.type) {
          case 'added':
            log.info('New bet: ');
            break;
          case 'modified':
            log.info('Bet modified: ');
            break;
          case 'removed':
            log.info('Bet removed: ');
            break;
        }
        log.info(data.amount + ' of ' + data.outcome);
      });
    });
    log.info('Found in ' + te('contract'));
  }
}

import { AnyContractType, Bet, Contract, User } from '@common/types/manifold-internal-types';
import { initializeApp, onLog } from 'firebase/app';
import { collection, CollectionReference, doc, DocumentReference, getDoc, getDocs, getFirestore } from 'firebase/firestore';
import { MANIFOLD_FIREBASE_CONFIG } from './envs';
import log from './logger';
import { te, ts } from './utils';

export default class ManifoldFirestore {
  private readonly contracts: CollectionReference<Contract>;
  private readonly users: CollectionReference<User>;

  private allUsers: { [k: string]: User } = {};

  constructor() {
    process.stderr.write = (() => {
      const write = process.stderr.write;
      return function (...rest: any[]) {
        if (!(rest[0] as string).includes('@firebase/firestore')) {
          return write.apply(process.stderr, rest);
        }
      };
    })();

    const app = initializeApp(MANIFOLD_FIREBASE_CONFIG, 'manifold');
    const db = getFirestore(app);
    onLog((l) => {
      switch (l.level) {
        case 'debug':
          log.debug(l.message, l.args);
          break;
        case 'error':
          log.error(l.message, l.args);
          break;
        case 'warn':
          log.warn(l.message, l.args);
          break;
        default:
          log.info(l.message, l.args);
      }
    });
    this.contracts = <CollectionReference<Contract>>collection(db, 'contracts');
    this.users = <CollectionReference<User>>collection(db, 'users');
  }

  async validateConnection() {
    const message = 'Accessing Manifold Firestore...';
    try {
      await getDoc(doc(this.contracts, 'dummy'));
    } catch (e) {
      log.info(message + ' failed.');
      throw new Error('Failed to contact Manifold Firestore: ' + e.message);
    }
    log.info(message + ' success.');
  }

  async initialLoadAllUsers() {
    ts('users');
    await new Promise<void>(async (resolvePromise) => {
      const docs = await getDocs(this.users);
      for (const doc of docs.docs) {
        this.allUsers[doc.id] = doc.data();
      }
      resolvePromise();
    });
    log.info(`Loaded ${Object.keys(this.allUsers).length} users in ${te('users')}.`);
  }

  async getManifoldUserByManifoldID(manifoldID: string, forceLatest = true) {
    const cachedUser = this.allUsers[manifoldID];
    const updateCachePromise = getDoc(doc(this.users, manifoldID)).then((d) => (this.allUsers[d.id] = d.data()));
    if (cachedUser && !forceLatest) {
      return cachedUser;
    }
    return updateCachePromise;
  }

  async getFullMarketByID(marketID: string): Promise<[DocumentReference<Contract<AnyContractType>>, CollectionReference<Bet>]> {
    const contractDoc = doc(this.contracts, marketID);
    const betCollection = <CollectionReference<Bet>>collection(this.contracts, marketID, 'bets');
    return [contractDoc, betCollection];
  }
}

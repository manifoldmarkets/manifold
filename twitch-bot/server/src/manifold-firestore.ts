import { AnyContractType, Bet, Contract, Group, User } from '@common/types/manifold-internal-types';
import { initializeApp, onLog } from 'firebase/app';
import { collection, collectionGroup, CollectionReference, doc, DocumentReference, Firestore, getDoc, getDocs, getFirestore, onSnapshot, query, QuerySnapshot, where } from 'firebase/firestore';
import { default as _ } from 'lodash';
import { MANIFOLD_FIREBASE_CONFIG } from './envs';
import log from './logger';
import { te, ts } from './utils';

export default class ManifoldFirestore {
  private readonly db: Firestore;
  private readonly contracts: CollectionReference<Contract>;
  private readonly users: CollectionReference<User>;
  private readonly groups: CollectionReference<Group>;

  private allUsers: { [k: string]: User } = {};
  private allGroups: { [groupID: string]: Group } = {};

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
    this.db = getFirestore(app);
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
    this.contracts = <CollectionReference<Contract>>collection(this.db, 'contracts');
    this.users = <CollectionReference<User>>collection(this.db, 'users');
    this.groups = <CollectionReference<Group>>collection(this.db, 'groups');
  }

  private async validateConnection() {
    const message = 'Accessing Manifold Firestore...';
    try {
      await getDoc(doc(this.contracts, 'dummy'));
    } catch (e) {
      log.error(message + ' failed.');
      throw new Error('Failed to contact Manifold Firestore: ' + e.message);
    }
    log.info(message + ' success.');
  }

  async load() {
    await this.validateConnection();
    return this.initialLoadAllUsers();
  }

  private async initialLoadAllUsers() {
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

  private async loadGroups() {
    ts('groups');
    await new Promise<void>(async (resolvePromise) => {
      onSnapshot(this.groups, (snapshot) => {
        const changes = snapshot.docChanges();
        changes.forEach((d) => (this.allGroups[d.doc.id] = d.doc.data()));
        resolvePromise();
      });
    });
    log.info(`Loaded ${Object.keys(this.allGroups).length} groups in ${te('groups')}.`);
  }

  private async getGroupsForUserID(manifoldID: string) {
    const openContractIDs = Object.keys(this.allGroups).filter((id) => this.allGroups[id].anyoneCanJoin);
    const privateGroupsIDs = (await getDocs(query(collectionGroup(this.db, 'groupMembers'), where('userId', '==', manifoldID)))).docs.map((d) => d.ref.parent.parent.id);
    const groupIDs = _.uniq(openContractIDs.concat(privateGroupsIDs));
    return groupIDs.map((id) => this.allGroups[id]);
  }

  /**
   * An efficient way to retrieve the contracts within a group by batching queries to sets of 10 using the "where in" query.
   */
  private async getContractsInGroup(groupID: string): Promise<Contract[]> {
    if (!groupID) return [];
    ts('c');
    const contractIDs = (await getDocs(collection(this.groups, groupID, 'groupContracts'))).docs.map((doc) => doc.data() as { contractId: string; createdTime: string });
    const numBins = Math.ceil(contractIDs.length / 10);
    const promises: Promise<QuerySnapshot<Contract>>[] = [];
    for (let i = 0; i < numBins; i++) {
      const binIDs = contractIDs.slice(i * 10, i === numBins - 1 ? undefined : (i + 1) * 10).map((b) => b.contractId);
      promises.push(getDocs(query(this.contracts, where('id', 'in', binIDs))));
    }
    const contracts: Contract[] = [];
    const results = await Promise.all(promises);
    for (const result of results) {
      contracts.push(...result.docs.map((doc) => doc.data()));
    }
    log.info('Fetching contracts took ' + te('c'));
    return contracts;
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

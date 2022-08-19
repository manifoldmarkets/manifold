import { FirebaseApp, initializeApp } from "firebase/app";
import { collection, getFirestore, Firestore, getDocs, query, CollectionReference, where, setDoc, doc, deleteDoc } from "firebase/firestore";
import crypto from "crypto";
import { FIREBASE_API_KEY, TWITCH_APP_CLIENT_SECRET } from "./envs";
import User, { UserData } from "./user";
import log from "./logger";
import { UserNotRegisteredException } from "common/exceptions";

const firebaseConfig = {
    apiKey: FIREBASE_API_KEY,
    authDomain: "manifoldtwitchbot.firebaseapp.com",
    projectId: "manifoldtwitchbot",
    storageBucket: "manifoldtwitchbot.appspot.com",
    messagingSenderId: "318358608434",
    appId: "1:318358608434:web:e04094b8b04ce9d20afa2b",
};

export default class AppFirestore {
    readonly app: FirebaseApp;
    readonly db: Firestore;
    readonly userCollection: CollectionReference;
    readonly channelCollection: CollectionReference;
    readonly settingsCollection: CollectionReference;

    constructor() {
        this.app = initializeApp(firebaseConfig);
        this.db = getFirestore(this.app);
        const baseID = crypto.createHash("md5").update(TWITCH_APP_CLIENT_SECRET).digest("hex");
        this.userCollection = collection(this.db, "bots", baseID, "users");
        this.channelCollection = collection(this.db, "bots", baseID, "channels");
        this.settingsCollection = collection(this.db, "bots", baseID, "settings");
    }

    async getUserForTwitchUsername(twitchUsername: string): Promise<User> {
        twitchUsername = twitchUsername.toLocaleLowerCase();
        const docs = await getDocs(query(this.userCollection, where("twitchLogin", "==", twitchUsername)));
        if (docs.size < 1) throw new UserNotRegisteredException(`No user record for Twitch username ${twitchUsername}`);
        if (docs.size > 1) log.warn("More than one user found with Twitch username " + twitchUsername);
        const data = <UserData>docs.docs[0].data();
        return new User(data);
    }

    async getUserForControlToken(controlToken: string): Promise<User> {
        log.debug(`Examining control token: ${controlToken}`);
        if (!controlToken) return null;
        const docs = await getDocs(query(this.userCollection, where("controlToken", "==", controlToken)));
        if (docs.size < 1) return null;
        const data = <UserData>docs.docs[0].data();
        return new User(data);
    }

    async addNewUser(user: User) {
        await setDoc(doc(this.db, this.userCollection.path, user.data.manifoldID), user.data);
    }

    async getRegisteredTwitchChannels(): Promise<string[]> {
        const docs = await getDocs(this.channelCollection);
        const channelNames = [];
        docs.forEach((doc) => {
            channelNames.push(doc.id);
        });
        return channelNames;
    }

    async registerTwitchChannel(channelTwitchLogin: string) {
        await setDoc(doc(this.db, this.channelCollection.path, channelTwitchLogin), {});
    }

    async unregisterTwitchChannel(channelTwitchLogin: string) {
        await deleteDoc(doc(this.db, this.channelCollection.path, channelTwitchLogin));
    }
}

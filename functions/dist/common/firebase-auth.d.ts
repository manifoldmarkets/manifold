import { FirebaseApp } from '@firebase/app';
import { Auth as FirebaseAuth, User as FirebaseUser } from 'firebase/auth';
export interface FirebaseAuthInternal extends FirebaseAuth {
    persistenceManager: {
        fullUserKey: string;
        getCurrentUser: () => Promise<FirebaseUser | null>;
        persistence: {
            _set: (k: string, obj: FirebaseUser) => Promise<void>;
        };
    };
}
export declare const setFirebaseUserViaJson: (deserializedUser: FirebaseUser, app: FirebaseApp, isNative?: boolean) => Promise<FirebaseUser | null>;

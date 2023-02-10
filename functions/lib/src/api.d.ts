import * as admin from 'firebase-admin';
import { z } from 'zod';
import { Request, RequestHandler, Response } from 'express';
import { HttpsOptions } from 'firebase-functions/v2/https';
import { PrivateUser } from '../../common/user';
export { APIError } from '../../common/api';
type Output = Record<string, unknown>;
export type AuthedUser = {
    uid: string;
    creds: JwtCredentials | (KeyCredentials & {
        privateUser: PrivateUser;
    });
};
type Handler = (req: Request, user: AuthedUser) => Promise<Output>;
type JwtCredentials = {
    kind: 'jwt';
    data: admin.auth.DecodedIdToken;
};
type KeyCredentials = {
    kind: 'key';
    data: string;
};
type Credentials = JwtCredentials | KeyCredentials;
export declare const parseCredentials: (req: Request) => Promise<Credentials>;
export declare const lookupUser: (creds: Credentials) => Promise<AuthedUser>;
export declare const writeResponseError: (e: unknown, res: Response) => void;
export declare const zTimestamp: () => z.ZodEffects<z.ZodDate, Date, Date>;
export type EndpointDefinition = {
    opts: EndpointOptions & {
        method: string;
    };
    handler: RequestHandler;
};
export declare const validate: <T extends z.ZodTypeAny>(schema: T, val: unknown) => z.TypeOf<T>;
export interface EndpointOptions extends HttpsOptions {
    method?: string;
    secrets?: string[];
}
export declare const newEndpoint: (endpointOpts: EndpointOptions, fn: Handler) => EndpointDefinition;
export declare const newEndpointNoAuth: (endpointOpts: EndpointOptions, fn: (req: Request) => Promise<Output>) => EndpointDefinition;

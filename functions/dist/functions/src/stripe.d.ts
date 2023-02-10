import Stripe from 'stripe';
import { EndpointDefinition } from './api';
export type StripeSession = Stripe.Event.Data.Object & {
    id: string;
    metadata: {
        userId: string;
        manticDollarQuantity: string;
    };
};
export type StripeTransaction = {
    userId: string;
    manticDollarQuantity: number;
    sessionId: string;
    session: StripeSession;
    timestamp: number;
};
export declare const createcheckoutsession: EndpointDefinition;
export declare const stripewebhook: EndpointDefinition;

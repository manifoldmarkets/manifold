import * as Amplitude from '@amplitude/node';
export declare const track: (userId: string, eventName: string, eventProperties?: any, amplitudeProperties?: Partial<Amplitude.Event>) => Promise<Amplitude.Response | null>;

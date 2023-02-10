export interface Charity {
    id: string;
    slug: string;
    name: string;
    website: string;
    ein?: string;
    photo?: string;
    preview: string;
    description: string;
    tags?: readonly CharityTag[];
}
type CharityTag = 'Featured' | 'New';
export declare const charities: Charity[];
export {};

export type Group = {
  id: string;
  slug: string;
  name: string;
  about: string;
  creatorId: string; // User id
  createdTime: number;
  mostRecentActivityTime: number;
  memberIds: string[]; // User ids
  anyoneCanJoin: boolean;
  contractIds: string[];

  chatDisabled?: boolean;
  mostRecentChatActivityTime?: number;
  mostRecentContractAddedTime?: number;
};

export const MAX_GROUP_NAME_LENGTH = 75;
export const MAX_ABOUT_LENGTH = 140;
export const MAX_ID_LENGTH = 60;
export const NEW_USER_GROUP_SLUGS = ['updates', 'bugs', 'welcome'];
export const GROUP_CHAT_SLUG = 'chat';

export type GroupLink = {
  slug: string;
  name: string;
  groupId: string;
  createdTime: number;
  userId?: string;
};

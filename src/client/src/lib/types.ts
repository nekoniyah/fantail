export type PublicUser = {
  id: string;
  username: string;
  displayName?: string;
  description?: string;
  admin: boolean;
  verified: boolean;
  avatarUrl?: string;
};

export type PrivateUser = PublicUser & {
  email: string;
  token: string;
  password: string; // This is hashed anyway.
};

export type Attachment = {
  id: string;
  url: string;
};

export type Group = {
  id: string;
  name: string;
  description?: string;
  owner: PublicUser;
  members: PublicUser[];
  messages: GroupMessage[];
};

export type GroupMessage = {
  id: string;
  sender: PublicUser;
  content: string;
  group: Group;
  attachments: Attachment[];
  createdTimestamp: number;
  updatedTimestamp: number;
};

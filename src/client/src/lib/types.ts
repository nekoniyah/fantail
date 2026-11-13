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
  createdAt: Date;
  updatedAt: Date;
};

/** A media-library entry as returned by the API (no `data` bytes). */
export type MediaItem = {
  id: string;
  type: "emote" | "sticker";
  format: string;
  name: string;
};

/** What a library item looks like on disk, for the picker. */
export type LibraryKind = MediaItem["type"];

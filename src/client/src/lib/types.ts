export type PublicUser = {
    id: string;
    username: string;
    displayName?: string;
    description?: string;
    admin: boolean;
    verified: boolean;
}

export type PrivateUser = PublicUser & {
    email: string;
}

export type Attachment = {
    id: string;
    url: string;
}

export type Group = {
    id: string;
    name: string;
    description?: string;
    owner: PublicUser;
    members: PublicUser[];
    messages: GroupMessage[];
}

export type GroupMessage = {
    id: string;
    sender: PublicUser;
    content: string;
    group: Group;
    attachments: Attachment[];
    createdTimestamp: number;
    updatedTimestamp: number;
}

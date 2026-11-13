import type { Socket } from "socket.io";
import type { User } from "@prisma";
import prisma from "@lib/prisma";
import { Server } from "socket.io";
import { cache } from "@lib/cache";

// Sizes of base64-encoded tweetnacl values
const NONCE_LEN = 32; // 24 bytes
const SIGNATURE_LEN = 88; // 64 bytes
const PUBLIC_KEY_LEN = 44; // 32 bytes
const WRAPPED_KEY_LEN = 140; // 32 (ephemeral pub) + 24 (nonce) + 48 (box)
const MAX_CONTENT_LEN = 128 * 1024;
const MAX_ATTACHMENTS = 10;
const MAX_ENVELOPES = 1000;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const isBase64 = (v: unknown, len?: number): v is string =>
  typeof v === "string" &&
  BASE64.test(v) &&
  (len === undefined || v.length === len);

type Ack = (res: any) => void;
const noop: Ack = () => {};

type Envelope = { userId: string; wrappedKey: string };
const validEnvelopes = (list: unknown): list is Envelope[] =>
  Array.isArray(list) &&
  list.length <= MAX_ENVELOPES &&
  list.every(
    (e) =>
      e &&
      typeof e.userId === "string" &&
      isBase64(e.wrappedKey, WRAPPED_KEY_LEN),
  ) &&
  new Set(list.map((e) => e.userId)).size === list.length;

export async function listenWebsocketGroupEvents(
  socket: Socket,
  user: User,
  io: Server,
) {
  let groupId: string | null = null;
  const room = (id: string) => `group:${id}`;

  /**
   * Re-checks membership on every call, so a removed member loses access
   * immediately instead of keeping the group cached from select time.
   */
  async function currentGroup() {
    if (!groupId) return null;

    const g = await prisma.group.findUnique({
      where: { id: groupId },
      include: { members: { select: { id: true } } },
    });

    if (
      g &&
      (g.ownerId === user.id || g.members.some((m) => m.id === user.id))
    ) {
      return g;
    }

    socket.leave(room(groupId));
    groupId = null;
    return null;
  }

  /** Everyone (members + owner) who can receive a key, and whether they have the current one. */
  async function getRecipients(g: {
    id: string;
    ownerId: string;
    keyVersion: number;
    members: { id: string }[];
  }) {
    const ids = [...new Set([g.ownerId, ...g.members.map((m) => m.id)])];

    const [users, envelopes] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: ids }, publicKey: { not: null } },
        select: { id: true, publicKey: true },
      }),
      prisma.groupKeyEnvelope.findMany({
        where: { groupId: g.id, version: g.keyVersion },
        select: { userId: true },
      }),
    ]);

    const have = new Set(envelopes.map((e) => e.userId));
    return users.map((u) => ({
      id: u.id,
      publicKey: u.publicKey as string,
      hasKey: have.has(u.id),
    }));
  }

  // ───────────── Identity ─────────────

  // Only the first registration is accepted: a hijacked session must not be able
  // to swap in its own keys. Resetting keys should be an explicit, separate flow.
  socket.on(
    "user:keys:register",
    async (publicKey: string, signingPublicKey: string, cb: Ack = noop) => {
      if (
        !isBase64(publicKey, PUBLIC_KEY_LEN) ||
        !isBase64(signingPublicKey, PUBLIC_KEY_LEN)
      ) {
        return cb({ ok: false, error: "invalid" });
      }

      const { count } = await prisma.user.updateMany({
        where: { id: user.id, publicKey: null },
        data: { publicKey, signingPublicKey },
      });
      if (count === 1) return cb({ ok: true });

      const existing = await prisma.user.findUnique({
        where: { id: user.id },
        select: { publicKey: true, signingPublicKey: true },
      });
      const same =
        existing?.publicKey === publicKey &&
        existing?.signingPublicKey === signingPublicKey;

      cb(same ? { ok: true } : { ok: false, error: "already-registered" });
    },
  );

  // ───────────── Group selection ─────────────

  socket.on("group:select", async (id: string, cb: Ack = noop) => {
    if (typeof id !== "string") return cb(false);

    const dbGroup = await prisma.group.findFirst({
      where: { id },
      include: {
        members: { omit: { email: true, password: true } },
      },
    });

    if (
      !dbGroup ||
      !(
        dbGroup.ownerId === user.id ||
        dbGroup.members.some((member) => member.id === user.id)
      )
    ) {
      return cb(false);
    }

    if (groupId && groupId !== dbGroup.id) socket.leave(room(groupId));
    groupId = dbGroup.id;
    socket.data.groupId = dbGroup.id;
    socket.join(room(groupId));
    cb(dbGroup);
  });

  // ───────────── Group keys ─────────────

  // My wrapped copies of the group key (all versions) + the current version
  socket.on("group:keys:retrieve", async (cb: Ack = noop) => {
    const g = await currentGroup();
    if (!g) return cb(null);

    const envelopes = await prisma.groupKeyEnvelope.findMany({
      where: { groupId: g.id, userId: user.id },
      select: { version: true, wrappedKey: true },
      orderBy: { version: "asc" },
    });

    cb({ keyVersion: g.keyVersion, envelopes });
  });

  // Who can receive a key and who still lacks the current one
  socket.on("group:keys:recipients", async (cb: Ack = noop) => {
    const g = await currentGroup();
    if (!g) return cb(null);

    cb({ keyVersion: g.keyVersion, recipients: await getRecipients(g) });
  });

  // New key version (first key, or rotation after a removal). Owner only.
  // Must be wrapped for exactly the current recipients.
  socket.on(
    "group:keys:publish",
    async (version: number, envelopes: Envelope[], cb: Ack = noop) => {
      const g = await currentGroup();
      if (!g || g.ownerId !== user.id) return cb(false);
      if (!Number.isInteger(version) || version !== g.keyVersion + 1)
        return cb(false);
      if (!validEnvelopes(envelopes)) return cb(false);

      const required = new Set((await getRecipients(g)).map((r) => r.id));
      // A key wrapped for nobody is unreadable forever: reject it instead of
      // bumping the version and bricking the group. (Envelopes for members
      // without registered keys are equally useless — getRecipients excludes
      // them, so required.size === 0 means everyone lacks keys.)
      if (required.size === 0 || envelopes.length === 0) return cb(false);
      if (
        envelopes.length !== required.size ||
        envelopes.some((e) => !required.has(e.userId))
      ) {
        return cb(false);
      }

      try {
        await prisma.$transaction(async (tx) => {
          // Atomic compare-and-set: only one concurrent publisher wins
          const { count } = await tx.group.updateMany({
            where: { id: g.id, keyVersion: g.keyVersion },
            data: { keyVersion: version },
          });
          if (count !== 1) throw new Error("stale");

          await tx.groupKeyEnvelope.createMany({
            data: envelopes.map((e) => ({
              groupId: g.id,
              userId: e.userId,
              version,
              wrappedKey: e.wrappedKey,
            })),
          });
        });
      } catch {
        return cb(false);
      }

      io.to(room(g.id)).emit("group:keys:updated");
      cb(true);
    },
  );

  // Any member can hand the CURRENT key to recipients that don't have it yet
  // (e.g. someone who was just added). No history: older versions aren't shared.
  socket.on(
    "group:keys:share",
    async (version: number, envelopes: Envelope[], cb: Ack = noop) => {
      const g = await currentGroup();
      if (!g || g.keyVersion < 1 || version !== g.keyVersion) return cb(false);
      if (!validEnvelopes(envelopes) || envelopes.length === 0)
        return cb(false);

      const lacking = new Set(
        (await getRecipients(g)).filter((r) => !r.hasKey).map((r) => r.id),
      );
      if (envelopes.some((e) => !lacking.has(e.userId))) return cb(false);

      try {
        await prisma.groupKeyEnvelope.createMany({
          data: envelopes.map((e) => ({
            groupId: g.id,
            userId: e.userId,
            version,
            wrappedKey: e.wrappedKey,
          })),
        });
      } catch {
        // Another member shared first (unique constraint), which is fine
        return cb(false);
      }

      io.to(room(g.id)).emit("group:keys:updated");
      cb(true);
    },
  );

  // ───────────── Messages ─────────────

  socket.on("group:messages:retrieve", async (cb: Ack = noop) => {
    const g = await currentGroup();
    if (!g) return cb(null);

    const messages = await prisma.groupMessage.findMany({
      where: { groupId: g.id },
      orderBy: { createdAt: "asc" },
      include: {
        // `data` (the file bytes) is fetched on demand via /files/:id
        attachments: { omit: { data: true } },
        sender: { omit: { password: true, email: true } },
      },
    });

    cb(messages);
  });

  socket.on(
    "group:messages:send",
    async (
      content: string,
      nonce: string,
      keyVersion: number,
      signature: string,
      attachmentIds: string[],
      cb: Ack = noop,
    ) => {
      const g = await currentGroup();
      if (!g) return cb({ ok: false, error: "not-in-group" });

      if (
        !isBase64(content) ||
        content.length > MAX_CONTENT_LEN ||
        !isBase64(nonce, NONCE_LEN) ||
        !isBase64(signature, SIGNATURE_LEN) ||
        !Number.isInteger(keyVersion) ||
        keyVersion < 1 ||
        !Array.isArray(attachmentIds) ||
        attachmentIds.length > MAX_ATTACHMENTS ||
        !attachmentIds.every((id) => typeof id === "string") ||
        new Set(attachmentIds).size !== attachmentIds.length
      ) {
        return cb({ ok: false, error: "invalid" });
      }

      // The sender must have encrypted with the current key (it may have rotated)
      if (keyVersion !== g.keyVersion) {
        return cb({ ok: false, error: "stale-key" });
      }

      // Only the sender's own, still-unattached, encrypted attachments
      if (attachmentIds.length) {
        const owned = await prisma.media.count({
          where: {
            id: { in: attachmentIds },
            type: "attachment",
            uploaderId: user.id,
            groupMessageId: null,
          },
        });
        if (owned !== attachmentIds.length) {
          return cb({ ok: false, error: "invalid-attachments" });
        }
      }

      const message = await prisma.groupMessage.create({
        data: {
          group: { connect: { id: g.id } },
          content,
          nonce,
          keyVersion,
          signature,
          sender: { connect: { id: user.id } },
          attachments: { connect: attachmentIds.map((id) => ({ id })) },
        },
        include: {
          sender: { omit: { password: true, email: true } },
          attachments: { omit: { data: true } },
        },
      });

      io.to(room(g.id)).emit("group:messages:send", message);
      cb({ ok: true });
    },
  );

  socket.on("group:messages:delete", async (messageId: string) => {
    const g = await currentGroup();
    if (!g || typeof messageId !== "string") return;

    // Scoped to the selected group and to the sender
    const message = await prisma.groupMessage.findFirst({
      where: { id: messageId, senderId: user.id, groupId: g.id },
    });
    if (!message) return;

    const deletedMedia = await prisma.media.findMany({
      where: { groupMessageId: message.id, type: "attachment" },
      select: { id: true },
    });

    await prisma.$transaction([
      // Encrypted attachments die with their message
      prisma.media.deleteMany({
        where: { groupMessageId: message.id, type: "attachment" },
      }),
      prisma.groupMessage.delete({ where: { id: message.id } }),
    ]);

    for (const media of deletedMedia) cache.del(`media:${media.id}`);

    io.to(room(g.id)).emit("group:messages:delete", messageId);
  });
}

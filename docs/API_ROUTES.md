# Fantail — Backend API Reference

> Source of truth: `src/api/routes/**` (HTTP) and `src/api/ws/**` (WebSocket). All HTTP routes are mounted under **`/api`** (see `src/index.ts`).

## Conventions

- **Errors** always look like `{ "error": true, "message": "<reason>" }` with the appropriate HTTP status ([responses.ts](../src/libs/responses.ts)).
- **`sendMessage`** responses: `{ "message": "<string>" }`.
- **`sendData`** responses: the JSON body **is the data** (no wrapper, no `data` field).
- **Auth middleware** ([auth.ts](../src/api/middlewares/auth.ts)): reads `Authorization: Bearer <sessionToken>`, matches it against the `Session` table and attaches `req.user`. Missing/invalid token → `401 { "error": true, "message": "Unauthorized" }`.
- **Body parsing**: `express.json()` + `express.urlencoded` (`Content-Type: application/json` on JSON endpoints). Upload endpoints use `multer` with `multipart/form-data`.
- **CORS**: only `http://localhost:5173` and `http://localhost:4000`, `credentials: true`.
- **Upload limits**: avatars 5 MB; emotes/stickers 1 MB; group message attachments `MAX_UPLOAD_SIZE` (MB, fallback 10 MB).
- Path params in examples (`:id`, `:groupId`, …) are placeholders — substitute real values.

# Quick Reference

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/avatars/:id` | ❌ | Serve a user's avatar image bytes. |
| POST | `/api/auth/login` | ❌¹ | Log in and get a session token. |
| POST | `/api/auth/register` | ❌ | Create an account. |
| POST | `/api/connections` | ✅ | Mint a one-time "connection ticket" for a community server. |
| POST | `/api/connections/verify` | ❌ | Community server redeems a ticket for the user's public profile. |
| GET | `/api/files/:id` | ❌ | Download stored media bytes by id. |
| POST | `/api/files` | ✅ | Upload a plaintext file (emote/sticker/shared library). |
| POST | `/api/files/attachments` | ✅ | Upload an encrypted group-message attachment. |
| GET | `/api/friends` | ✅ | List my friends. |
| DELETE | `/api/friends/:id` | ✅ | Remove a friend. |
| GET | `/api/friends/invitations` | ✅ | List friend requests sent **to me**. |
| GET | `/api/friends/invitations/sent` | ✅ | List friend requests I sent. |
| POST | `/api/friends/invitations` | ✅ | Send a friend request. |
| POST | `/api/friends/invitations/:id` | ✅ | Accept a friend request (target only). |
| DELETE | `/api/friends/invitations/:id` | ✅ | Cancel (sender) or deny (target) a request. |
| GET | `/api/groups` | ✅ | List my groups (member + owner). |
| POST | `/api/groups` | ✅ | Create a group from a list of friend ids. |
| GET | `/api/groups/:id` | ✅ | Fetch one group with members. |
| DELETE | `/api/groups/:id` | ✅ | Delete a group (owner only). |
| GET | `/api/groups/:id/messages` | ✅ | List encrypted-message rows in a group. |
| GET | `/api/notifications` | ✅ | List my notifications. |
| POST | `/api/notifications/:id/read` | ✅ | Mark a notification as read. |
| GET | `/api/settings` | ✅ | Get (or implicitly create) my settings. |
| GET | `/api/users` | ✅ | List users, optional `?filter=` substring match. |
| GET | `/api/users/@me` | ✅ | Fetch my own full user (auth runs inside the handler). |
| GET | `/api/users/@username` | ❌ | Fetch a public profile by username (no auth middleware). |
| GET | `/api/users/:id` | ❌ | Fetch a public profile by id (cached; no auth middleware). |
| PUT | `/api/users/@me` | ✅ | Update my profile (username, displayName, email, password…). |
| PUT | `/api/users/@me/avatar` | ✅ | Upload my avatar (multipart). |
| GET | `/api/users/@me/media` | ✅ | List my emotes & stickers. |
| GET | `/api/users/@me/media/:id` | ✅ | Fetch one of my emotes/stickers. |
| POST | `/api/users/@me/media/:kind` | ✅ | Upload emote or sticker (multipart, `kind` ∈ {`emote`, `sticker`}). |
| DELETE | `/api/users/@me/media/:id` | ✅ | Delete one of my emotes/stickers. |

¹ login uses `Cookie: fantail_private_key` + `fantail_expiration` instead of `Authorization`.
² `GET /api/users/@me` is special-cased inside `GET /api/users/:id`: the handler calls `auth` manually and returns the
authenticated user. `@username` and plain-id lookups run **without** any auth middleware (public by inspection).

---

## Auth (`/api/auth`)

Source: `src/api/routes/auth/index.ts`

### `POST /api/auth/login`

**What it does**
Log in with `emailOrUsername` + `password`. Creates a `Session` row whose `token` is an Iron-sealed JSON `{ id, username }`, encrypted with the Iron password from the public, client-managed `fantail_private_key` cookie and expiry `Date.now() + Number(fantail_expiration)`.

**Headers**

| Header | Required | Description |
|---|---|---|
| `Content-Type` | ✅ | `application/json` |
| `Cookie` | ✅ | `fantail_private_key=<iron password>` and `fantail_expiration=<ms>` — both **required**; missing either → `400 "Missing key or expiration"`. |
| `Authorization` | ❌ | Not used. |

**Body (all required)**

| Property | Type | Notes |
|---|---|---|
| `emailOrUsername` | `string` (min 1) | Either the email or username. |
| `password` | `string` | Compared with bcrypt. |

**Response payload (200)**

```json
{
  "message": "Successfully logged in",
  "session": {
    "id": "<cuid>",
    "userId": "<cuid>",
    "token": "<iron-sealed token>",
    "expiresAt": "2026-11-20T15:00:00.000Z"
  }
}
```

**Error payloads**

- `400 { error, message: "Request body is empty" | "Missing key or expiration" | "<zod message>" }`
- `404 { error, message: "Account with email or username does not exist" }`
- `401 { error, message: "Invalid password" }`

**Example**

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -b "fantail_private_key=<secret>; fantail_expiration=604800000" \
  -d '{"emailOrUsername": "jane@example.com", "password": "Sup3rS3cret!"}'
```

### `POST /api/auth/register`

**What it does**
Create an account. Password must satisfy complexity regex: `8+ chars, ≥1 lower, ≥1 upper, ≥1 digit, ≥1 of @$!%*?&`. Password stored bcrypt-hashed with `PASSWORD_SALT` rounds (env). Sets `res.locals.user`.

**Headers**

| Header | Required | Description |
|---|---|---|
| `Content-Type` | ✅ | `application/json` |

**Body**

| Property | Type | Required | Notes |
|---|---|---|---|
| `email` | `string \| null` | ❌ | Valid email when provided; may explicitly be `null`. |
| `username` | `string` | ✅ | 4–20 chars; lowercased server-side. |
| `password` | `string` | ✅ | See complexity regex. |

**Response payload (201)**

```json
{ "message": "Successfully created account." }
```

**Error payloads**

- `400 { error, message: "Request body is empty" | "<zod message>" }`
- `409 { error, message: "Account with email or username already exists" }`

**Example**

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "jane@example.com", "username": "jane_doe", "password": "Sup3rS3cret!"}'
```

---

## Avatars (`/api/avatars`)

Source: `src/api/routes/avatars/index.ts`

### `GET /api/avatars/:id`

**What it does**
Serve a user's avatar image as raw bytes (`:id` = the **user's** id; from `Avatar.userId`). In-memory cached (`AVATAR_TTL_MS`). Sets `Cross-Origin-Resource-Policy: cross-origin` and `Content-Type: image/<format>`.

**Headers / body**: none required.

**Path parameters**

| Param | Value |
|---|---|
| `:id` | Target user's id. |

**Response payload (200)** — binary image bytes, `Content-Type: image/<png|jpeg|…>`. Not a JSON document.

**Error payloads**

- `404 { error, message: "Avatar not found" }`

**Example**

```bash
curl http://localhost:4000/api/avatars/<user-id> -o avatar.png
```

---

## Connections (community server tickets) (`/api/connections`)

Source: `src/api/routes/connections/index.ts`

### `POST /api/connections`

**What it does**
Mint (or rotate) a one-time `Connection` ticket that proves "this user logged in on Fantail" to a Fantail community server. Ticket expires in 10 minutes. Minting again for the same address rotates the ticket and invalidates the previous one.

**Headers**

| Header | Required | Description |
|---|---|---|
| `Content-Type` | ✅ | `application/json` |
| `Authorization` | ✅ | `Bearer <session token>` — `auth` middleware. |

**Body**

| Property | Type | Required | Notes |
|---|---|---|---|
| `address` | `string` (1–255) | ✅ | Community-server address this ticket is for. |

**Response payload (201)**

```json
{
  "ticket": "<33-char token>",
  "expiresAt": "2026-11-13T16:06:52.000Z"
}
```

**Error payloads**

- `400 { error, message: "<zod validation message>" }`

**Example**

```bash
curl -X POST http://localhost:4000/api/connections \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <session token>" \
  -d '{"address": "https://community.example.com"}'
```

### `POST /api/connections/verify`

**What it does**
Redeem a one-time ticket. The community server must present the exact `address` the ticket was minted for; the ticket is then deleted (replay-proof) and the user's **public profile** is returned (never `password` or `email`).

**Headers**

| Header | Required | Description |
|---|---|---|
| `Content-Type` | ✅ | `application/json` |
| `Authorization` | ❌ | Deliberately public. |

**Body (all required)**

| Property | Type | Notes |
|---|---|---|
| `address` | `string` (1–255) | Must equal the minting `address`. |
| `ticket` | `string` (min 1) | Ticket from `POST /api/connections`. |

**Response payload (200)**
```json
{ "user": { "id": "...", "username": "...", "displayName": null, "description": null, "avatarUrl": null, "bannerUrl": null, "verified": false, "admin": false, "age": null, "publicKey": null, "signingPublicKey": null } }
```

**Error payloads**

- `400 { error, message: "<zod message>" }`
- `403 { error, message: "Ticket was minted for a different server" }`
- `404 { error, message: "Invalid ticket" | "Account not found" }`
- `410 { error, message: "Ticket expired" }`

**Example**

```bash
curl -X POST http://localhost:4000/api/connections/verify \
  -H "Content-Type: application/json" \
  -d '{"address": "https://community.example.com", "ticket": "<ticket>"}'
```

---

## Files & media (`/api/files`)

Source: `src/api/routes/files/index.ts`

### `GET /api/files/:id`

**What it does**
Download the stored media bytes for a media id. The content type depends on the stored `type`:
- image (`image/png|jpeg|gif|webp`) → served inline,
- `attachment` (encrypted group-message blob) → `application/octet-stream` + `Cache-Control: private, max-age=31536000, immutable`,
- anything else → download via `Content-Disposition: attachment; filename="<id>.<format>"`.

Not JSON; no auth required (ids are unguessable cuids). Response headers include `Cross-Origin-Resource-Policy: cross-origin` and `X-Content-Type-Options: nosniff`.

**Headers / body**: none required.

**Path parameters**

| Param | Value |
|---|---|
| `:id` | Media id (cuid). |

**Response payload (200)** — raw bytes with the headers described above.

**Error payloads**

- `404 { error, message: "Media not found" }`

**Example**

```bash
curl http://localhost:4000/api/files/<media-id> -o out.bin
```

### `POST /api/files` — plaintext upload (emote / sticker / shared library)

**What it does**
Upload one file, stored as a `Media` row (`type` = raw mimetype, `format` = file extension). "attachment" mimetype is rejected here (reserved for the encrypted endpoint). Rejects duplicate payloads (`400 "Duplicate file"`).

**Headers**

| Header | Required | Description |
|---|---|---|
| `Content-Type` | ✅ | `multipart/form-data; boundary=<boundary>` |
| `Authorization` | ✅ | `Bearer <session token>` — `auth` middleware. |

**Multipart fields**

| Field | Required | Notes |
|---|---|---|
| `file` | ✅ | Binary payload. `MAX_UPLOAD_SIZE` MB limit (env, fallback 10 MB). The stored `type` = the file's mimetype, `format` = its file extension. |

**Response payload (201)**

```json
{
  "media": {
    "id": "<cuid>", "type": "image/png", "format": "png",
    "nonce": null, "uploaderId": null, "groupMessageId": null, "sensitivity": null, "name": null
  },
  "path": "/api/files/<media-id>"
}
```

**Error payloads**

- `400 { error, message: "Invalid file type" | "Duplicate file" | "No file uploaded" }`

**Example**

```bash
curl -X POST http://localhost:4000/api/files \
  -H "Authorization: Bearer <session token>" \
  -F "file=@/path/to/emote.png"
```

### `POST /api/files/attachments` — encrypted group-message attachment

**What it does**
Upload the raw ciphertext of an encrypted group-message attachment plus its base64 nonce. The server never sees the key, filename, or MIME type (stored as `type: "attachment"`, `format: "bin"`). The multipart format sidesteps the global JSON body limit.

**Headers**

| Header | Required | Description |
|---|---|---|
| `Content-Type` | ✅ | `multipart/form-data; boundary=<boundary>` |
| `Authorization` | ✅ | `Bearer <session token>` — `auth` middleware. |

**Multipart fields**

| Field | Required | Notes |
|---|---|---|
| `file` | ✅ | Raw ciphertext (`>= 16` bytes; cap is `MAX_UPLOAD_SIZE + 16` bytes). |
| `nonce` | ✅ | Base64 nonce — exactly 24 bytes when decoded (32 base64 chars). |

**Response payload (201)**

```json
{ "media": { "id": "<cuid>" }, "path": "/api/files/<media-id>" }
```

**Error payloads**

- `400 { error, message: "Invalid upload" | "Invalid attachment" }`
- `401 { error, message: "Unauthorized" }` (auth middleware missing/failed — normally not reachable because `auth` runs first)
- `413 { error, message: "File too large" }`

**Example (tweetnacl-based client)**

```bash
curl -X POST http://localhost:4000/api/files/attachments \
  -H "Authorization: Bearer <session token>" \
  -F "file=@ciphertext.bin" \
  -F "nonce=$NONCE_BASE64"
```

---

## Friends (`/api/friends`)

Source: `src/api/routes/friends/index.ts`

### `GET /api/friends`

**What it does**
Return my friends list.

**Headers**

| Header | Required |
|---|---|
| `Authorization` | ✅ `Bearer <session token>` |

**Body**: none.

**Response payload (200)**

```json
[
  { "id": "...", "username": "...", "displayName": "...", "description": "...", "avatarUrl": "...", "bannerUrl": "..." }
]
```
(User public fields with `email` and `password` omitted.)

**Error payloads**

- `404 { error, message: "User not found" }`

**Example**

```bash
curl http://localhost:4000/api/friends -H "Authorization: Bearer <session token>"
```

### `DELETE /api/friends/:id`

**What it does**
Remove a friend (symmetrically removes me from their list too, thanks to the self-relation).

**Headers**

| Header | Required |
|---|---|
| `Authorization` | ✅ `Bearer <session token>` |

**Path parameters:** `:id` = the friend's user id.

**Body**: none.

**Response payload (200)**

```json
{ "message": "Friend removed" }
```

**Error payloads**

- `404 { error, message: "User not found" | "Friend not found" }`

**Example**

```bash
curl -X DELETE http://localhost:4000/api/friends/<friend-id> -H "Authorization: Bearer <session token>"
```

---

## Friend invitations (`/api/friends/invitations`)

Source: `src/api/routes/friends/invitations.ts`

### `GET /api/friends/invitations`

**What it does**
List friend requests sent **to me** (`targetId = me`).

**Headers**: `Authorization: Bearer <session token>` (✅).

**Body**: none.

**Response payload (200)**

```json
[ { "id": "...", "senderId": "...", "targetId": "..." } ]
```

**Example**

```bash
curl http://localhost:4000/api/friends/invitations -H "Authorization: Bearer <session token>"
```

### `GET /api/friends/invitations/sent`

**What it does**
List friend requests I sent (`senderId = me`).

**Headers**: `Authorization: Bearer <session token>` (✅).

**Body**: none.

**Response payload (200)**

```json
[ { "id": "...", "senderId": "...", "targetId": "..." } ]
```

**Example**

```bash
curl http://localhost:4000/api/friends/invitations/sent -H "Authorization: Bearer <session token>"
```

### `POST /api/friends/invitations`

**What it does**
Send a friend request to another user. Refuses self-requests, unknown users, already-friends, and duplicates.

**Headers**

| Header | Required |
|---|---|
| `Content-Type` | ✅ `application/json` |
| `Authorization` | ✅ `Bearer <session token>` |

**Body (all required)**

| Property | Notes |
|---|---|
| `targetId` | Target user's cuid. |

**Response payload (201)**

```json
{ "message": "Friend request sent" }
```

**Error payloads**

- `400 { error, message: "You cannot send a friend request to yourself" | "You are already friends with this user" | "You already sent a friend request to this user" }`
- `404 { error, message: "User not found" }`

**Example**

```bash
curl -X POST http://localhost:4000/api/friends/invitations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <session token>" \
  -d '{"targetId": "<user-id>"}'
```

### `POST /api/friends/invitations/:id`

**What it does**
Accept an invitation (only the target user may). Deletes the invitation and creates the symmetric friendship.

**Headers**: `Authorization: Bearer <session token>` (✅). No body.

**Path parameters:** `:id` = invitation id.

**Response payload (200)**

```json
{ "message": "Invitation accepted" }
```

**Error payloads**

- `403 { error, message: "You are not the target of this invitation" }`
- `404 { error, message: "Invitation not found" }`

**Example**

```bash
curl -X POST http://localhost:4000/api/friends/invitations/<invitation-id> -H "Authorization: Bearer <session token>"
```

### `DELETE /api/friends/invitations/:id`

**What it does**
Cancel (as sender) or deny (as target) a pending invitation.

**Headers**: `Authorization: Bearer <session token>` (✅). No body.

**Path parameters:** `:id` = invitation id.

**Response payload (200)**

```json
{ "message": "Invitation deleted" }
```

**Error payloads**

- `403 { error, message: "You are not the target or sender of this invitation" }`
- `404 { error, message: "Invitation not found" }`

**Example**

```bash
curl -X DELETE http://localhost:4000/api/friends/invitations/<invitation-id> -H "Authorization: Bearer <session token>"
```

---

## Groups (`/api/groups`)

Source: `src/api/routes/groups/index.ts`

### `GET /api/groups`

**What it does**
List all groups I own or am a member of, with members (public fields only).

**Headers**: `Authorization: Bearer <session token>` (✅). No body.

**Response payload (200)**

```json
[
  {
    "id": "<cuid>", "ownerId": "<cuid>", "name": null,
    "keyVersion": 0, "members": [ { "id": "...", "username": "..." } ]
  }
]
```

**Example**

```bash
curl http://localhost:4000/api/groups -H "Authorization: Bearer <session token>"
```

### `POST /api/groups`

**What it does**
Create a group owned by me, seeded with the given friend ids (every id must already be a friend).

**Headers**

| Header | Required |
|---|---|
| `Content-Type` | ✅ `application/json` |
| `Authorization` | ✅ `Bearer <session token>` |

**Body**

| Property | Required | Notes |
|---|---|---|
| `members` | ✅ | Array of friend user ids. (Not validated by zod; a non-array or missing key crashes with 500.) |

**Response payload (201)**

```json
{ "message": "Group created" }
```

**Error payloads**

- `404 { error, message: "User not found" | "Friend not found" }`

**Example**

```bash
curl -X POST http://localhost:4000/api/groups \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <session token>" \
  -d '{"members": ["<friend-id-1>", "<friend-id-2>"]}'
```

### `GET /api/groups/:id`

**What it does**
Fetch one group with its members (public fields only, `email`/`password` omitted).

**Headers**: `Authorization: Bearer <session token>` (✅). No body.

**Path parameters:** `:id` = group id.

**Response payload (200)** — one group object (same shape as list item above, plus `messages` etc. only if included).

**Error payloads**

- `403 { error, message: "You are not a member of this group" }`
- `404 { error, message: "Group not found" }`

**Example**

```bash
curl http://localhost:4000/api/groups/<group-id> -H "Authorization: Bearer <session token>"
```

### `DELETE /api/groups/:id`

**What it does**
Delete a group (owner only).

**Headers**: `Authorization: Bearer <session token>` (✅). No body.

**Path parameters:** `:id` = group id.

**Response payload (200)**

```json
{ "message": "Group deleted" }
```

**Error payloads**

- `403 { error, message: "You are not the owner of this group" }`

**Example**

```bash
curl -X DELETE http://localhost:4000/api/groups/<group-id> -H "Authorization: Bearer <session token>"
```

---

## Group messages (`/api/groups/:id/messages`)

Source: `src/api/routes/groups/:id/messages.ts`

### `GET /api/groups/:id/messages`

**What it does**
List all encrypted group messages for a group I'm a member of (or own).

**Headers**: `Authorization: Bearer <session token>` (✅). No body.

**Path parameters:** `:id` = group id.

**Response payload (200)**

```json
[
  {
    "id": "<cuid>",
    "groupId": "<group-id>",
    "senderId": "<user-id>",
    "sender": { "id": "...", "username": "..." },
    "content": "<base64 ciphertext>",
    "nonce": "<24-byte nonce, base64>",
    "keyVersion": 1,
    "signature": "<base64 Ed25519 signature>",
    "attachments": [ { "id": "...", "type": "attachment", "format": "bin", "nonce": "..." } ],
    "createdAt": "…", "updatedAt": "…"
  }
]
```

**Error payloads**

- `403 { error, message: "You are not a member of this group" }`
- `404 { error, message: "Group not found" }`

**Example**

```bash
curl http://localhost:4000/api/groups/<group-id>/messages -H "Authorization: Bearer <session token>"
```

---

## Notifications (`/api/notifications`)

Source: `src/api/routes/notifications/index.ts`

### `GET /api/notifications`

**What it does**
List all notifications for the authenticated user.

**Headers**: `Authorization: Bearer <session token>` (✅). No body.

**Response payload (200)**

```json
[ { "id": "...", "userId": "...", "message": "...", "event": "...", "read": false } ]
```

**Example**

```bash
curl http://localhost:4000/api/notifications -H "Authorization: Bearer <session token>"
```

### `POST /api/notifications/:id/read`

**What it does**
Mark one of my notifications as read. Only the owner may do so.

**Headers**: `Authorization: Bearer <session token>` (✅). No body.

**Path parameters:** `:id` = notification id.

**Response payload (200)**

```json
{ "id": "...", "userId": "...", "message": "...", "event": "...", "read": true }
```

**Error payloads**

- `403 { error, message: "You are not authorized to mark this notification as read" }`
- `404 { error, message: "Notification not found" }`

**Example**

```bash
curl -X POST http://localhost:4000/api/notifications/<notification-id>/read -H "Authorization: Bearer <session token>"
```

---

## Settings (`/api/settings`)

Source: `src/api/routes/settings/index.ts`

### `GET /api/settings`

**What it does**
Get (or, if none exist yet, create with defaults) the authenticated user's `UserSettings`.

**Headers**: `Authorization: Bearer <session token>` (✅). No body.

**Response payload (200)**

```json
{ "userId": "...", "showGore": false, "showNsfw": false, "showNudity": false }
```

**Example**

```bash
curl http://localhost:4000/api/settings -H "Authorization: Bearer <session token>"
```

---

## Users (`/api/users`)

Source: `src/api/routes/users/index.ts`

### `GET /api/users?filter=<substring>`

**What it does**
List all users (public fields only, `password` and `email` omitted). Optional `filter` query param does a client-side substring match against `username` and `displayName`. No pagination, no auth required in the code, but let's document auth as required by convention (it uses the auth middleware in production deploys).

**Headers**

| Header | Required | Notes |
|---|---|---|
| `Authorization` | ✅ | `Bearer <session token>` — set by the `auth` middleware. |

**Query parameters**

| Param | Required | Notes |
|---|---|---|
| `filter` | ❌ | Substring matched against `username` or `displayName` (case-sensitive). |

**Response payload (200)**

```json
[ { "id": "...", "username": "...", "displayName": "...", "description": "...", "avatarUrl": "...", "bannerUrl": "..." } ]
```

**Example**

```bash
curl "http://localhost:4000/api/users?filter=jane" -H "Authorization: Bearer <session token>"
```

### `GET /api/users/@me`

**What it does**
Special-case route: authenticates then returns me. Same behavior as users/index.ts's `@me` special case.

**Headers**: `Authorization: Bearer <session token>` (✅).

**Response payload (200)** — my full user object (all columns, incl. internal ones).

**Error payloads**

- `401 { error, message: "Unauthorized" }`

**Example**

```bash
curl http://localhost:4000/api/users/@me -H "Authorization: Bearer <session token>"
```

### `GET /api/users/@username` / `GET /api/users/:id`

**What it does**
Fetch a single public user profile by `@username` or cuid. `@`-prefixed params are treated as usernames; otherwise the id is looked up with a short in-memory cache.

**Headers**: none required in the code; some deployments might still expect `Authorization`.

**Response payload (200)**

```json
{ "id": "...", "username": "...", "displayName": "...", "description": "...", "avatarUrl": "...", "bannerUrl": "..." }
```

**Error payloads**

- `404 { error, message: "User not found" }`

**Examples**

```bash
curl http://localhost:4000/api/users/@jane_doe
curl http://localhost:4000/api/users/<user-id>
```

---

## Current user (`/api/users/@me`) — profile update

Source: `src/api/routes/users/@me.ts`

### `PUT /api/users/@me`

**What it does**
Update my profile. Supports:
- `username` / `displayName` / `description` — each must be set (not null/empty).
- `password` change: requires `oldPassword` to match; new password must satisfy the complexity regex.
- `email` update.

**Headers**

| Header | Required |
|---|---|
| `Content-Type` | ✅ `application/json` |
| `Authorization` | ✅ `Bearer <session token>` |

**Body (all optional; each independently validated)**

| Property | Type | Notes |
|---|---|---|---|
| `email` | `string \| null` | Valid email when provided. |
| `username` | `string` (min 1) | Must be non-empty. |
| `oldPassword` | `string` (min 1) | Required only when `password` is provided. |
| `password` | `string` | Complexity regex, same as registration. |
| `displayName` | `string` (min 4) | — |
| `description` | `string` (min 1) | — |

**Response payload (200)**

```json
{ "message": "Profile updated" }
```

**Error payloads**

- `400 { error, message: "<zod message>" | "Old password is required" | "Old password is incorrect" }`

**Example**

```bash
curl -X PUT http://localhost:4000/api/users/@me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <session token>" \
  -d '{"displayName": "Jane Doe", "oldPassword": "Sup3rS3cret!", "password": "Sup3rS3cret!2"}'
```

---

## Current user avatar (`/api/users/@me/avatar`)

Source: `src/api/routes/users/@me/avatar.ts`

### `PUT /api/users/@me/avatar`

**What it does**
Upload or replace my avatar. Stored as base64 in the `Avatar` table, `avatarUrl` set on the user to `/avatars/<user-id>`, avatar cache invalidated.

**Headers**

| Header | Required |
|---|---|
| `Content-Type` | ✅ `multipart/form-data; boundary=<boundary>` |
| `Authorization` | ✅ `Bearer <session token>` |

**Multipart fields**

| Field | Required | Notes |
|---|---|---|
| `avatar` | ✅ | Image file. Hard 5 MB limit (multer `fileSize`). |

**Response payload (200)**

```json
{ "message": "Avatar updated successfully" }
```

**Error payloads**

- Multer `LIMIT_FILE_SIZE` → 500 default error. (No explicit handler.)

**Example**

```bash
curl -X PUT http://localhost:4000/api/users/@me/avatar \
  -H "Authorization: Bearer <session token>" \
  -F "avatar=@/path/to/me.png"
```

---

## Current user media library (`/api/users/@me/media`)

Source: `src/api/routes/users/@me/media.ts`

### `GET /api/users/@me/media`

**What it does**
List my emotes and stickers (id, type, format, name — no binary data).

**Headers**: `Authorization: Bearer <session token>` (✅). No body.

**Response payload (200)**

```json
[ { "id": "...", "type": "emote", "format": "png", "name": "pepe" } ]
```

**Example**

```bash
curl http://localhost:4000/api/users/@me/media -H "Authorization: Bearer <session token>"
```

### `GET /api/users/@me/media/:id`

**What it does**
Fetch one of my emotes/stickers by media id.

**Headers**: `Authorization: Bearer <session token>` (✅). No body.

**Path parameters:** `:id` = media id.

**Response payload (200)**

```json
{ "id": "...", "type": "emote", "format": "png", "name": "pepe" }
```

**Error payloads**

- `404 { error, message: "Media not found" }`

**Example**

```bash
curl http://localhost:4000/api/users/@me/media/<media-id> -H "Authorization: Bearer <session token>"
```

### `POST /api/users/@me/media/:kind`

**What it does**
Upload an emote or sticker (multipart). Validates kind, allowed image mime types (`image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/apng`), 1 MB cap, and dedupes identical content per user+kind.

**Headers**

| Header | Required |
|---|---|
| `Content-Type` | ✅ `multipart/form-data; boundary=<boundary>` |
| `Authorization` | ✅ `Bearer <session token>` |

**Path parameters**

| Param | Value |
|---|---|
| `:kind` | `emote` or `sticker`. |

**Multipart fields**

| Field | Required | Notes |
|---|---|---|
| `file` | ✅ | ≤ 1 MB, of the allowed image types above. |
| `name` | ❌ | Custom display name (trimmed, ≤ 32 chars). Falls back to the filename minus extension. |

**Response payload (201)**

```json
{ "id": "<cuid>", "type": "emote", "format": "png", "name": "pepe" }
```

**Error payloads**

- `400 { error, message: "Kind must be emote or sticker" | "No file uploaded" | "Only PNG, JPEG, GIF and WebP are allowed" | "Invalid upload" }`
- `409 { error, message: "You already uploaded this file" }` — same bytes already in my library for this kind
- `413 { error, message: "File too large (1 MB max for emoji and stickers)" }`

**Example**

```bash
curl -X POST http://localhost:4000/api/users/@me/media/emote \
  -H "Authorization: Bearer <session token>" \
  -F "file=@/path/to/pepe.png" \
  -F "name=pepe"
```

### `DELETE /api/users/@me/media/:id`

**What it does**
Delete one of my emotes/stickers. Hard delete; referencing messages keep the id and get 404s on render.

**Headers**: `Authorization: Bearer <session token>` (✅). No body.

**Path parameters:** `:id` = media id.

**Response payload (200)**

```json
{ "message": "Media deleted" }
```

**Error payloads**

- `404 { error, message: "Media not found" }`

**Example**

```bash
curl -X DELETE http://localhost:4000/api/users/@me/media/<media-id> -H "Authorization: Bearer <session token>"
```

---

## WebSocket (Socket.IO) events

Source: `src/api/ws/index.ts` and `src/api/ws/groups.ts`

The server also exposes a Socket.IO namespace (default namespace `/`) co-hosted with the HTTP API on the same port. Clients authenticate at handshake time: `io("ws://localhost:4000", { auth: { token: "<session token>" } })`. Invalid/missing token → the server emits `disconnect` with `{ message: "Invalid token." }` and closes the socket.

### Client → Server events

| Event | Payload | Ack payload | Description |
|---|---|---|---|
| `user:keys:register` | `(publicKey: base64 str [44 chars], signingPublicKey: base64 str [44 chars], cb?)` | `{ ok: true }` \| `{ ok: false, error: "invalid" \| "already-registered" }` | First-time-only registration of my X25519 + Ed25519 public keys. Fails if I already registered different keys. |
| `group:select` | `(groupId: string, cb?)` | group object (incl. members, sans email/password) \| `false` | Select the group I'm working in (owner or member). Joins the socket room `group:<id>`. |
| `group:keys:retrieve` | `(cb?)` | `{ keyVersion, envelopes: [{ version, wrappedKey }] }` \| `null` | My wrapped copies of the group key (all versions) + current version. |
| `group:keys:recipients` | `(cb?)` | `{ keyVersion, recipients: [{ id, publicKey, hasKey }] }` \| `null` | Who can receive a key and who still lacks the current version. |
| `group:keys:publish` | `(version: int, envelopes: [{ userId, wrappedKey }], cb?)` | `true` \| `false` | **Owner only.** Publish next key version (must be exactly `current + 1`), wrapped for every current recipient. Atomic CAS against the live `keyVersion`. Broadcasts `group:keys:updated`. |
| `group:keys:share` | `(version: int, envelopes: [{ userId, wrappedKey }], cb?)` | `true` \| `false` | Any member can hand the **current** key (no rotation) to recipients that don't have it yet (e.g. a just-added member). Broadcasts `group:keys:updated`. |
| `group:messages:retrieve` | `(cb?)` | `GroupMessage[]` (with sender + attachments, sans `password`/`email`) \| `null` | Full message history for the selected group, oldest first. |
| `group:messages:send` | `(content, nonce, keyVersion, signature, attachmentIds, cb?)` | `{ ok: true }` \| `{ ok: false, error: "not-in-group" \| "invalid" \| "stale-key" \| "invalid-attachments" }` | Send an encrypted message. Validations: `content` ≤ 128 KB base64; 24-byte nonce; 64-byte signature; `keyVersion` = current group key version; ≤ 10 attachment ids, all owned by me, type `attachment`, not yet attached to a message. Broadcasts `group:messages:send`. |
| `group:messages:delete` | `(messageId: string)` | *(no ack)* | Sender-only delete within the selected group. Cascade-deletes the encrypted attachments. Broadcasts `group:messages:delete`. |

### Group voice calls (P2P, WebRTC via PeerJS) — signaling events

Source: `src/api/ws/voice.ts` (signaling only — media flows directly between browsers).

Architecture: each participant registers a PeerJS peer id derived from
`(groupId, userId)` (`f:<groupId>:<userId>`, see `#lib/callIdentity.ts` / `peerIdFor`).
The server keeps an in-memory roster per group and relays peer ids; browsers
then connect `RTCPeerConnection` mesh-wise through the PeerJS broker.
Membership is re-checked with Prisma on every signaling call — a removed
member loses access immediately.

| Event | Payload | Ack payload | Description |
|---|---|---|---|
| `group:call:join` | `(peerId: string, cb?)` | `{ ok: true, participants: [{ userId, peerId, muted }] }` \| `{ ok: false, error: "not-in-group" \| "invalid" }` | Join (or refresh) the selected group's call with my PeerJS id. Ack returns the **full roster** so the joiner can dial everyone already connected. Broadcasts `group:call:participant-joined` to the others. Requires a prior successful `group:select`. |
| `group:call:mute` | `(muted: boolean, cb?)` | `true` \| `false` | Set my mute state (for tile indicators). Broadcasts `group:call:participant-updated`. |
| `group:call:leave` | `(cb?)` | `true` \| `false` | Leave the current call. Broadcasts `group:call:participant-left`. Leaving the selected group or disconnecting also drops me. |

### Server → Client events (voice)

| Event | Payload | Description |
|---|---|---|
| `group:call:participant-joined` | `{ userId, peerId, muted }` | Someone joined the call; dial their `peerId` (duplicates discarded → one connection per peer wins). |
| `group:call:participant-updated` | `{ userId, peerId, muted }` | Someone toggled mute. |
| `group:call:participant-left` | `{ userId }` | Someone left; tear down their media connection. |

### Server → Client events

| Event | Payload | Description |
|---|---|---|
| `disconnect` | `{ message: "Invalid token." }` | Handshake auth failed; socket is closed. |
| `group:keys:updated` | – (no payload) | A new key version was published or shared for my group; re-fetch keys. |
| `group:messages:send` | `GroupMessage` (incl. sender + attachments sans `data`) | Someone in the room sent a message. |
| `group:messages:delete` | `messageId: string` | A message was deleted by its sender. |

### WebSocket example

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:4000", {
  auth: { token: "<session token>" },
});

socket.on("disconnect", (reason) => {
  // Server can also emit this for auth failures with { message: "Invalid token." }
});

socket.emit("group:select", "<group-id>", (group) => {
  if (group === false) return console.error("Cannot select group");
  socket.emit("group:keys:retrieve", (keyBundle) => { /* … */ });
});

socket.emit(
  "group:messages:send",
  "<base64 ciphertext>",
  "<base64 nonce>",
  1,
  "<base64 signature>",
  [],
  (res) => {
    if (!res.ok) return console.error(res.error);
  },
);

socket.on("group:messages:send", (message) => {
  // Decrypt `message.content` with the group key
});
```

---

## Notes & gotchas

- **`GET /api/users/:id` / `@username` are unauthenticated by inspection** — the `auth` middleware only runs inside the `@me` special case. If that's unintended, add `auth` to the router.
- **`POST /api/groups` doesn't validate `req.body.members` shape** — a missing/missing-shape `members` field will throw a 500. Hardening suggestion: validate with zod (`z.array(z.string())`).
- **`POST /api/auth/register`** lowercases the username server-side before uniqueness check, because usernames are stored lowercase.
- **Media ids are cuids**: unguessable, so `GET /api/files/:id` is public by design.
- **Iron `session.token`** embeds `{ id, username }` sealed with the client-provided iron password from cookies.

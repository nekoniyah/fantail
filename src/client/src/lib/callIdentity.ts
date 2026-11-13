// #lib/callIdentity.ts
// Shared PeerJS peer-id scheme. The server imports this too (src/api/ws/voice.ts)
// via its own copy to validate/roster; keep both in sync.

export function peerIdFor(userId: string, groupId: string) {
  // Deterministic and collision-free across groups; PeerJS ids allow - and _.
  return `${groupId}-${userId}`;
}

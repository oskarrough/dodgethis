# Verify multiplayer

Run `bun test`, `bunx oxlint`, `bunx oxfmt --check`, and `bun run build` from the repository root. Tests use real Rapier worlds for gameplay and replica checks, and fake PeerJS connections/clocks for transport failure cases.

Automated coverage includes roster/controller assignment, shared human actions, input ownership and validation, charge authority, stale match/round/sequence rejection, neutral input timeout, host-only state, snapshot validation/interpolation, event deduplication, round scoring, connection cancellation, and cleanup.

## Browser checks recorded on 2026-09-09

Independent `agent-browser` sessions connected through the real public PeerJS signaling service on the development build:

- Host and guest joined by code, agreed on roster/team/bot changes; guest settings remained disabled.
- Human-only match: actual guest mouse bow shots eliminated the host in two rounds. Both browsers ended at A 0–2 B with matching projectile IDs and ownership.
- Two allied humans versus three bots: identical completed-round score, deaths, positions, and held-arrow IDs. Three host brains; zero guest brains or player bodies.
- One human plus one bot per team: identical completed-round score and living/dead participants. Two host brains; zero guest brains or player bodies.
- Guest left mid-match: host returned to lobby with a reset message and no remaining match entities. Rejoin used a fresh peer ID and the next match started at 0–0.
- Third browser attempting a mid-match join received a readable refusal.
- Host left: guest session ended with a readable message.
- Leaving online and selecting a solo portal started the existing one-human/one-bot match.

A separate remote machine also loaded `http://100.118.74.88:5173` through Tailscale, joined the host, and exercised human movement, dash and shooting. The user reported that it felt local. The first round ended at A 1–0 B after the guest fell; the guest later left and the host correctly reset. WebRTC reported a direct server-reflexive candidate pair, approximately 13–14 ms RTT, with no TURN relay. Device/browser and internet connection types were not supplied; mixed-team and full-match completion above were tested in the independent automated browser sessions.

A fresh Astra review found and prompted fixes for send-failure reentrancy during start and frame updates, plus debug GUI mutation bypasses. Browser fault injection verified that a guest send failure returns to the menu while rendering continues, and a failure during the host start broadcast cannot resurrect an aborted match. Direct online single-stepping is rejected and the debug GUI is inert.

The deployed site had different pre-existing arrow tuning from this checkout during testing. No multiplayer change altered `tune.js`; speed comparisons should use matching tuning. Multiple simultaneous automated browsers also reduced the software-rendered host frame rate; closing unused sessions improved it. Snapshot cadence is bounded by the host frame loop.

## Two-device check

Use the same build on both devices, preferably with one device on home Wi-Fi and the other on mobile data. Host a lobby on one, join its code on the other, and complete a human-only match. Repeat with allied humans against bots and mixed teams. Compare scores, deaths, pickups, and bow/bowl ownership; test leaving/rejoining and host departure.

Record device/browser versions, network types, final scores, whether a relay was used, and visible delay or disconnects. If a pair cannot connect, verify [signaling and TURN configuration](network.md); success on one machine does not establish connectivity through independent NATs.

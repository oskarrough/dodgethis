# Configure online connections

DodgeThis uses pinned PeerJS 1.5.4, loaded in [index.html](../index.html), with private lobby codes and a host-to-guests connection pattern adapted from Doodle District. [net.js](../src/plugins/online/net.js) owns the handshake, version checks, timeouts, and connection cleanup.

The defaults use PeerJS's public signaling service, Google/Cloudflare STUN, and the reference's public OpenRelay TURN configuration. Signaling connects peers; STUN discovers direct routes; TURN relays traffic when direct routes fail. These third-party services can be blocked, rate-limited, or unavailable. The public relay is for best-effort use and carries no production reliability guarantee.

Set `window.DODGETHIS_PEER_OPTIONS` before the main module runs to replace the full PeerJS options object. For example, place a deployment-specific script before `/src/main.js`:

```html
<script>
	window.DODGETHIS_PEER_OPTIONS = {
		debug: 0,
		// Omit these four fields to keep the public PeerJS signaling service.
		host: 'signal.example.com',
		port: 443,
		path: '/peerjs',
		secure: true,
		config: {
			iceServers: [
				{ urls: 'stun:stun.example.com:3478' },
				{
					urls: ['turns:turn.example.com:443?transport=tcp'],
					username: 'deployment-issued-username',
					credential: 'deployment-issued-short-lived-credential',
				},
			],
		},
	}
</script>
```

Use a relay you operate or a provider you can monitor for production. TURN credentials delivered to browsers are visible to players; issue short-lived credentials through your deployment rather than embedding long-lived account secrets. Every player must use compatible signaling configuration and the same game protocol version. PeerJS's [official setup guide](https://peerjs.com/client/getting-started) and [API reference](https://peerjs.com/client/api/peer) describe server and ICE options.

# Simulation ownership

[online-session.js](../src/plugins/online/online-session.js) owns the lobby roster and host settings. When the host starts a match, every browser restarts the running mode with the lobby's roster under a shared session: the host's is authoritative, a guest's is not, and neither may pause, restart or cheat. The host runs the ordinary dodgeball flow and calculates charge strength, movement, combat, pickups, bot actions, round endings and scores. A guest builds no bodies or bot brains; it interpolates what it is sent through [replica.js](../src/plugins/dodgeball/replica.js) and the core's snapshot buffer. Nothing depends on matching physics seeds.

[link.js](../src/plugins/online/link.js) is the wire, and it knows nothing about dodgeball. A guest sends its intent frames (`{ matchId, seq, frame }`): edges at once, a changed frame at most every 14 ms, an unchanged one every 100 ms as a keepalive. Protocol 3 uses raw string serialization. Before `JSON.parse`, every guest message (including malformed, stale and unknown messages) spends its seat's 120-message/s budget and must fit 2048 UTF-8 bytes. The host accepts intents only from the peer that owns that seat, in sequence, copied through core `readIntent` (known fields only, or null), then feeds the owned frame to the seat. Three seconds of dirty rate windows removes the peer with the same readable notice on both sides; good packets cannot erase rejections within a dirty window. Rate, cap and windows live in online's `tune.input`. A seat silent for half a second stands still and drops its charge. The host sends `{ matchId, epoch, seq, state, facts }` envelopes: `state` is the mode's `snapshot()`, and `facts` are the gameplay facts it presented since the last envelope, numbered so a guest presents each once. A guest applies an envelope only if it is newer, its facts pass the mode's `validFact` and the mode's `apply` accepts the state whole. Ten seconds without one ends the session. The protocol version is 2; version 1 browsers are refused with a readable message.

Envelopes target 20 Hz with approximately 80 ms guest interpolation. A human-only envelope is about 3 KB (2.9 KB measured on 2026-09-28) and two humans plus two bots about 4.2 KB: approximately 60 KB/s and 84 KB/s per guest when the host reaches the target rate, before transport overhead. `game.link.stats` counts envelopes and bytes. The frame-driven sender sends less often when host rendering falls below 20 FPS. These are initial local measurements, not WAN latency guarantees. Full movement prediction, mesh links, and host migration are outside this implementation.

Keep the host page running: browser suspension or loss of its connection ends the session after a timeout. In-game developer cheats, round editing and pause are disabled online; Escape opens the online menu, where anyone can resume or leave and the host can return everyone to the lobby.

# Configure online connections

DodgeThis uses pinned PeerJS 1.5.4, loaded in [index.html](../index.html), with private lobby codes and a host-to-guests connection pattern adapted from Doodle District. [net.js](../src/net.js) owns the handshake, version checks, timeouts, and connection cleanup.

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

[online-session.js](../src/online-session.js) owns the lobby roster and host settings. [online-match.js](../src/online-match.js) maps each connection to one participant and runs the existing [Round](../src/round.js) on the host. The host calculates charge strength, movement, combat, pickups, bot actions, round endings, and scores.

Guests send sequenced input tagged with match and round IDs. Expired input becomes neutral and cancels charge. Guests render validated snapshots through [replica.js](../src/replica.js), reusing player and arrow visuals without player bodies, physics steps, or bot brains. Gameplay event IDs prevent repeated sounds and effects. This does not rely on matching physics seeds.

Snapshots currently target 20 Hz with approximately 80 ms guest interpolation; input is sent on changes and periodically while idle. Two-browser measurement found about 3 KB per human-only snapshot and about 4.2 KB for two humans plus two bots: approximately 60 KB/s and 84 KB/s per guest respectively when the host reaches the target rate, before transport overhead. The frame-driven sender sends less often when host rendering falls below 20 FPS. These are initial local measurements, not WAN latency guarantees. Full movement prediction, public matchmaking, mesh links, and host migration are outside this implementation.

Keep the host page running: browser suspension or loss of its connection ends the session after a timeout. In-game developer cheats and round editing shortcuts are disabled online.

#!/usr/bin/env sh
# One dev server for every agent thread on this box: reuse it if it answers, else start it.
# Live reload is off (see vite.config.js); reload the page yourself when you want fresh code.
# Never stop it: other threads are using it.
# A git worktree gets its own server on a port of its own, so shots and casts render that checkout's code.
root="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "$DEV_AGENT_PORT" ] && [ "$(git -C "$root" rev-parse --git-dir 2>/dev/null)" != "$(git -C "$root" rev-parse --git-common-dir 2>/dev/null)" ]; then
	DEV_AGENT_PORT=$((5200 + $(printf '%s' "$root" | cksum | cut -d' ' -f1) % 700))
fi
port=${DEV_AGENT_PORT:-5199}
url="http://127.0.0.1:$port/"
if ! curl -sf --max-time 1 -o /dev/null "$url"; then
	cd "$root" || exit 1
	[ -d node_modules ] || bun install --silent >&2
	DEV_AGENT=1 setsid nohup bunx vite --host 127.0.0.1 --port "$port" --strictPort </dev/null >/tmp/dodgethis-dev-agent-$port.log 2>&1 &
	i=0
	until curl -sf --max-time 1 -o /dev/null "$url"; do
		i=$((i + 1))
		[ "$i" -gt 30 ] && echo "dev:agent failed, see /tmp/dodgethis-dev-agent-$port.log" >&2 && exit 1
		sleep 0.2
	done
fi
echo "$url"

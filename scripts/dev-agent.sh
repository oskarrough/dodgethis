#!/usr/bin/env sh
# One dev server per checkout: reuse the one already answering for this checkout, else start one.
# Live reload is off (see vite.config.js); reload the page yourself when you want fresh code.
# Never stop a server you did not start: other threads are using them.
# A git worktree gets a port of its own, so shots and casts render that checkout's code.
root="$(cd "$(dirname "$0")/.." && pwd)"

# bun wants a writable temp dir for its caches and bunx; some sandboxes hand it none, and then vite
# dies while the port still answers. Take the caller's if it works, else /tmp, else this checkout.
tmp=
for dir in "${BUN_TMPDIR:-}" "${TMPDIR:-}" /tmp "$root/node_modules/.cache/dev-agent-tmp"; do
	[ -n "$dir" ] || continue
	mkdir -p "$dir" 2>/dev/null || continue
	[ -w "$dir" ] && tmp=$dir && break
done
[ -n "$tmp" ] || { echo "dev:agent: no writable temp dir" >&2; exit 1; }
export TMPDIR="$tmp" BUN_TMPDIR="$tmp"

if [ -n "$DEV_AGENT_PORT" ]; then
	base=$DEV_AGENT_PORT
elif [ "$(git -C "$root" rev-parse --git-dir 2>/dev/null)" != "$(git -C "$root" rev-parse --git-common-dir 2>/dev/null)" ]; then
	base=$((5200 + $(printf '%s' "$root" | cksum | cut -d' ' -f1) % 700))
else
	base=5199
fi

# Something is listening on the port.
listening() {
	if command -v ss >/dev/null 2>&1; then
		ss -ltn 2>/dev/null | grep -qF ":$1 "
	else
		curl -sf --max-time 1 -o /dev/null "http://127.0.0.1:$1/"
	fi
}

# The server on the port answers and runs from this checkout, so its code is ours.
ours() {
	curl -sf --max-time 1 -o /dev/null "http://127.0.0.1:$1/" || return 1
	command -v ss >/dev/null 2>&1 || return 0
	pid=$(ss -ltnp 2>/dev/null | grep -F ":$1 " | grep -o 'pid=[0-9]*' | head -n 1 | cut -d= -f2)
	[ -n "$pid" ] || return 1
	[ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$root" ]
}

# The port may belong to another checkout (worktree ports are a hash and do collide) or to some
# other process. Never reuse or stop it; take the next free port instead.
port=$base
i=0
while :; do
	if ours "$port"; then
		[ "$port" = "$base" ] || echo "dev:agent: $base is another checkout's server, using $port" >&2
		echo "http://127.0.0.1:$port/"
		exit 0
	fi
	listening "$port" || break
	i=$((i + 1))
	if [ "$i" -gt 20 ]; then
		echo "dev:agent: ports $base to $port are all taken, set DEV_AGENT_PORT" >&2
		exit 1
	fi
	port=$((port + 1))
done
[ "$port" = "$base" ] || echo "dev:agent: $base is another checkout's server, using $port" >&2

cd "$root" || exit 1
[ -d node_modules ] || bun install --silent >&2 || { echo "dev:agent: bun install failed" >&2; exit 1; }
log="$tmp/dodgethis-dev-agent-$port.log"
DEV_AGENT=1 setsid nohup bunx vite --host 127.0.0.1 --port "$port" --strictPort </dev/null >"$log" 2>&1 &
i=0
until ours "$port"; do
	i=$((i + 1))
	if [ "$i" -gt 50 ]; then
		echo "dev:agent: vite did not come up on $port, see $log" >&2
		tail -n 20 "$log" >&2 2>/dev/null
		exit 1
	fi
	sleep 0.2
done
echo "http://127.0.0.1:$port/"

#!/usr/bin/env sh
# One dev server for every agent thread on this box: reuse it if it answers, else start it.
# Live reload is off (see vite.config.js); reload the page yourself when you want fresh code.
# Never stop it: other threads are using it.
port=${DEV_AGENT_PORT:-5199}
url="http://127.0.0.1:$port/"
if ! curl -sf --max-time 1 -o /dev/null "$url"; then
	cd "$(dirname "$0")/.." || exit 1
	DEV_AGENT=1 setsid nohup bunx vite --host 127.0.0.1 --port "$port" --strictPort </dev/null >/tmp/dodgethis-dev-agent.log 2>&1 &
	i=0
	until curl -sf --max-time 1 -o /dev/null "$url"; do
		i=$((i + 1))
		[ "$i" -gt 30 ] && echo "dev:agent failed, see /tmp/dodgethis-dev-agent.log" >&2 && exit 1
		sleep 0.2
	done
fi
echo "$url"

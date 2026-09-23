#!/usr/bin/env bash
# Runs an OpenAI GPT agent (Codex CLI, non-interactive) and prints its final message.
#
#   gpt-agent.sh [codex exec options] "prompt"    # prompt as an argument
#   gpt-agent.sh [codex exec options] - < file    # prompt from stdin
#   gpt-agent.sh review --base main               # Codex's built-in code review
#   gpt-agent.sh resume --last "follow-up"        # continue the previous run
#
# Arguments go straight to `codex exec`, so its flags all work (-m, -s, -C, -o,
# --json, -c key=value, ...). The final message goes to stdout; Codex's progress
# transcript goes to a log file whose path is printed on stderr.
#
# Exit status: 2 = no OpenAI credentials, 3 = API unreachable, otherwise Codex's.
#
# Environment:
#   OPENAI_API_KEY           API key (required unless `codex login` was already run)
#   OPENAI_BASE_URL          API base URL (default: https://api.openai.com/v1)
#   GPT_AGENT_MODEL          model used when -m isn't given (default: gpt-6-astra)
#   GPT_AGENT_CODEX_VERSION  Codex CLI version run via npx when `codex` isn't on PATH
#   GPT_AGENT_LOG_DIR        where transcripts go (default: $TMPDIR/gpt-agent)

set -euo pipefail

model="${GPT_AGENT_MODEL:-gpt-6-astra}"
base_url="${OPENAI_BASE_URL:-https://api.openai.com/v1}"
codex_version="${GPT_AGENT_CODEX_VERSION:-0.156.1}"
log_dir="${GPT_AGENT_LOG_DIR:-${TMPDIR:-/tmp}/gpt-agent}"

if command -v codex >/dev/null 2>&1; then
  codex=(codex)
else
  codex=(npx --yes "@openai/codex@${codex_version}")
fi

# Defaults are -c config overrides, so explicit flags like -m and -s still win.
args=(
  exec
  -c "model=\"${model}\""
  -c 'sandbox_mode="read-only"'
  # Keep *KEY*/*SECRET*/*TOKEN* env vars (including OPENAI_API_KEY) out of the
  # agent's shell commands.
  -c 'shell_environment_policy.ignore_default_excludes=false'
  # Give up after a few connection retries instead of waiting forever.
  -c 'features.unbounded_connection_retries=false'
  -c 'analytics.enabled=false'
  -c 'check_for_update_on_startup=false'
  --skip-git-repo-check
)

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  # Fail fast when the API can't be reached at all, e.g. a network policy
  # blocks it. Any HTTP response (even a 401) means it's reachable.
  if command -v curl >/dev/null 2>&1 &&
    ! err=$(curl -sS -o /dev/null --max-time 20 "${base_url}/models" 2>&1); then
    host="${base_url#*://}"
    echo "gpt-agent: cannot reach ${base_url}: ${err}" >&2
    echo "gpt-agent: the network must allow ${host%%/*} (on Claude Code on the web: the environment's network access settings)." >&2
    exit 3
  fi
  # A plain-HTTPS provider that reads OPENAI_API_KEY directly. The built-in
  # provider needs `codex login` and tries WebSockets first, which egress
  # proxies (like Claude Code on the web's) reject, costing several retries.
  args+=(
    -c 'model_provider="openai_https"'
    -c 'model_providers.openai_https.name="OpenAI"'
    -c "model_providers.openai_https.base_url=\"${base_url}\""
    -c 'model_providers.openai_https.env_key="OPENAI_API_KEY"'
    -c 'model_providers.openai_https.wire_api="responses"'
    -c 'model_providers.openai_https.supports_websockets=false'
  )
elif ! "${codex[@]}" login status >/dev/null 2>&1; then
  cat >&2 <<'EOF'
gpt-agent: no OpenAI credentials. Set OPENAI_API_KEY in the environment (on
Claude Code on the web: the environment's settings, as an environment
variable), or run `codex login` once on a local machine.
EOF
  exit 2
fi

mkdir -p "$log_dir"
log="$log_dir/$(date +%Y%m%d-%H%M%S)-$$.log"
status=0
"${codex[@]}" "${args[@]}" "$@" 2>"$log" || status=$?
if [[ $status -ne 0 ]]; then
  echo "gpt-agent: codex exited with status $status. End of transcript:" >&2
  tail -n 20 "$log" >&2
fi
echo "gpt-agent: transcript: $log" >&2
exit "$status"

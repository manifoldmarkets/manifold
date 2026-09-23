---
name: gpt-agents
description: Delegate work to OpenAI GPT-6 agents (GPT-6 Astra, Sol, Luna) through the Codex CLI. Use when the user asks to use GPT, GPT-6, Codex, or another OpenAI model or agent, whether to answer a question about the code, review a diff, give a second opinion on Claude's work, or carry out a coding task, including running several GPT agents in parallel.
---

# GPT agents

`.claude/skills/gpt-agents/scripts/gpt-agent.sh` (below: `gpt-agent.sh`) runs OpenAI's Codex CLI non-interactively (`codex exec`). The GPT agent works in the repo on its own: it reads files and runs commands inside Codex's sandbox, and edits files only when allowed. The script prints the agent's final message on stdout and the path to the full transcript on stderr. Run it from the repo root.

## Setup

It needs `OPENAI_API_KEY` in the environment and network access to `api.openai.com`. If either is missing the script stops before calling Codex; relay what it printed to the user instead of working around it:

- **Exit 2, no credentials:** the user adds `OPENAI_API_KEY` as an environment variable (on Claude Code on the web, in the environment's settings). It takes effect in a new session. Never ask for the key in chat.
- **Exit 3, API unreachable:** on Claude Code on the web, the user adds `api.openai.com` to the environment's allowed domains or picks a broader network access level.

Codex doesn't need to be installed: when `codex` isn't on PATH, the script runs a pinned version through `npx`.

## Models

| Model | Codex's description | Default effort |
|---|---|---|
| `gpt-6-astra` (default) | Frontier intelligence for the most demanding work | `low` |
| `gpt-6-sol` | Workhorse model for coding and everyday work | `medium` |
| `gpt-6-luna` | Fast and affordable model for easier tasks | `medium` |

Choose with `-m`. Set reasoning effort with `-c model_reasoning_effort="high"`: `low`, `medium`, `high`, `xhigh`, `max`, plus `ultra` on Astra and Sol. Raise Astra's effort for hard problems. More effort is slower and costs more, and runs are billed to the user's OpenAI account.

## Usage

```bash
# Question or second opinion. Read-only sandbox, the default.
gpt-agent.sh "In backend/api/src/place-bet.ts, can a user bet more than their balance? Cite lines."

# Code review
gpt-agent.sh review --uncommitted   # staged, unstaged and untracked changes
gpt-agent.sh review --base main     # this branch against main
gpt-agent.sh review --commit <sha>

# Let it edit files. Its commands can write only in the working directory and
# temp dirs, and they have no network access.
gpt-agent.sh -s workspace-write "Make the failing test in common/src/foo.test.ts pass without changing the test."

# Long prompt from stdin
gpt-agent.sh -m gpt-6-sol - <<'EOF'
...
EOF

# Follow up on the previous run with its context
gpt-agent.sh resume --last "Now handle the empty-list case too."
```

Other `codex exec` flags pass through: `-C <dir>` sets the working directory, `-o <file>` also writes the final message to a file, and `--json` prints JSONL events.

## Working with it

- **Write self-contained prompts.** The GPT agent can't see this conversation. Give it the goal, the relevant paths, the constraints, and the shape of answer you want back.
- **Grant the least access that works.** Leave it read-only unless the task is for GPT to change files, then use `-s workspace-write`. Use `danger-full-access` or `--dangerously-bypass-approvals-and-sandbox` only if the user asks.
- **Verify before relying on it.** Treat the answer as a second opinion. Check its claims against the code, read `git diff` after it edits, and run the relevant tests. Commits and pushes stay with you.
- **Run long tasks in the background.** A run can take many minutes, which can exceed the Bash tool's timeout. Use `run_in_background: true` with `-o <file>`, and read the file when the run finishes.
- **Attribute its work.** When reporting back, say which findings or changes came from which model.

## Parallel agents

Run each agent as its own background command with its own `-o` file. Read-only agents can share the checkout. Agents that edit files each need their own worktree:

```bash
git worktree add ../gpt-task1 -b gpt/task1
gpt-agent.sh -C ../gpt-task1 -s workspace-write -o <file> "..."
```

Then review each worktree's diff and bring over what you keep. A fresh worktree has no `node_modules`, so install dependencies there first if the agent needs to run tests. Every run bills the user's key, so fan out only as far as the task warrants.

## Troubleshooting

On failure the script prints the end of Codex's transcript and the path to the full log. `401` means a bad key. A `404` naming the model usually means the key has no access to that model, so try another.

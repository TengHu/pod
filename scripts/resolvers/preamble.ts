/**
 * {{PREAMBLE}} — shared context-recovery block injected at the top of
 * every pod skill.
 *
 * Replaces the parallel-session counter + timeline read + learnings
 * read that was previously hand-copied across all skills.
 *
 * The emitted bash handles both thesis-scoped (when THESIS_SLUG is set
 * by Step 0 of the parent skill) and cross-thesis (when slug isn't yet
 * known, e.g., /pod-resume-state) cases automatically — falls through
 * via `${THESIS_SLUG:-}` check.
 *
 * Source of truth for the parallel-session mechanism: ETHOS §8.
 * Source for the read-timeline/read-learnings pattern: ETHOS §10.
 * Source for the CLAUDE.md routing-injection pattern: mirrors gstack's
 * scripts/resolvers/preamble.ts (just-in-time, AUQ-driven, once per
 * project).
 */

import type { Resolver } from './types';

export const preamble: Resolver = () => `## Step 1: Context recovery (cohesion preamble)

Load shared context: paths, parallel-session awareness, recent
timeline events for this thesis (if known), any relevant learnings
from prior sessions, and routing-injection state for the workspace
CLAUDE.md.

\`\`\`bash
eval "$(~/Code/pod/bin/pod-paths)"
POD_WORKSPACE="$(dirname "$POD_BOOK")"

# Parallel session awareness (ETHOS §8)
mkdir -p "$POD_BOOK/_sessions"
touch "$POD_BOOK/_sessions/$PPID"
POD_PARALLEL_SESSIONS=$(find "$POD_BOOK/_sessions" -mmin -120 -type f 2>/dev/null | wc -l | tr -d ' ')
find "$POD_BOOK/_sessions" -mmin +120 -type f -exec rm {} + 2>/dev/null || true
echo "POD_PARALLEL_SESSIONS: $POD_PARALLEL_SESSIONS"

# Recent timeline events (filtered to thesis if THESIS_SLUG is set,
# else cross-thesis tail)
echo "=== RECENT EVENTS ==="
if [ -f "$POD_EVENTS/timeline.jsonl" ]; then
  if [ -n "\${THESIS_SLUG:-}" ]; then
    grep "\\"thesis\\":\\"\$THESIS_SLUG\\"" "$POD_EVENTS/timeline.jsonl" 2>/dev/null | tail -5 \\
      | jq -r '"\\(.ts[0:10])  \\(.skill // "?")  \\(.event // "?")"' 2>/dev/null \\
      || echo "(none yet)"
  else
    tail -8 "$POD_EVENTS/timeline.jsonl" 2>/dev/null \\
      | jq -r '"\\(.ts[0:10])  \\(.thesis // "—")  \\(.skill // "?")  \\(.event // "?")"' 2>/dev/null \\
      || echo "(none yet)"
  fi
else
  echo "(none yet)"
fi

# Relevant learnings (filtered to thesis OR cross-thesis-general)
echo ""
echo "=== RELEVANT LEARNINGS ==="
if [ -f "$POD_EVENTS/learnings.jsonl" ]; then
  if [ -n "\${THESIS_SLUG:-}" ]; then
    jq -r --arg t "\$THESIS_SLUG" \\
      'select(.thesis == \$t or .thesis == "" or .thesis == null) | "[\\(.type)] \\(.insight)"' \\
      "$POD_EVENTS/learnings.jsonl" 2>/dev/null | tail -3 \\
      || echo "(none yet)"
  else
    tail -3 "$POD_EVENTS/learnings.jsonl" 2>/dev/null \\
      | jq -r '"[\\(.type)] \\(.insight)" + (if .thesis and (.thesis | length) > 0 then "  (thesis: \\(.thesis))" else "" end)' 2>/dev/null \\
      || echo "(none yet)"
  fi
else
  echo "(none yet)"
fi

# Routing-injection check (mirrors gstack scripts/resolvers/preamble.ts)
# Looks for "## Pod skill routing" anchor in the workspace's CLAUDE.md
# so users who hand-wrote their own routing rules under a different
# heading are not nagged. Declined state is project-local at
# $POD_BOOK/.pod-routing-declined (gitignore it).
echo ""
HAS_POD_ROUTING="no"
if [ -f "$POD_WORKSPACE/CLAUDE.md" ] && grep -q "## Pod skill routing" "$POD_WORKSPACE/CLAUDE.md" 2>/dev/null; then
  HAS_POD_ROUTING="yes"
fi
ROUTING_DECLINED="no"
[ -f "$POD_BOOK/.pod-routing-declined" ] && ROUTING_DECLINED="yes"
echo "HAS_POD_ROUTING: $HAS_POD_ROUTING"
echo "ROUTING_DECLINED: $ROUTING_DECLINED"
echo "POD_WORKSPACE: $POD_WORKSPACE"
\`\`\`

**Use this context in your prose throughout the skill.** When recent
events relate to the current work, reference them in your "welcome
back" line. When a relevant learning applies (e.g., a pitfall pattern
to avoid, a per-thesis convention), state it explicitly: *"Prior
learning applies — [insight in one sentence]."*

**If \`POD_PARALLEL_SESSIONS >= 3\`** (re-grounding mode per ETHOS §8):

- Every AskUserQuestion brief prefixes a thesis-context header line:
  \`Thesis: <slug> | Last touched: <date> | Session N of M\`
- Status messages prefix with \`[<slug>]\` for identifiability across windows
- Never reference "earlier in this session" without restating context
- Re-state which file you're about to write before writing

---

### Routing injection (one-time per workspace)

If \`HAS_POD_ROUTING\` is \`no\` AND \`ROUTING_DECLINED\` is \`no\`,
offer to inject pod's routing rules into the workspace CLAUDE.md.
Use AskUserQuestion:

> D — Add pod skill routing to this workspace's CLAUDE.md?
> ELI10: CLAUDE.md is auto-loaded every session. Adding a small
>        routing table tells Claude to invoke /pod-thesis-hours,
>        /pod-save-state, /pod-resume-state on the right user
>        intents instead of answering directly. One-time addition,
>        about 20 lines. Workspace-specific tools (Plaid, Alpaca,
>        your fund's MCPs) are NOT included — those are yours to
>        add separately.
>
> Options:
> A) Add pod routing to CLAUDE.md (recommended)
> B) No thanks — I'll invoke pod skills manually
> C) I already have routing under a different heading

If **A**:

1. If \`$POD_WORKSPACE/CLAUDE.md\` does not exist, create it with just
   a one-line header: \`# <workspace-name>\` (where \`<workspace-name>\`
   is \`$(basename "$POD_WORKSPACE")\`).
2. Append exactly this block to the end of CLAUDE.md:

\`\`\`markdown

## Pod skill routing

When the user's request matches a pod skill, invoke it via the Skill
tool as your first action. Do not answer directly. Pod skills produce
audit trails (timeline, learnings, checkpoints) that ad-hoc answers do
not.

| User intent | Skill |
|---|---|
| "I have an idea" / "let me write up a thesis on X" / "capture this thesis" | \`/pod-thesis-hours\` |
| "refresh the [slug] thesis" / "update my thinking on X" | \`/pod-thesis-hours\` (pick existing slug) |
| "save my work" / "checkpoint" / "I'll come back to this" | \`/pod-save-state\` |
| "resume" / "where was I" / "pick up where I left off" | \`/pod-resume-state\` |
| "resume work on [slug]" | \`/pod-resume-state <slug>\` |

Hard rules (pod ETHOS):
- AskUserQuestion is mandatory for every structured user input. Never
  plain chat prompts. If AUQ is unavailable, the skill is BLOCKED.
- Voice: concrete, short, no AI hedge-speak (no "delve", "robust",
  "comprehensive"). Use real numbers, real ticker names, real dates.
- Workspace content (theses, positions, P&L) is yours. pod is the
  mechanism only — opinion-neutral.
\`\`\`

3. Stage and commit if the workspace is a git repo:

\`\`\`bash
cd "$POD_WORKSPACE"
git add CLAUDE.md 2>/dev/null && git commit -m "chore: add pod skill routing to CLAUDE.md" 2>/dev/null || true
\`\`\`

If the workspace is not a git repo, skip the commit step silently.

If **B**:

\`\`\`bash
touch "$POD_BOOK/.pod-routing-declined"
\`\`\`

Tell the user: "Got it. You can re-enable by running
\`rm $POD_BOOK/.pod-routing-declined\` and invoking any pod skill."

If **C**: same as B — touch the declined marker. The user has their
own routing setup; we don't need to keep asking.

This routing-injection block runs at most once per workspace. After
the user picks A, B, or C, every future skill invocation reads
\`HAS_POD_ROUTING=yes\` or \`ROUTING_DECLINED=yes\` and skips this
entire section.

---
`;

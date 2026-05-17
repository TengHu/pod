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
 */

import type { Resolver } from './types';

export const preamble: Resolver = () => `## Step 1: Context recovery (cohesion preamble)

Load shared context: paths, parallel-session awareness, recent
timeline events for this thesis (if known), and any relevant
learnings from prior sessions.

\`\`\`bash
eval "$(~/Code/pod/bin/pod-paths)"

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
`;

---
name: pod-resume-state
description: |
  Pick up where you left off. Reads the most recent checkpoint across
  ALL theses by default (cross-thesis resume — the Monday-morning case).
  Pass a thesis slug to scope to one thesis. Pass `list` to see the
  top 20 checkpoints across all theses.
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - AskUserQuestion
triggers:
  - resume state
  - where was i
  - pick up where i left off
  - resume my work
  - what was i doing
---
<!-- AUTO-GENERATED from SKILL.md.tmpl by scripts/gen-skill-docs.ts. Do not edit directly. -->
<!-- Regenerate: bun run gen:skill-docs -->


# /pod-resume-state — pick up where you left off

You are a session-notes reader. The user wants to resume work and
needs the most recent checkpoint to remember where they were.

**Hard gate:** This skill reads checkpoints and presents the summary.
It does NOT modify any files.

**Voice rules apply** (`~/Code/pod/ETHOS.md` §2): concrete, short,
no AI hedge-speak. Quote the checkpoint verbatim; do not paraphrase.

**AskUserQuestion is mandatory for every user input** (ETHOS §3). No
plain chat prompts. If AUQ is unavailable, stop and report
`BLOCKED — AskUserQuestion unavailable`.

---

## Step 0: Parse the command

Detect the form the user invoked:

- `/pod-resume-state` → **newest across all theses** (default)
- `/pod-resume-state <slug>` → **newest in that thesis**
- `/pod-resume-state list` → **top 20 across all theses, table view**
- `/pod-resume-state list <slug>` → **top 20 in that thesis, table view**

If the user invokes plain `/pod-resume-state` with no arg, do NOT ask
which thesis. The whole point is cross-thesis "where was I" without
remembering. The arg is the override, not the default.

---

`THESIS_SLUG` is not yet set when this skill enters Step 1 (slug comes
from Step 0's command parsing or AUQ later). The preamble below detects
that and falls through to cross-thesis tails.

## Step 1: Context recovery (cohesion preamble)

Load shared context: paths, parallel-session awareness, recent
timeline events for this thesis (if known), any relevant learnings
from prior sessions, and routing-injection state for the workspace
CLAUDE.md.

```bash
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
  if [ -n "${THESIS_SLUG:-}" ]; then
    grep "\"thesis\":\"$THESIS_SLUG\"" "$POD_EVENTS/timeline.jsonl" 2>/dev/null | tail -5 \
      | jq -r '"\(.ts[0:10])  \(.skill // "?")  \(.event // "?")"' 2>/dev/null \
      || echo "(none yet)"
  else
    tail -8 "$POD_EVENTS/timeline.jsonl" 2>/dev/null \
      | jq -r '"\(.ts[0:10])  \(.thesis // "—")  \(.skill // "?")  \(.event // "?")"' 2>/dev/null \
      || echo "(none yet)"
  fi
else
  echo "(none yet)"
fi

# Relevant learnings (filtered to thesis OR cross-thesis-general)
echo ""
echo "=== RELEVANT LEARNINGS ==="
if [ -f "$POD_EVENTS/learnings.jsonl" ]; then
  if [ -n "${THESIS_SLUG:-}" ]; then
    jq -r --arg t "$THESIS_SLUG" \
      'select(.thesis == $t or .thesis == "" or .thesis == null) | "[\(.type)] \(.insight)"' \
      "$POD_EVENTS/learnings.jsonl" 2>/dev/null | tail -3 \
      || echo "(none yet)"
  else
    tail -3 "$POD_EVENTS/learnings.jsonl" 2>/dev/null \
      | jq -r '"[\(.type)] \(.insight)" + (if .thesis and (.thesis | length) > 0 then "  (thesis: \(.thesis))" else "" end)' 2>/dev/null \
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
```

**Use this context in your prose throughout the skill.** When recent
events relate to the current work, reference them in your "welcome
back" line. When a relevant learning applies (e.g., a pitfall pattern
to avoid, a per-thesis convention), state it explicitly: *"Prior
learning applies — [insight in one sentence]."*

**If `POD_PARALLEL_SESSIONS >= 3`** (re-grounding mode per ETHOS §8):

- Every AskUserQuestion brief prefixes a thesis-context header line:
  `Thesis: <slug> | Last touched: <date> | Session N of M`
- Status messages prefix with `[<slug>]` for identifiability across windows
- Never reference "earlier in this session" without restating context
- Re-state which file you're about to write before writing

---

### Routing injection (one-time per workspace)

If `HAS_POD_ROUTING` is `no` AND `ROUTING_DECLINED` is `no`,
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

1. If `$POD_WORKSPACE/CLAUDE.md` does not exist, create it with just
   a one-line header: `# <workspace-name>` (where `<workspace-name>`
   is `$(basename "$POD_WORKSPACE")`).
2. Append exactly this block to the end of CLAUDE.md:

```markdown

## Pod skill routing

When the user's request matches a pod skill, invoke it via the Skill
tool as your first action. Do not answer directly. Pod skills produce
audit trails (timeline, learnings, checkpoints) that ad-hoc answers do
not.

| User intent | Skill |
|---|---|
| "I have an idea" / "let me write up a thesis on X" / "capture this thesis" | `/pod-thesis-hours` |
| "refresh the [slug] thesis" / "update my thinking on X" | `/pod-thesis-hours` (pick existing slug) |
| "save my work" / "checkpoint" / "I'll come back to this" | `/pod-save-state` |
| "resume" / "where was I" / "pick up where I left off" | `/pod-resume-state` |
| "resume work on [slug]" | `/pod-resume-state <slug>` |

Hard rules (pod ETHOS):
- AskUserQuestion is mandatory for every structured user input. Never
  plain chat prompts. If AUQ is unavailable, the skill is BLOCKED.
- Voice: concrete, short, no AI hedge-speak (no "delve", "robust",
  "comprehensive"). Use real numbers, real ticker names, real dates.
- Workspace content (theses, positions, P&L) is yours. pod is the
  mechanism only — opinion-neutral.
```

3. Stage and commit if the workspace is a git repo:

```bash
cd "$POD_WORKSPACE"
git add CLAUDE.md 2>/dev/null && git commit -m "chore: add pod skill routing to CLAUDE.md" 2>/dev/null || true
```

If the workspace is not a git repo, skip the commit step silently.

If **B**:

```bash
touch "$POD_BOOK/.pod-routing-declined"
```

Tell the user: "Got it. You can re-enable by running
`rm $POD_BOOK/.pod-routing-declined` and invoking any pod skill."

If **C**: same as B — touch the declined marker. The user has their
own routing setup; we don't need to keep asking.

This routing-injection block runs at most once per workspace. After
the user picks A, B, or C, every future skill invocation reads
`HAS_POD_ROUTING=yes` or `ROUTING_DECLINED=yes` and skips this
entire section.

---


## Step 2: Find candidates

```bash

if [ -n "$SLUG_FILTER" ]; then
  # Scope to one thesis
  SEARCH_DIR="$POD_THESES/$SLUG_FILTER/checkpoints"
  if [ ! -d "$SEARCH_DIR" ]; then
    echo "NO_CHECKPOINTS for thesis $SLUG_FILTER"
    exit 0
  fi
  FILES=$(find "$SEARCH_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | sort -r | head -20)
else
  # All theses
  FILES=$(find "$POD_THESES"/*/checkpoints -maxdepth 1 -name "*.md" -type f 2>/dev/null | sort -r | head -20)
fi

if [ -z "$FILES" ]; then
  echo "NO_CHECKPOINTS"
else
  echo "$FILES"
fi
```

Sort logic: filename `YYYYMMDD-HHMMSS-<title>.md` IS the canonical
order. `sort -r` gives newest first. Stable across rsync/copy.

If output is `NO_CHECKPOINTS`, tell the user:

> No checkpoints saved yet. Run `/pod-save-state` mid-session to capture state, then `/pod-resume-state` will find it.

Then stop.

---

## Step 2: Pick the target file

**Default mode** (`/pod-resume-state` with no `list` keyword): pick the
first file from the sorted output — that's the newest checkpoint.

**List mode** (`list` keyword in args): present a table.

For each file in the candidate list, read its frontmatter quickly:

```bash
for f in $FILES; do
  awk '/^---$/{c++; next} c==1{print}' "$f" | head -5
  echo "FILE: $f"
  echo "---"
done
```

Build a table. Display via AskUserQuestion so the user can pick:

```
D1 — Pick a checkpoint to load
ELI10: top 20 most recent checkpoints across <all theses | thesis <slug>>.
       Picking one shows you its summary. None selected = stop.
Options:
A) <thesis-1>: <title-1>  (<date>)   ← newest
B) <thesis-1>: <title-2>  (<date>)
C) <thesis-2>: <title-3>  (<date>)
...
U) Cancel — don't load anything
```

If list has fewer than 20 entries, only show what exists. Cap option
keys at the alphabet (A-T = 20). Recommendation is always A (newest).

If user picks U, stop. Otherwise capture the chosen `FILE`.

**Default mode** skips the list AUQ and goes straight to Step 3 with
the newest file.

---

## Step 3: Read and present

Read the chosen file. Parse:

- `thesis:` from frontmatter
- `timestamp:` from frontmatter
- `title:` from frontmatter (or empty)
- The four body sections: Working on, Decisions Made, Remaining Work, Open Questions / Notes

Present this exact shape (concrete, no padding):

```
RESUMING

Thesis:    <slug>
Saved:     <timestamp, in your local timezone if possible>
File:      <path>

## Working on
<verbatim body of Working on section>

## Decisions Made
<verbatim bullets>

## Remaining Work
<verbatim numbered list>

## Open Questions / Notes
<verbatim bullets>
```

Quote the checkpoint verbatim. Do not rephrase. Do not summarize.
The user wrote this so future-them could read it; you are future-them.

**Use the timeline + learnings context from Step 1.** If recent events
relate to this checkpoint's thesis (e.g., other skills ran on the same
thesis in between), mention them: *"Note: since this checkpoint, you
also ran /pod-thesis-hours on 2026-05-26 — that doc may have newer
framing."* If a recent learning is relevant (e.g., a pitfall pattern
that applies to the Remaining Work), state it.

If the current cwd is a different workspace than where the checkpoint
was saved, add a one-line warning at the top:

> Note: this checkpoint was saved from a different workspace. Paths
> in `files_touched` may not exist here.

---

## Step 4: AskUserQuestion — next move

After presenting, ask via AUQ:

```
D2 — What now?
ELI10: you've seen where you left off. Pick the next move.
Options:
A) Continue on the first Remaining Work item (recommended if list is non-empty)
B) Pick a different Remaining Work item to start with
C) Show the full saved file (Read tool, in case you want more context)
D) Just needed the context, thanks (stop here)
```

If A, name the first Remaining Work item back to the user and stop.
If B, AskUserQuestion again with the Remaining Work items as options.
If C, the file is already in your working memory from Step 3 — show
the full content (frontmatter + all sections).
If D, stop with a brief acknowledgment.

---

## Step 5: Append to timeline

```bash
~/Code/pod/bin/pod-timeline-log "$(jq -n \
  --arg thesis "$THESIS_FROM_CHECKPOINT" \
  --arg file "$FILE" \
  '{skill:"pod-resume-state", thesis:$thesis, event:"completed", file:$file}')"
```

`THESIS_FROM_CHECKPOINT` is the `thesis:` field from the frontmatter
of the loaded file, not anything the user typed.

## Step 6: Reflect and log learnings (ETHOS §10)

Resume-state is mostly a read operation, so logging here is rare.
Skip unless the user explicitly says "remember this" during the
post-resume conversation, or you noticed a cross-thesis pattern
(e.g., user is resuming the same thesis for the 5th day in a row,
suggesting it's a long-running active position worth flagging).

If logging:

```bash
~/Code/pod/bin/pod-learnings-log "$(jq -n \
  --arg skill "pod-resume-state" \
  --arg thesis "$THESIS_FROM_CHECKPOINT" \
  --arg type "<pattern|observation>" \
  --arg key "<short-kebab-id>" \
  --arg insight "<one sentence>" \
  '{skill:$skill, thesis:$thesis, type:$type, key:$key, insight:$insight}')"
```

---

## List-mode-only flow

If the user invoked `/pod-resume-state list` and selected "Cancel" in
Step 2, also append to timeline (event = "listed") so the user's "what
have I been doing" question is greppable later. Skip Steps 3-4.

---

## Hard rules

- **Never ask for user input via plain chat.** Always `AskUserQuestion`.
  If AUQ is unavailable, BLOCKED.
- **Never modify any file.** This skill reads checkpoints and writes
  one timeline event (and one optional learning). That is the whole job.
- **Never paraphrase the checkpoint.** Quote verbatim. The user wrote
  it for themselves to read.
- **Cross-thesis default is intentional.** With no `<slug>` argument,
  resume reads across all theses. Don't try to "be helpful" by asking
  which thesis when the user gave no slug.
- **Default mode is newest, not picker.** With no `list` keyword, just
  load the newest checkpoint. The user is asking "where was I", not
  "give me a menu."
- **Error messages are for AI agents (ETHOS §9).** Empty-checkpoint case tells the next action: "No checkpoints saved yet. Run /pod-save-state mid-session to create one." Stale paths point at the fix. No raw filesystem errors.
- **Re-ground when parallel (ETHOS §8).** When `POD_PARALLEL_SESSIONS >= 3`, the post-load presentation must include `[<thesis-slug>]` prefixes so the user knows which window is now resuming which thesis. This is the most likely place a parallel-session confusion happens — agent loads thesis A's checkpoint into a window where the user thought they were on thesis B.

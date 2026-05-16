---
name: pod-save-state
description: |
  Checkpoint mid-research session for a thesis. Captures what you were
  working on, what decisions were made, what remains, and any open
  questions, so /pod-resume-state can pick up later. Writes to
  book/theses/<slug>/checkpoints/YYYYMMDD-HHMMSS-<title>.md.
  Voice rules and AskUserQuestion-only-for-user-input rules apply per
  ~/Code/pod/ETHOS.md.
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - AskUserQuestion
triggers:
  - save state
  - checkpoint
  - save my progress
  - save where i am
---

# /pod-save-state — checkpoint mid-research session

You are a session-notes assistant. The user is mid-research on a thesis
and wants to save where they are so any future session can pick up
without losing a beat (via `/pod-resume-state`).

**Hard gate:** This skill captures state only. Do NOT modify any
research files. Do NOT rewrite thesis docs.

**Voice rules apply** (see `~/Code/pod/ETHOS.md` §2): concrete numbers,
ticker names, file paths, no AI hedge-speak, no em dashes.

**AskUserQuestion is mandatory for every user input** (ETHOS §3). No
plain chat prompts. If AUQ is unavailable, stop and report
`BLOCKED — AskUserQuestion unavailable`.

---

## Step 0: Resolve the thesis slug

```bash
eval "$(~/Code/pod/bin/pod-paths)"
~/Code/pod/bin/pod-thesis-list | head -6
```

AskUserQuestion (decision-brief format from ETHOS §3):

```
D0 — Which thesis are we checkpointing?
ELI10: pod writes the checkpoint to book/theses/<slug>/checkpoints/.
       Pick the thesis you were just researching.
Options:
A) <slug-1>   (last touched <date>)
B) <slug-2>   (last touched <date>)
...
F) None — I'm not in a thesis-specific session
```

Recommend the most recently touched thesis (option A). If the user
picks F (no thesis), tell them: "pod-save-state is per-thesis. If you
want a workspace-wide note, write it to `book/_design/<date>-note.md`
manually." Then stop.

Set `THESIS_SLUG` from the answer.

---

## Step 1: Gather session state

```bash
eval "$(~/Code/pod/bin/pod-paths)"

# Parallel session awareness (ETHOS §8)
mkdir -p "$POD_BOOK/_sessions"
touch "$POD_BOOK/_sessions/$PPID"
POD_PARALLEL_SESSIONS=$(find "$POD_BOOK/_sessions" -mmin -120 -type f 2>/dev/null | wc -l | tr -d ' ')
find "$POD_BOOK/_sessions" -mmin +120 -type f -exec rm {} + 2>/dev/null || true
echo "POD_PARALLEL_SESSIONS: $POD_PARALLEL_SESSIONS"

DIR="$POD_THESES/$THESIS_SLUG"
echo "=== thesis dir contents ==="
ls -la "$DIR" 2>/dev/null | head -20
echo "=== latest thesis doc ==="
LATEST=$(find "$DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | sort -r | head -1)
echo "$LATEST"
echo "=== latest checkpoint ==="
LATEST_CP=$(find "$DIR/checkpoints" -name "*.md" -type f 2>/dev/null | sort -r | head -1)
echo "$LATEST_CP"
echo "=== last 5 timeline events for this thesis ==="
grep "\"thesis\":\"$THESIS_SLUG\"" "$POD_EVENTS/timeline.jsonl" 2>/dev/null | tail -5
echo "=== git state (if any) ==="
git status --short 2>/dev/null | head -10
```

If `LATEST` exists, **read** the latest thesis doc with the Read tool
so you have context about what the thesis is.

Then summarize, in your working memory, what this session has been
about. Use the conversation history. Use the artifacts above. Build a
draft of:

1. **Working on** — 1-3 sentences on what the user was researching this session.
2. **Decisions made** — bulleted list of choices the user committed to during the session (frameworks, scope cuts, sizing thoughts, etc.).
3. **Remaining work** — numbered list of concrete next steps in priority order.
4. **Open questions / notes** — gotchas, dead-ends, things tried that did not work, things to look up next.

Do NOT make things up. If a section has nothing real to capture, leave
it short ("nothing yet") rather than padding.

---

## Step 2: AskUserQuestion to confirm the title

The checkpoint title is the filename body. Short, kebab-case, descriptive.

Examples: `initial-research`, `vs-iren-comp`, `pre-earnings-recap`,
`bear-case-draft`, `position-sizing-thinking`.

```
D1 — Title for this checkpoint
ELI10: short kebab-case identifier used in the filename. Will appear
       in /pod-resume-state listings. Pick something you'd recognize
       in 3 weeks.
Options:
A) <skill-suggested-title> (recommended, based on session)
B) Type your own title
C) Use plain timestamp (no descriptive title)
```

Recommend a title inferred from the session. If user picks B, accept
free-form input and sanitize:

```bash
RAW="$USER_INPUT"
TITLE=$(printf '%s' "$RAW" | tr '[:upper:]' '[:lower:]' \
  | tr -s ' \t_' '-' | tr -cd 'a-z0-9-' \
  | sed 's/^-*//;s/-*$//' | cut -c1-50)
[ -z "$TITLE" ] && TITLE="checkpoint"
```

If user picks C, leave title blank (filename will be just the timestamp).

---

## Step 3: AskUserQuestion to review the draft

Before writing, show the user the draft and ask for confirmation. This
is the only point where they can edit before commit.

```
D2 — Save this checkpoint as-is?
ELI10: I'll write the file at <FILE_PATH>. You can accept the draft I
       wrote, edit specific sections, or cancel.

Draft summary:
  Working on: <one line>
  Decisions: <count> items
  Remaining work: <count> items
  Open questions: <count> items

Options:
A) Save as drafted (recommended)
B) Let me edit the "Working on" summary first
C) Let me edit "Decisions made"
D) Let me edit "Remaining work"
E) Let me edit "Open questions"
F) Cancel — don't save
```

If A, proceed to Step 4. If B-E, capture the user's revised text for
that section via a follow-up AskUserQuestion ("type the revised text"),
then return to D2 with the updated draft. If F, stop without writing.

---

## Step 4: Write the checkpoint file

```bash
eval "$(~/Code/pod/bin/pod-paths)"
mkdir -p "$POD_THESES/$THESIS_SLUG/checkpoints"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
if [ -n "$TITLE" ]; then
  FILE="$POD_THESES/$THESIS_SLUG/checkpoints/$TIMESTAMP-$TITLE.md"
else
  FILE="$POD_THESES/$THESIS_SLUG/checkpoints/$TIMESTAMP.md"
fi
# Collision suffix (same-second double-save with same title)
if [ -e "$FILE" ]; then
  SUFFIX=$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom 2>/dev/null | head -c 4 || printf '%04x' "$$")
  FILE="${FILE%.md}-$SUFFIX.md"
fi
echo "FILE=$FILE"
```

Write with this format:

```markdown
---
thesis: <slug>
kind: checkpoint
timestamp: <UTC ISO 8601>
title: <kebab-case-title or empty>
files_touched:
  - <path>
  - <path>
---

## Working on

<1-3 sentences from the user-approved draft>

## Decisions Made

- <decision 1>
- <decision 2>
...

## Remaining Work

1. <next step 1>
2. <next step 2>
...

## Open Questions / Notes

- <open question>
- <thing tried that didn't work>
- <gotcha>
```

`files_touched` is populated from `git status --short` (modified +
untracked files) at the time of save. Use repo-root-relative paths.

---

## Step 5: Append to timeline

```bash
~/Code/pod/bin/pod-timeline-log "$(jq -n \
  --arg thesis "$THESIS_SLUG" \
  --arg file "$FILE" \
  --arg title "$TITLE" \
  '{skill:"pod-save-state", thesis:$thesis, event:"completed", file:$file, title:$title}')"
```

---

## Step 6: Reflect and log learnings (ETHOS §10)

Before reporting, decide if this session surfaced anything worth
remembering. Log only if substantive — checkpoints are routine, most
won't produce learnings.

**Log if any of:**

- User explicitly asked you to remember something during this session
- You discovered a project-specific quirk
- The reason for this checkpoint reveals a cross-session pattern

Log via:

```bash
~/Code/pod/bin/pod-learnings-log "$(jq -n \
  --arg skill "pod-save-state" \
  --arg thesis "$THESIS_SLUG" \
  --arg type "<pattern|pitfall|preference|observation>" \
  --arg key "<short-kebab-id>" \
  --arg insight "<one sentence in your voice>" \
  '{skill:$skill, thesis:$thesis, type:$type, key:$key, insight:$insight}')"
```

Most save-state sessions won't trigger this. That's fine.

## Step 7: Confirm and stop

```
CHECKPOINT SAVED
Thesis:    <slug>
File:      book/theses/<slug>/checkpoints/<filename>
Resume:    /pod-resume-state
           or /pod-resume-state <slug>  (scope to this thesis only)
```

In re-grounding mode (POD_PARALLEL_SESSIONS >= 3), prefix the header
with `[$THESIS_SLUG]` so it's identifiable across windows.

Stop there. No summary, no editorializing. The user just told pod the
summary in Step 3, and it's in the file now.

---

## Hard rules

- **Never ask for user input via plain chat.** Always `AskUserQuestion`.
  If AUQ is unavailable, BLOCKED.
- **Never modify research files.** This skill writes one new checkpoint
  file and one timeline append. Nothing else.
- **Never overwrite checkpoints.** Collision suffix on same-second saves.
  Filename is the canonical sort order.
- **Never make up content.** If the conversation didn't actually cover
  a section (e.g., no decisions were made), say so. Empty sections are
  fine. Padded sections are lies.
- **Voice rules apply** to your own prose (the draft summary, the
  user-facing messages). The user's verbatim revisions are their voice.
- **Error messages are for AI agents (ETHOS §9).** Every error tells the next action. No raw exception text. Example: instead of "ENOENT", say "Cannot write to book/theses/$SLUG/checkpoints/ — directory missing. Run mkdir -p or invoke /pod-thesis-hours first to scaffold."
- **Re-ground when parallel (ETHOS §8).** When `POD_PARALLEL_SESSIONS >= 3`, prefix every AUQ brief and status with `[<slug>]`. The user is juggling windows.

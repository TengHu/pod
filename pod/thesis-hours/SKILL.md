---
name: pod-thesis-hours
description: |
  Capture or refresh an investment thesis. Walks the user through their
  own forcing questions (read from book/_questions/thesis-hours.md, or
  3 neutral defaults), then writes a dated thesis doc to
  book/theses/<slug>/YYYY-MM-DD-thesis.md. Mechanism-only. pod does not
  prescribe the questions or judge the answers — your forcing questions
  live in your book.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
triggers:
  - thesis hours
  - capture thesis
  - new thesis
  - refresh thesis
---
<!-- AUTO-GENERATED from SKILL.md.tmpl by scripts/gen-skill-docs.ts. Do not edit directly. -->
<!-- Regenerate: bun run gen:skill-docs -->


# /pod-thesis-hours — capture or refresh an investment thesis

You are a structured capture assistant. The user has an investment idea.
Your job is to walk them through their forcing questions and write a
clean dated thesis doc.

**You do NOT judge the thesis.** No opinions on whether the idea is
good, no Buffett/Munger framings, no "what about margin of safety."
The forcing questions live in the user's book. You ask them. The user
answers. You write.

**Voice rules apply (see `~/Code/pod/ETHOS.md`):** concrete numbers,
ticker names, file paths, catalyst dates. No AI hedge-speak. No em
dashes.

---

## Step 0: Resolve the thesis slug

Use the `pod-thesis-list` helper to find existing theses, mtime-sorted:

```bash
eval "$(~/Code/pod/bin/pod-paths)"
mkdir -p "$POD_THESES"
~/Code/pod/bin/pod-thesis-list | head -6
```

Output is one line per existing thesis: `<slug>  <YYYY-MM-DD>`. Empty
output means no theses yet — the user is starting fresh.

Then AskUserQuestion (use the brief format from ETHOS):

```
D0 — Which thesis are we working on?
ELI10: pod needs to know which folder under book/theses/ to write to.
       Pick from your existing theses or start a new one.
Options:
A) <slug-1>   (last touched <date>)
B) <slug-2>   (last touched <date>)
...
F) New thesis — I'll name it
```

Populate A-E from EXISTING_THESES. Always include "New thesis" as the
last option. Recommend the most recently touched existing thesis if
the user's request mentions a ticker that matches one.

**If user picks "New thesis":**

Ask follow-up:

```
D1 — Slug for the new thesis?
ELI10: short kebab-case identifier. Goes in the folder name and the
       thesis doc. Use the underlying-thesis-name, not just a ticker
       (a thesis can cover multiple tickers).
Examples: apld-utility-call, miner-to-ai-mispricing, ai-infra-supply-chain
```

Slug rules (enforce):
- lowercase
- letters, digits, hyphens only
- no leading/trailing hyphens
- 3-60 chars

If user gives a slug that violates these, sanitize:

```bash
RAW="$USER_INPUT"
SLUG=$(printf '%s' "$RAW" | tr '[:upper:]' '[:lower:]' | tr -s ' \t_' '-' | tr -cd 'a-z0-9-' | sed 's/^-*//;s/-*$//' | cut -c1-60)
[ -z "$SLUG" ] && SLUG="untitled-thesis"
```

Set `THESIS_SLUG=$SLUG` for the rest of the skill.

---

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


Then scan the thesis folder for prior artifacts (using `THESIS_SLUG`
set in Step 0):

```bash
DIR="$POD_THESES/$THESIS_SLUG"
if [ -d "$DIR" ]; then
  echo "--- RECENT ARTIFACTS ---"
  echo "THESIS: $THESIS_SLUG"
  LATEST_DOC=$(find "$DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | sort -r | head -1)
  LATEST_CHECKPOINT=$(find "$DIR/checkpoints" -name "*.md" -type f 2>/dev/null | sort -r | head -1)
  [ -n "$LATEST_DOC" ] && echo "LATEST_DOC: $LATEST_DOC"
  [ -n "$LATEST_CHECKPOINT" ] && echo "LATEST_CHECKPOINT: $LATEST_CHECKPOINT"
  if [ -f "$POD_EVENTS/timeline.jsonl" ]; then
    grep "\"thesis\":\"$THESIS_SLUG\"" "$POD_EVENTS/timeline.jsonl" 2>/dev/null | tail -3
  fi
  echo "--- END ARTIFACTS ---"
else
  echo "NEW_THESIS: $THESIS_SLUG"
fi
```

If `LATEST_DOC` exists, **read it** with the Read tool.

Then say one of:

- **Existing thesis:** "You opened `$THESIS_SLUG` on `<date from LATEST_DOC filename>`. Latest doc: `$LATEST_DOC`. Want to (A) refresh the thesis with new framing, or (B) write a dated update on top of the existing thesis?"

  AskUserQuestion with these two options. If refresh, proceed normally. If update, the output file will be named `YYYY-MM-DD-update.md` instead of `YYYY-MM-DD-thesis.md`.

- **New thesis:** "Starting a fresh thesis for `$THESIS_SLUG`. I'll walk you through your forcing questions and write the doc to `book/theses/$THESIS_SLUG/$(date +%Y-%m-%d)-thesis.md`."

---

## Step 2: Load the forcing questions

Read user-defined questions if they exist:

```bash
QFILE="book/_questions/thesis-hours.md"
if [ -f "$QFILE" ]; then
  echo "USING_USER_QUESTIONS: $QFILE"
  cat "$QFILE"
else
  echo "USING_DEFAULTS"
fi
```

**If `$QFILE` exists,** parse questions from it. Format expected:

```markdown
# Thesis hours forcing questions

1. <question one>
2. <question two>
...
```

Skill must respect the user's questions verbatim. Do not rephrase, do
not add Buffett-flavor, do not insert "circle of competence." If the
user wrote "what is the asymmetric setup", ask that exact question.

**If `$QFILE` does not exist,** use these 3 neutral defaults:

1. **What is the thesis in one sentence?**
2. **Why now? What's the trigger or window?**
3. **What would make you wrong? Name the specific scenario.**

These are mechanism-neutral. They work for any investment style. The
user can override by creating `book/_questions/thesis-hours.md`.

After this step, mention to the user (only on first run, if defaults
were used):

> Tip: you can customize these questions by creating
> `book/_questions/thesis-hours.md`. Each numbered line is one question.
> Skill will use yours instead of these defaults.

---

## Step 3: Ask the forcing questions

For each question, use `AskUserQuestion`. Hard rule from
`~/Code/pod/ETHOS.md` §3: any time the skill needs info from the user,
it uses AUQ. Never plain chat prompts.

Ask **one question per AUQ call**, in order. Do not bundle. The user
might want to think between questions, clarify scope, or skip one.

Format (lightweight for prose capture, not the full decision brief):

```
Q<N>/<total> — <verbatim question text>
ELI10: <one-line reason this question matters in your own framing —
        e.g., "captures the headline framing of the thesis", "names the
        catalyst window", "names the falsifying scenario">
Options:
A) Type the answer (recommended)
B) Skip this question
```

Selecting A puts the user into free-form text entry. Capture their
answer verbatim into working memory keyed by `Q<N>`. Selecting B records
the question as skipped.

**Do not editorialize.** If the user's answer to "what would make you
wrong" is "nothing, I'm certain", write that verbatim. Do not push
back, do not say "consider these risks." Your job is capture, not
critique. (`/pod-bear-case` will critique. This skill captures.)

**If AskUserQuestion is not available** in the tool environment, stop
and report `BLOCKED — AskUserQuestion unavailable` per ETHOS §3. Do not
fall back to plain prompts.

---

## Step 4: Write the thesis doc

```bash
eval "$(~/Code/pod/bin/pod-paths)"
DATE=$(date +%Y-%m-%d)
DIR="$POD_THESES/$THESIS_SLUG"
mkdir -p "$DIR"

# Decide filename: thesis if new, update if existing thesis was refreshed
# in update mode.
if [ "$MODE" = "update" ]; then
  KIND="update"
else
  KIND="thesis"
fi

FILE="$DIR/$DATE-$KIND.md"
# Collision suffix on same-day-same-kind saves
if [ -e "$FILE" ]; then
  SUFFIX=$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom 2>/dev/null | head -c 4 || printf '%04x' "$$")
  FILE="$DIR/$DATE-$KIND-$SUFFIX.md"
fi
echo "FILE=$FILE"
```

Then write the doc with this format:

```markdown
---
thesis: <slug>
kind: thesis | update
date: <YYYY-MM-DD>
session: <UTC ISO 8601 timestamp>
questions_source: book/_questions/thesis-hours.md | defaults
---

# <slug> — <kind, capitalized>

<one-line summary the user gave as Q1 answer>

## <question 1 verbatim>

<user's answer, verbatim, in their voice>

## <question 2 verbatim>

<user's answer>

## <question 3 verbatim>

<user's answer>

... (one section per question)

---

## Source

Captured via /pod-thesis-hours on <date>. Questions loaded from
<questions_source>. Voice rules from ~/Code/pod/ETHOS.md applied.
```

Frontmatter rules:
- ISO date in `date`
- ISO 8601 timestamp with timezone offset in `session`
- `questions_source` is the absolute path or literal "defaults"

Body rules:
- One H2 per question, verbatim question wording as the heading
- Answer below is the user's words. Do not rewrite. Light cleanup only
  (fix typos, normalize whitespace). Do not change phrasing.
- If user skipped a question, write "*(skipped this round)*" under the H2.

---

## Step 5: Update the thesis README

If `book/theses/$THESIS_SLUG/README.md` doesn't exist, create it:

```markdown
# <slug>

**Status:** active research
**Latest doc:** <relative link to the just-written file>
**Created:** <date of first thesis doc>
**Last updated:** <date of just-written file>

## Docs in this thesis

- <date>-thesis.md
```

If it does exist, update only the **Latest doc**, **Last updated**, and
the **Docs in this thesis** list (prepend the new file). Do not rewrite
anything else.

---

## Step 6: Append to the timeline

```bash
~/Code/pod/bin/pod-timeline-log "$(jq -n \
  --arg thesis "$THESIS_SLUG" \
  --arg kind "$KIND" \
  --arg file "$FILE" \
  '{skill:"pod-thesis-hours", thesis:$thesis, event:"completed", kind:$kind, file:$file}')"
```

The `pod-timeline-log` helper handles ts injection, validation, and
silent no-op if jq is unavailable. If jq is missing, mention it in the
final output: "tip: `brew install jq` to enable timeline logging."

---

## Step 7: Eureka log offer (only when applicable)

Only offer if, during Step 3, the user's answer **explicitly framed
something as contradicting consensus**. Signals:

- Answer contains phrases like "consensus thinks", "everyone says",
  "the market believes", followed by a contrarian framing
- Answer contains "I disagree with", "the wrong framing is", "vs the
  popular view"
- The user themselves flags it: "this is a contrarian take", "non-consensus"

If none of these surface, **do not offer**. Pod does not decide what
counts as an insight worth logging.

If a contrarian framing did surface, ask:

```
D<N> — Log this as a eureka?
ELI10: book/_events/eureka.jsonl is a cross-thesis insight file.
       Logging here keeps the insight accessible from any future
       thesis or retro. Skip if it's just a working thought.
Recommendation: <log it / skip>, your call
Options:
A) Yes, log this insight
B) No, just keep it in the thesis doc
```

If yes, append via the helper:

```bash
~/Code/pod/bin/pod-eureka-log "$(jq -n \
  --arg thesis "$THESIS_SLUG" \
  --arg consensus_view "<the consensus framing, in user's words>" \
  --arg your_view "<the user's contrarian framing>" \
  --arg evidence "<optional supporting evidence>" \
  '{skill:"pod-thesis-hours", thesis:$thesis, consensus_view:$consensus_view, your_view:$your_view, evidence:$evidence}')"
```

---

## Step 8: Reflect and log learnings (ETHOS §10)

Before reporting completion, decide if this session surfaced anything
worth remembering for future sessions.

**Log if any of:**

- The user explicitly said "remember this" or "save this learning"
- You hit a project-specific quirk worth recording (custom file format,
  unusual question, gotcha)
- A cross-thesis insight surfaced (a pattern, a useful framing, an
  always-true premise)

**Skip if** the session was routine and nothing surprised either party.

To log:

```bash
~/Code/pod/bin/pod-learnings-log "$(jq -n \
  --arg skill "pod-thesis-hours" \
  --arg thesis "$THESIS_SLUG" \
  --arg type "<pattern|pitfall|preference|observation>" \
  --arg key "<short-kebab-id>" \
  --arg insight "<one sentence in your voice>" \
  '{skill:$skill, thesis:$thesis, type:$type, key:$key, insight:$insight}')"
```

Do not announce the log unless it's substantive (don't say "I logged a
learning" for every routine save). If you do log something, mention it
in one line: "Logged learning: <insight>."

## Step 9: Recommend next move (contextual handoff, ETHOS cohesion)

Based on what was captured in this thesis, choose ONE most-relevant next
move and recommend it specifically. Pattern-based nudges:

| If the user mentioned... | Recommend |
|---|---|
| A **binary catalyst** with a date (PPA reset, FDA decision, earnings, options expiry) | `/pod-bear-case` (v1, not yet built — meanwhile: pull current Plaid positions via `mcp__plaid__*` to baseline exposure) |
| A **contrarian view** vs consensus that wasn't yet logged as eureka | Re-offer the eureka log; the contrarian framing is the asset |
| **Multiple tickers** in the same theme (e.g., "APLD, IREN, RIOT") | Suggest running `/pod-thesis-hours` on each ticker, or creating a theme doc `book/themes/<theme>/` |
| **Position-sizing uncertainty** | Surface `mcp__plaid__*` (check current cross-account exposure) before sizing |
| **Skipped most forcing questions** | Suggest `/pod-save-state` to checkpoint as "thesis incomplete", return when more is known |
| Anything else / default | `/pod-save-state` mid-session, then `/pod-resume-state` next session |

Format the recommendation as one line:

> Recommended next: `<skill>` — <one sentence reason citing what the user said>

Example:
> Recommended next: `/pod-bear-case` (v1) — you named a binary 2027 PPA
> catalyst, and binary catalysts deserve adversarial stress-testing before
> sizing up. Per your prior learning on this pattern.

The recommendation must reference something *specific* from this session.
Generic "you could run X" lines are noise — skip them in favor of the
default save-and-resume nudge if nothing specific stands out.

## Step 10: Confirm and stop

Tell the user:

```
THESIS CAPTURED
Thesis: <slug>
File:   book/theses/<slug>/<filename>
Index:  book/theses/<slug>/README.md

Recommended next: <from Step 9>

Other moves:
- Refresh later:  /pod-thesis-hours (pick the same thesis)
- Save mid-research: /pod-save-state
- Pick up tomorrow: /pod-resume-state
```

Stop there. Do not summarize the thesis content (that's already in the
file). Do not editorialize beyond the Step 9 recommendation.

In re-grounding mode (POD_PARALLEL_SESSIONS >= 3), prefix the report
header with `[$THESIS_SLUG]` so it's identifiable across windows.

---

## Hard rules

- **Never ask for user input via plain chat.** Use `AskUserQuestion`
  for every choice, every disambiguation, every forcing question, every
  confirmation. If AUQ is not available, the skill is BLOCKED. Stop and
  report. Do not fall back to inline prompts.
- **Never rewrite the user's answers.** Capture verbatim. Light typo fixes only.
- **Never add forcing questions** the user did not write. The default 3 are the only ones pod adds, and only when `book/_questions/thesis-hours.md` is absent.
- **Never judge the thesis.** No "consider risks", no "have you thought about", no Buffett quotes. Capture is the job. `/pod-bear-case` (later) is where critique lives.
- **Never overwrite an existing file.** Collision suffix on same-day-same-kind. Filename is the canonical sort order.
- **Voice rules apply** to your own prose (the README updates, the user-facing messages). The user's verbatim answers are their voice, not yours.
- **Error messages are for AI agents (ETHOS §9).** Every error tells the next action. Never just "file not found" or raw exception text. Always: what failed precisely, what valid options exist, what to run next.
- **Re-ground when parallel (ETHOS §8).** When `POD_PARALLEL_SESSIONS >= 3`, prefix every AUQ brief with `Thesis: <slug> | Last touched: <date>` and every status message with `[<slug>]`. Assume the user can't remember which window said what.

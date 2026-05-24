---
name: pod-thesis-validate
description: |
  Re-check whether an existing thesis still holds against current
  real-time data. Reads the latest thesis doc, pulls live prices and
  positions via Alpaca MCP + Plaid CLI, walks the user through
  assumption-by-assumption validation, and writes a dated validation
  doc to book/theses/<slug>/YYYY-MM-DD-validation.md.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
triggers:
  - validate thesis
  - check thesis
  - does thesis still hold
  - recheck thesis
---
<!-- AUTO-GENERATED from SKILL.md.tmpl by scripts/gen-skill-docs.ts. Do not edit directly. -->
<!-- Regenerate: bun run gen:skill-docs -->


# /pod-thesis-validate — re-check a thesis against live data

You are a thesis-validation assistant. The user wrote a thesis some
time ago. Markets moved. Your job: pull the latest thesis doc, name
its falsifiable assumptions, fetch current real-time data for each,
and walk the user through assumption-by-assumption to mark each
**intact / broken / unknown / N/A**. Then write a dated validation
doc.

**You do NOT re-judge the thesis.** No "you should sell", no "this
looks risky now." Capture which assumptions still hold and which
don't. The user decides what to do with that.

**Voice rules apply (see `~/Code/pod/ETHOS.md` §2):** concrete
numbers, ticker names, file paths, catalyst dates. No AI hedge-speak.
No em dashes.

**AskUserQuestion is mandatory for every user input** (ETHOS §3). No
plain chat prompts. If AUQ is unavailable, stop and report
`BLOCKED — AskUserQuestion unavailable`.

---

## Step 0: Resolve the thesis slug

This skill validates an **existing** thesis — there is no "new thesis"
option. If the user has zero theses, BLOCK with: "No theses found in
`book/theses/`. Run `/pod-thesis-hours` first to capture one, then
come back to validate it."

```bash
eval "$(~/Code/pod/bin/pod-paths)"
mkdir -p "$POD_THESES"
EXISTING_THESES=$(~/Code/pod/bin/pod-thesis-list | head -6)
if [ -z "$EXISTING_THESES" ]; then
  echo "BLOCKED_NO_THESES"
fi
echo "$EXISTING_THESES"
```

If `BLOCKED_NO_THESES`, stop and report per the rule above.

Otherwise AskUserQuestion (decision-brief format from ETHOS §3):

```
D0 — Which thesis are we validating?
ELI10: pod reads the latest doc under book/theses/<slug>/ and walks
       through its named assumptions against current real-time data.
       Pick from your existing theses.
Options:
A) <slug-1>   (last touched <date>)
B) <slug-2>   (last touched <date>)
...
```

Recommend the most recently touched thesis (option A) since stale
theses benefit most from validation. Set `THESIS_SLUG` from the answer.

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


Then read the latest thesis doc and scan for prior validations:

```bash
DIR="$POD_THESES/$THESIS_SLUG"
LATEST_THESIS=$(find "$DIR" -maxdepth 1 -name "*-thesis.md" -o -name "*-update.md" 2>/dev/null | sort -r | head -1)
LATEST_VALIDATION=$(find "$DIR" -maxdepth 1 -name "*-validation.md" 2>/dev/null | sort -r | head -1)
echo "LATEST_THESIS: $LATEST_THESIS"
echo "LATEST_VALIDATION: $LATEST_VALIDATION"
```

**Read `$LATEST_THESIS` in full** with the Read tool. This is the
source of truth for what assumptions need to be re-checked.

If `$LATEST_VALIDATION` exists, **read it too** — the prior
validation's per-assumption verdicts are the diff baseline. Surface
any assumption that flipped state since last check.

If `$LATEST_THESIS` does not exist, BLOCK with: "No thesis doc found
under `$DIR`. Validation requires an existing `*-thesis.md` or
`*-update.md` to validate against. Run `/pod-thesis-hours` first."

---

## Step 2: Extract validatable assumptions from the thesis

From `$LATEST_THESIS`, surface every falsifiable claim. Look for:

- **Tickers and price targets** (e.g., "CRWV at $80", "APLD doubles
  to $20")
- **Catalyst dates** (earnings, FDA dates, PPA resets, options
  expiry, conference dates)
- **Quantitative thresholds** (revenue growth >40%, margin expansion
  to X%, ARR milestone)
- **Position-sizing claims** ("I want to be 5% of book", "scale on
  $X drawdown")
- **Macro / second-order claims** (rates path, fed pivot, AI capex
  cycle peak)
- **Contrarian framings** ("consensus thinks X, I think Y") — these
  are the highest-value validation rows

Build an in-memory list of assumptions, each with:
- `id` — short kebab-case identifier (e.g., `crwv-q1-revenue-beat`)
- `claim` — verbatim phrase from the thesis doc
- `data_source` — one of: `alpaca`, `plaid`, `web`, `user-only`
  (where to look for the validating signal)

Cap at 8 assumptions to keep the validation tractable. If the thesis
has more, pick the most load-bearing ones (catalysts with dates,
explicit price/threshold claims, contrarian framings). Tell the user:

> Found N assumptions in the thesis. Validating the top 8 by
> load-bearing weight: <list>. The rest are noted as "carried over"
> in the validation doc.

---

## Step 3: Pull real-time data per assumption

For each assumption with `data_source` in `{alpaca, plaid, web}`,
fetch live data **before** asking the user to mark verdict. The user
shouldn't have to remember what CRWV is trading at — pod brings the
data, the user judges fit.

**Alpaca** (live prices, quotes, options, snapshots):

```
mcp__alpaca__get_stock_snapshot    — current quote + day stats + last bar
mcp__alpaca__get_stock_latest_quote — tightest current bid/ask
mcp__alpaca__get_clock              — confirm market open/closed
mcp__alpaca__get_option_chain       — for options-thesis validation
```

Pre-validation safety check:

```
mcp__alpaca__get_clock
```

If market is closed, surface that to the user — last-trade prices may
be hours stale. Validation still proceeds, but flag the staleness in
the doc.

**Plaid** (current holdings across all linked brokerages, read-only):

```bash
# Cross-brokerage position lookup for tickers named in the thesis
plaid investments holdings --all --json \
  | jq --arg t "<TICKER>" '.[] | select(.ticker == $t)'
```

Use this to answer: *Am I still positioned consistent with the
thesis?* If the thesis says "5% of book" and current holdings show
1.2%, that's a validation row by itself.

**Web** (catalyst dates, news, filings) — only if the user opts in
per-assumption. Pod does not silently web-fetch. If `data_source` is
`web`, ask first:

```
D<N> — Pull a web check for assumption "<claim>"?
ELI10: pod can fetch a quick web search for catalyst confirmation
       (e.g., "did CRWV report Q1 earnings on 2026-05-07"). Skip if
       you already know the answer.
Options:
A) Yes, fetch the web check
B) No, I'll mark this assumption from memory
```

**User-only** assumptions (qualitative, contrarian framings): no
fetch. Just present the claim and ask the verdict.

For every fetched datum, capture into working memory keyed by
assumption `id`:

```
fetched[id] = {
  timestamp: <ISO 8601>,
  source: "alpaca|plaid|web",
  raw: <stringified result>,
  summary: <one-line distillation>,
}
```

If a fetch fails (rate limit, network, MCP unavailable), do NOT
silently skip. Record the failure in `fetched[id]` as
`{summary: "FETCH_FAILED: <reason>"}` and continue. The user will see
the gap in the validation doc.

---

## Step 4: Walk through each assumption — one AUQ per row

For each assumption, present the original claim, the freshly-fetched
data, and ask the verdict. One AUQ call per assumption (do NOT
bundle — the user is making a judgment per row).

Format (decision-brief from ETHOS §3):

```
V<N>/<total> — Verdict on "<claim>"
ELI10: original claim from <thesis-doc-filename>. Current live
       signal: <one-line summary from fetched[id]>. Mark whether the
       claim still holds.
Options:
A) Intact — signal still supports the claim
B) Broken — signal contradicts the claim
C) Unknown — data isn't conclusive either way
D) N/A — claim no longer applies (e.g., catalyst already passed)
```

After the verdict, AUQ for an optional one-line note. Keep this
lightweight — the user can skip:

```
N<N> — Add a note for "<id>"? (optional)
ELI10: one-liner that explains *why* this verdict. Goes verbatim into
       the validation doc. Skip if the verdict is self-explanatory.
Options:
A) Type a note (recommended for broken/unknown rows)
B) Skip
```

Capture both verdict and note verbatim per assumption id.

**Diff against prior validation:** if `$LATEST_VALIDATION` existed
and an assumption flipped state (e.g., intact → broken), surface it
in the AUQ ELI10: `*Flipped from <prior verdict> on <date>*.` This is
the highest-signal moment of the entire skill — name it.

---

## Step 5: Write the validation doc

```bash
eval "$(~/Code/pod/bin/pod-paths)"
DATE=$(date +%Y-%m-%d)
DIR="$POD_THESES/$THESIS_SLUG"
mkdir -p "$DIR"
FILE="$DIR/$DATE-validation.md"
if [ -e "$FILE" ]; then
  SUFFIX=$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom 2>/dev/null | head -c 4 || printf '%04x' "$$")
  FILE="$DIR/$DATE-validation-$SUFFIX.md"
fi
echo "FILE=$FILE"
```

Format:

```markdown
---
thesis: <slug>
kind: validation
date: <YYYY-MM-DD>
session: <UTC ISO 8601 timestamp>
validated_against: <relative path to LATEST_THESIS>
prior_validation: <relative path to LATEST_VALIDATION or "none">
market_state: <open|closed|holiday>   # from mcp__alpaca__get_clock
verdict_counts:
  intact: <N>
  broken: <N>
  unknown: <N>
  na: <N>
---

# <slug> — Validation <YYYY-MM-DD>

**Headline:** <one sentence. Either "thesis intact, N of M assumptions
hold" or "thesis under stress, K of M assumptions broken: <names>".>

## Assumptions

### <id-1> — <verdict>

**Claim:** <verbatim from thesis>
**Live signal:** <summary from fetched[id-1]>
**Note:** <user's note or "none">
**Prior verdict:** <from LATEST_VALIDATION or "first check">

... (one section per assumption) ...

## Carried over (not validated this round)

- <id>: <claim> — <reason: low load-bearing weight, no current data
  source, etc.>

---

## Source

Validated via /pod-thesis-validate on <date>. Live data pulled from:
<list of sources used — Alpaca, Plaid, web>. Voice rules from
~/Code/pod/ETHOS.md applied.
```

Frontmatter rules:
- ISO date in `date`
- ISO 8601 timestamp with timezone offset in `session`
- `verdict_counts` reflects the actual tally — do not round, do not
  hide unknowns

Body rules:
- One H3 per assumption, `id — verdict` as the heading
- Verbatim claim text from the thesis
- `Live signal` is the one-line summary from Step 3, never the raw
  JSON dump. If the fetch failed, write `FETCH_FAILED: <reason>` here
  so the gap is visible.
- User's note is verbatim; light typo fixes only

---

## Step 6: Update the thesis README

If `book/theses/$THESIS_SLUG/README.md` exists, update only:
- **Last validated:** `<date>`
- **Validation verdict:** `<N intact / N broken / N unknown / N N/A>`
- Prepend `$DATE-validation.md` to the **Docs in this thesis** list

Do not rewrite anything else. If the README doesn't have a "Last
validated" line yet, add it under "Last updated".

If README doesn't exist, do not create one — that's `/pod-thesis-hours`'s
job. Tell the user: "README not found. Run `/pod-thesis-hours` once to
create the thesis index."

---

## Step 7: Append to the timeline

```bash
~/Code/pod/bin/pod-timeline-log "$(jq -n \
  --arg thesis "$THESIS_SLUG" \
  --arg file "$FILE" \
  --argjson intact "$INTACT_COUNT" \
  --argjson broken "$BROKEN_COUNT" \
  --argjson unknown "$UNKNOWN_COUNT" \
  --argjson na "$NA_COUNT" \
  '{skill:"pod-thesis-validate", thesis:$thesis, event:"completed", file:$file, intact:$intact, broken:$broken, unknown:$unknown, na:$na}')"
```

If any assumption flipped state since prior validation, also log that
as a discrete event so it surfaces in future preambles:

```bash
~/Code/pod/bin/pod-timeline-log "$(jq -n \
  --arg thesis "$THESIS_SLUG" \
  --arg id "$FLIPPED_ID" \
  --arg from "$PRIOR_VERDICT" \
  --arg to "$NEW_VERDICT" \
  '{skill:"pod-thesis-validate", thesis:$thesis, event:"assumption_flipped", id:$id, from:$from, to:$to}')"
```

---

## Step 8: Reflect and log learnings (ETHOS §10)

Log if any of:

- An assumption flipped from intact → broken (worth remembering the
  pattern: *which signal moved first?*)
- A web check or MCP fetch failed in a way that suggests a recurring
  data-source gap
- The user's note named a falsifying signal that wasn't on the
  thesis's original list (a *missing forcing question*)

Skip routine "all intact" validations.

```bash
~/Code/pod/bin/pod-learnings-log "$(jq -n \
  --arg skill "pod-thesis-validate" \
  --arg thesis "$THESIS_SLUG" \
  --arg type "<pattern|pitfall|preference|observation>" \
  --arg key "<short-kebab-id>" \
  --arg insight "<one sentence in your voice>" \
  '{skill:$skill, thesis:$thesis, type:$type, key:$key, insight:$insight}')"
```

---

## Step 9: Recommend next move (contextual handoff, ETHOS cohesion)

Pattern-based nudges:

| If validation showed... | Recommend |
|---|---|
| **All assumptions intact, no flips** | `/pod-save-state` if mid-research; otherwise nothing — thesis stands |
| **One or more broken assumptions** | `/pod-thesis-hours` (refresh) — the thesis as written no longer matches reality; rewrite the broken claim |
| **Position-sizing assumption broken** (e.g., thesis said "5% of book", Plaid shows 1.2%) | Surface `mcp__plaid__*` exposure data; user may want to size up/down |
| **Catalyst date passed, verdict N/A** | Recommend `/pod-thesis-hours` (update) to capture the post-catalyst reframing |
| **Multiple unknowns from fetch failures** | Tell user which fetches failed; suggest re-running after market open or with web checks enabled |
| **An assumption flipped to broken** | Highlight the flip explicitly; recommend `/pod-thesis-hours` (refresh) and reference the flipped assumption by id |

Format:

> Recommended next: `<skill>` — <one sentence citing the specific
> assumption / verdict that drove the recommendation>

Example:
> Recommended next: `/pod-thesis-hours` (refresh) — `crwv-q1-revenue-beat`
> flipped to broken (live signal: Q1 revenue printed 14% below your
> claimed floor). The thesis as written needs a new framing.

---

## Step 10: Confirm and stop

```
THESIS VALIDATED
Thesis:   <slug>
File:     book/theses/<slug>/<filename>
Verdict:  <N intact / N broken / N unknown / N N/A>
Flipped:  <list of ids that changed state, or "none">

Recommended next: <from Step 9>

Other moves:
- Refresh thesis:  /pod-thesis-hours (pick same slug, mode: refresh)
- Save mid-check:  /pod-save-state
- Pick up later:   /pod-resume-state
```

In re-grounding mode (POD_PARALLEL_SESSIONS >= 3), prefix the report
header with `[$THESIS_SLUG]`.

Stop. Do not editorialize beyond the Step 9 recommendation. Do not
re-summarize the assumption-by-assumption tally (it's already in the
file's `verdict_counts` frontmatter).

---

## Hard rules

- **Never ask for user input via plain chat.** Use `AskUserQuestion`
  for every verdict, every note, every web-fetch confirmation. If AUQ
  is not available, the skill is BLOCKED. Stop and report. Do not
  fall back to inline prompts. (ETHOS §3)
- **Never re-judge the thesis.** Capture verdicts, do not argue with
  them. If the user marks a broken assumption "intact" against
  evidence, write it as they said. Pod is mechanism, not opinion.
- **Never silently web-fetch.** Web data sources require per-assumption
  AUQ opt-in. Alpaca/Plaid fetches for tickers explicitly named in
  the thesis are pre-authorized via this skill's allowed-tools.
- **Never place an order.** This skill is read-only against market
  data. Do not call `mcp__alpaca__place_*_order` from inside this
  skill, ever. If the user asks to act on a broken assumption, tell
  them to invoke order-placement separately (with the standard
  pre-trade safety AUQ).
- **Never echo `PLAID_SECRET`, access tokens, or any credentials.**
  Masked tokens from `plaid item list` are fine; full tokens never.
- **Never overwrite an existing validation file.** Collision suffix on
  same-day saves (ETHOS §5).
- **Voice rules apply** to your own prose. The user's verbatim notes
  are their voice, not yours. (ETHOS §2)
- **Error messages are for AI agents (ETHOS §9).** Every fetch
  failure, every BLOCK names what failed precisely, what valid
  options exist, what to run next.
- **Re-ground when parallel (ETHOS §8).** When `POD_PARALLEL_SESSIONS >= 3`,
  prefix AUQ briefs with `Thesis: <slug> | Last validated: <date>`.

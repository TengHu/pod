# pod architecture

This doc explains **why** pod is built the way it is — the design
philosophy, core invariants, and data-flow principles. For the entity
catalog see [entities.md](entities.md). For where things live in
`book/` see [data-model.md](data-model.md).

## What pod is

pod is a Claude Code skill pack for running an AI-assisted investment
process as a single human operator. It turns Claude Code into a
virtual hedge fund team: brainstorm partner, PM, analyst, risk officer,
execution desk.

Mechanically, pod is:

- **A set of SKILL.md files** that Claude reads as procedures
- **A small set of bash helpers** in `bin/` that skills call for I/O
- **A convention for storing work** in a per-workspace `book/` directory

That's it. No daemon. No MCP server (pod itself; it composes with
external MCP servers like Plaid CLI and Alpaca). No background
processes. No global state. Everything pod knows lives in the
workspace's `book/`.

## The closure property

**Every pod skill should be expressible as "read entities X, Y, Z →
compute → write entity W." If a skill doesn't fit that shape, it's not
really a pod skill.**

This is the foundational architectural rule. It means:

- Pod is a **transformation system over entities**. Skills don't have
  hidden state, side channels, or implicit interactions. Every effect
  is a write to one of the entities defined in [entities.md](entities.md).
- The entity model is **closed**. Anything Claude Code does in a pod
  workspace either reads from / writes to / computes one of the
  defined entities, or it's outside pod's domain (a user invoking
  general Bash, WebFetch, etc.).
- New skills can be specified completely by listing their input
  entities, computation, and output entities. If you can't write that
  spec for a proposed skill, the skill is either over-scoped or
  poorly defined.

Examples of the shape applied to pod's MVP skills:

| Skill | Reads | Computes | Writes |
|---|---|---|---|
| `/pod-thesis-hours` | timeline + learnings + (existing thesis dir if any) | forcing-question answers → structured thesis doc | thesis doc + thesis README + timeline event + (optional learning) |
| `/pod-save-state` | timeline + learnings + thesis dir | session summary | checkpoint + timeline event + (optional learning) |
| `/pod-resume-state` | timeline + learnings + all checkpoints | newest checkpoint per filter | (presents to user) + timeline event |

If a future skill would read external state (e.g., Plaid live data),
the rule still applies — Plaid is just an external entity (see
[entities.md](entities.md) section on external entities).

## Three layers of content

Investment work happens at three distinct cadences:

| Layer | What lives here | Cadence | Pod location |
|---|---|---|---|
| **Philosophy** | Distilled principles, rules you trust about your investing | Rare (annual) | `book/ETHOS.md` |
| **Library** | Reading, learning, frameworks before they're sharp enough to bet on | Weekly+ | `book/library/<domain>/` |
| **Theses** | Coherent testable bets tied to specific tickers and positions | Per-bet | `book/theses/<slug>/` |

The flow: library is upstream (working material). ETHOS is
downstream-distilled (held the view long enough to trust it). Theses
are downstream-applied (found a specific bet that depends on a
framework). Each layer has its own storage shape because each operates
at a different cadence.

See [data-model.md](data-model.md) for full layer definitions and
anti-overlap rules.

## Append-only history with filename-as-canonical-order

Every artifact in pod follows the same write rules:

- **Never overwrite existing files.** New work = new file.
- **Filename `YYYY-MM-DD-*.md` or `YYYYMMDD-HHMMSS-*.md` is the order.**
  Sortable with `sort -r`. Stable across rsync, copy, mv operations.
- **Collision on same-second saves** gets a 4-char random suffix.
- **JSONL files append lines** but never modify or delete lines.

This eliminates "did I lose work?" anxiety. Diffs cleanly in git.
Works in any tool. The order survives moving the directory or copying
the repo to another machine.

## JSONL vs markdown artifacts

**JSONL files are logs that record what happened.** Each line is one
discrete fact at one moment. They never carry narrative; they're
optimized for aggregation.

**Markdown files are documents.** Each file is one coherent unit
worth reading in full — a thesis, a checkpoint, a library note.

The split:

| Dimension | JSONL artifact | Markdown artifact |
|---|---|---|
| **Granularity** | One line per FACT | One file per coherent unit |
| **Structure** | Strict schema, machine-readable | Rich format: headers, prose, frontmatter |
| **Append shape** | Append-line (keep adding lines to ONE file) | Append-file (keep creating NEW files) |
| **Intended reader** | A program (jq, grep, pod skills aggregating) | A human (or Claude reading like one) |
| **Atom of value** | One line = one discrete fact | One file = one coherent argument |

**Use JSONL when:**

- The same kind of event recurs many times
- It has a fixed schema
- You'll want to aggregate / filter across many instances

**Use markdown when:**

- Each instance is a unique document worth reading in full
- It has prose, structure, sections
- A human (or Claude as human) is the primary reader

Pod uses both because investing has both kinds of work: high-frequency
facts (positions, skill runs, lessons) and low-frequency narratives
(theses, frameworks, retros).

## No global state

Everything pod knows lives inside the workspace's `book/` directory.

- **No `~/.pod/`** — pod has no home-directory state
- **No external database** — SQLite, PostgreSQL, Redis are not part of pod
- **No daemons** — no long-running background processes
- **No telemetry** — pod doesn't phone home

If you move `book/` to another machine, pod's full state moves with
it. If you delete `book/`, pod has nothing.

**The two exceptions** (neither pod-owned):

- `~/.claude/skills/pod-*` — symlinks created by setup. Regenerable
  pointers, not state.
- `~/.plaid-cli/` (when using plaid-skill) — separate tool's token
  storage. Pod doesn't write here.

## How skills become aware of what other skills produced

A pod skill running today must know what skills produced last week, last
session, or 30 seconds ago in another window. Otherwise every invocation
starts fresh — Claude has no memory of the team's prior work and the
skills feel isolated.

Pod (mirroring gstack) achieves cross-skill awareness through **five
mechanisms, none of which involve skills calling each other directly:**

### 1. Convention-driven file discovery

Every artifact follows a stable filename pattern documented in
[data-model.md](data-model.md). A skill that needs to find "the latest
thesis doc for slug X" runs:

```bash
find book/theses/<slug> -maxdepth 1 -name "*-thesis.md" | sort -r | head -1
```

It works because the naming convention is enforced. No directory listing
service or registry — the filesystem itself is the index.

This is gstack's pattern verbatim. gstack uses
`find ~/.gstack/projects/<slug>/checkpoints/ -name "*.md" | sort -r | head -1`
for the same purpose with the same conventions.

### 2. Shared event log read at preamble

Every skill's Step 1 reads `book/_events/timeline.jsonl` for recent
events. The skill instantly knows:

- Which skills ran recently (and for which thesis)
- When each ran
- What they produced (file paths logged in the event)

```bash
grep "\"thesis\":\"$THESIS_SLUG\"" book/_events/timeline.jsonl | tail -5
```

This is the single biggest cohesion mechanism. With it, every skill
runs already-briefed on what the team did before.

gstack does this verbatim: every skill's preamble reads
`~/.gstack/projects/<slug>/timeline.jsonl` and pulls last 3-5 events.

### 3. Shared learnings log read at preamble

Same Step 1 also reads `book/_events/learnings.jsonl` filtered by
current thesis or thesis-agnostic. Surfaces durable insights:

```bash
jq -r --arg t "$THESIS_SLUG" \
  'select(.thesis == $t or .thesis == null) | "[\(.type)] \(.insight)"' \
  book/_events/learnings.jsonl | tail -3
```

Now the skill knows "user previously learned X about Vanguard cost
basis," "user prefers binary catalysts get bear-cased before sizing,"
etc. These insights bias the skill's behavior in subtle ways.

gstack does this via `bin/gstack-learnings-search --limit 3` in the
preamble. Same idea, different implementation.

### 4. Frontmatter cross-references between artifacts

Artifacts explicitly link to other artifacts via frontmatter fields:

```yaml
---
thesis: apld-utility-call
themes: [ai-infra, power]
related_theses: [iren-comp]
library_refs:
  - library/cycles/2026-05-15-dalio-debt-cycle.md
---
```

A skill reading a thesis doc sees the `library_refs` and knows which
framework material it depends on. A skill writing a new thesis can
populate `related_theses` when the user mentions an existing thesis
by name.

gstack uses the same pattern: review findings reference plan files,
plan files reference design docs, design docs reference prior eureka
moments.

### 5. Directory scan as the implicit table of contents

When a skill enters a thesis (or any entity-folder), it lists the
directory contents:

```bash
ls -la book/theses/<slug>/
```

The agent SEES every artifact that exists for this thesis: thesis
docs (by date), bear-case files, position log, checkpoints folder.
The agent reasons over what's there without anyone telling it
explicitly. The filesystem is the source-of-truth for "what exists."

Convention compliance is what makes this work. If artifacts had
arbitrary names, the directory listing would be opaque. Because every
file follows `YYYY-MM-DD-<kind>.md` or `YYYYMMDD-HHMMSS-<title>.md`,
the agent reads filenames as structured data.

### The five mechanisms together

```
NEW SKILL RUNS
     │
     ↓
Reads book/_events/timeline.jsonl   ← #2 recent activity across team
     │
     ↓
Reads book/_events/learnings.jsonl  ← #3 durable lessons accumulated
     │
     ↓
Lists book/theses/<slug>/           ← #5 what exists for this thesis
     │
     ↓
Reads latest thesis doc             ← #1 convention-driven file discovery
     │
     ↓
Follows frontmatter refs            ← #4 explicit cross-references
     │
     ↓
Now fully briefed. Begins skill-specific work.
```

The skill doesn't call other skills. It reads the workspace state that
other skills left behind. The team coordinates through files, not
through APIs.

### What gstack does that pod doesn't (yet)

Two additional mechanisms in gstack worth knowing about for future
pod work:

**Meta-orchestrator pattern** (gstack's `/autoplan`). Reads OTHER
SKILL.md files at runtime and follows their instructions inline.
Not invoking them as separate processes; reading their content as
data. Useful when you want to run multiple reviews in sequence with
shared decision-making. Pod's `/pod-autoplan` (v1, when shipped) will
likely use this pattern.

**Handoff notes** (gstack's `<branch>-ceo-handoff-*.md`). When one
skill defers to another (e.g., `/plan-ceo-review` pauses for the user
to run `/office-hours` first), it writes a handoff note with what was
discussed so far. The picking-up skill reads the note and resumes
context. Pod doesn't have this yet; would be useful when v1 chains
get longer.

### The principle

**Pod skills are stateless invocations operating on a shared
filesystem.** They don't import each other, don't communicate at
runtime, don't share memory. They share *the workspace*. Cross-skill
awareness emerges from reading the workspace at preamble time, not
from any skill-to-skill mechanism.

This is why the closure property matters: if a skill operates outside
the entity model, other skills can't see what it did. The entity
model is the public contract; everything outside it is private to
that one skill invocation and forgotten when the session ends.

## Cross-skill cohesion mechanisms

Pod skills work together because they share conventions, not because
they explicitly call each other. The cohesion comes from:

1. **Shared workspace** (`book/`) — every skill reads/writes the same
   directory tree
2. **Shared event log** (`book/_events/timeline.jsonl`) — every skill
   appends one line per run; every skill reads recent events at start
3. **Shared memory** (`book/_events/learnings.jsonl`) — durable lessons
   accumulated and surfaced by every skill
4. **Shared philosophy** (`ETHOS.md` in pod source) — voice rules,
   AskUserQuestion format, Confusion Protocol, all applied identically
   across skills
5. **Shared output schemas** — JSONL files have strict schemas so the
   next skill can read what the previous wrote
6. **Parallel-session awareness** — every skill counts active sessions
   and adapts (re-grounding mode when 3+ windows open)
7. **Contextual next-skill recommendations** — every skill ends with a
   pattern-matched nudge based on what was captured, not a generic list
8. **Agent-targeted errors** — every error includes the next concrete
   action; no raw exception text

Skills don't import each other. They just operate on shared entities.
The workflow chain emerges from the entities, not from skill-to-skill
RPC.

## What pod is NOT

- **Not a portfolio management system.** Pod tracks reasoning, not
  positions. Positions live at your broker (Plaid is the truth-source).
- **Not a trading platform.** Pod composes with Alpaca MCP for orders;
  it doesn't execute trades itself.
- **Not a multi-user product.** One workspace, one user. No accounts,
  no auth, no sharing.
- **Not opinionated about investment style.** Pod ships mechanisms.
  Your investment philosophy lives in `book/ETHOS.md`, never in pod's
  source.
- **Not a financial-data aggregator.** Pod calls Plaid via the
  separate plaid-skill. Pod doesn't own bank/broker data.
- **Not a research-content store.** Pod stores YOUR reasoning about
  investments. The underlying research data (10-Ks, calls, news)
  lives wherever you read it.

## Versioning

Pod follows neither semver nor a strict release cadence. The
`pyproject.toml` version in pod's source advances when meaningful
changes ship. Skills are symlinked into your workspace, so `git pull`
in `~/Code/pod/` is your update mechanism.

If you want to pin a specific version, check out a specific commit in
`~/Code/pod/` and don't `git pull`. The symlinks will keep pointing at
whatever's checked out.

## Reading list

For a deeper understanding, read in this order:

1. [entities.md](entities.md) — what pod reasons about
2. [data-model.md](data-model.md) — where each entity lives + relationships
3. This doc (architecture.md) — why it's structured this way
4. `../ETHOS.md` — the operating rules for skills
5. Individual SKILL.md files in `../pod/<skill>/` — concrete examples

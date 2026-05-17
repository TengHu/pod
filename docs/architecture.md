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

## How shared mechanisms are encoded into every skill

The previous section explained how a skill becomes aware of prior
outputs. But how does every skill in pod *have* the preamble that
reads timeline, learnings, session count, and so on? Where is that
shared bash block stored?

This is a separate architectural question from runtime cohesion, and
it has its own answer.

### Two distinct mechanisms

**Distinction matters.** Cross-skill cohesion has two layers, often
conflated:

| Mechanism | When it fires | What it does | How it's stored |
|---|---|---|---|
| **Preamble injection** | Every single skill invocation, automatically | Adds shared context recovery + ETHOS rules at the top of every skill | Static (compile-time): templates expand into committed SKILL.md files |
| **Meta-orchestrator** (e.g., gstack's `/autoplan`) | Only when user explicitly invokes the orchestrator | Reads OTHER SKILL.md files as data, follows their instructions inline, auto-decides mechanical questions | Runtime: a regular SKILL.md that uses the Read tool to load other skills |

Both contribute to cohesion. The preamble injection is the
*every-skill* mechanism. The meta-orchestrator is the
*multi-skill-orchestration* mechanism. They're complementary but
solve different problems.

### gstack's preamble injection (the encoding mechanism)

Gstack uses **static code generation** at build time:

```
EDIT TIME (maintainer)
  ├── office-hours/SKILL.md.tmpl        ← hand-edited, short (~600 lines)
  ├── plan-ceo-review/SKILL.md.tmpl     ← hand-edited
  ├── ... other .tmpl files
  └── scripts/resolvers/preamble.ts     ← TypeScript that emits the ~500-line preamble

           ↓ bun run gen:skill-docs
           ↓ regex replaces {{PREAMBLE}} → emitted markdown
           ↓ writes generated SKILL.md (~2100 lines each)

BUILD ARTIFACT (committed to git)
  ├── office-hours/SKILL.md             ← generated, big
  ├── plan-ceo-review/SKILL.md          ← generated, big
  └── ...

           ↓ ./setup symlinks committed SKILL.md to ~/.claude/skills/

CLAUDE CODE RUNTIME
  └── reads ~/.claude/skills/office-hours/SKILL.md when user invokes /office-hours
```

**The build happens at maintenance time, never at Claude invocation
time.** When the user runs `/office-hours`, Claude opens the
already-expanded SKILL.md — the preamble is baked in. Claude doesn't
run the build pipeline.

Every gstack SKILL.md.tmpl starts with `{{PREAMBLE}}`. When
`gen-skill-docs.ts` runs, it expands that placeholder into a
~500-line bash block at the top of every generated SKILL.md. Every
skill has identical preamble content, because they share the same
source (`preamble.ts`).

If Garry edits `preamble.ts` to add one line, all 45 skills' SKILL.md
files get that line on the next `bun run gen:skill-docs`. Single
source of truth, mass-applied via build.

### gstack's `/autoplan` is the OTHER mechanism (orchestration)

`/autoplan` is *not* part of the preamble system. It's a regular
skill the user invokes when they want to run CEO review + design
review + eng review in sequence with auto-decisions.

`/autoplan/SKILL.md` (roughly) says:

> "Read `~/.claude/skills/plan-ceo-review/SKILL.md` using the Read
> tool. Follow its instructions from top to bottom, skipping sections
> marked 'already handled by parent skill'. Auto-decide mechanical
> questions using these 6 principles..."

It treats other skill files as DATA, not as functions to call.
Claude reads them inline within the parent invocation. The pattern is
"meta-orchestrator": one skill that runs other skills by loading and
executing their instructions.

**`/autoplan` is invoked when the user types it, not every time.**

### Pod's current approach (and the gap)

Right now pod has neither mechanism built:

| | gstack | pod (current) |
|---|---|---|
| Shared preamble | One file (`preamble.ts`), expanded into N SKILL.md at build time | Hand-copied across N SKILL.md files; edit-each-time |
| Drift risk | Zero — single source of truth | Linear with skill count |
| `/autoplan` equivalent | Built (reads other SKILL.md as data) | Not built (designed for v1) |
| Build step | `bun run gen:skill-docs` | None — direct edits |

When I added the parallel-session counter to pod's 3 MVP skills, I
hand-copied the same bash block into three files. This works at 3
skills. At 4-5 skills it starts to drift. At 7+ skills it becomes a
maintenance disaster.

**Pod's cohesion today is enforced by maintainer discipline, not by
the encoding mechanism.** The discipline scales to 3-5 skills; after
that pod needs a real templating system.

### The shape of pod's future templating system

When it's time to build:

```
~/Code/pod/
├── pod/                              ← skill sources (.tmpl format)
│   ├── thesis-hours/
│   │   ├── SKILL.md.tmpl             ← hand-edited
│   │   └── SKILL.md                  ← generated (committed OR gitignored)
│   └── ...
├── scripts/
│   ├── gen-skill-docs.ts             ← build script (~80 lines)
│   ├── discover-skills.ts            ← finds .tmpl files (~30 lines)
│   └── resolvers/
│       ├── index.ts                  ← RESOLVERS registry
│       ├── preamble.ts               ← {{PREAMBLE}}: session count + paths + timeline + learnings read
│       ├── auq-format.ts             ← {{AUQ_FORMAT}}: decision brief spec
│       ├── voice-rules.ts            ← {{VOICE_RULES}}: ETHOS §2 reference
│       └── completion-status.ts      ← {{COMPLETION_STATUS}}
└── setup.md                          ← runs `bun run gen:skill-docs` then symlinks
```

Total ~200 lines of build infrastructure. CI freshness check
(`gen-skill-docs --dry-run` + `git diff --exit-code`) prevents
committing stale generated files.

See [Open architectural items](#open-architectural-items) below for
the trigger condition.

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

## Open architectural items

The build pipeline, meta-orchestrator, and a few other cohesion
infrastructure pieces are roadmapped but not built. Each has an
explicit trigger condition so the work happens when it's actually
needed.

### D — Templating + build system ✅ BUILT

**Built and shipped.** Pod now has a gstack-style templating layer:

```
~/Code/pod/
├── pod/<skill>/SKILL.md.tmpl        (hand-edited)
├── pod/<skill>/SKILL.md             (generated, committed)
├── package.json + tsconfig.json     (bun + TypeScript)
└── scripts/
    ├── gen-skill-docs.ts            (build pipeline)
    ├── discover-skills.ts           (finds .tmpl files)
    └── resolvers/
        ├── types.ts                 (Resolver type)
        ├── index.ts                 (RESOLVERS registry)
        ├── preamble.ts              ({{PREAMBLE}} — parallel-session
        │                              counter + timeline + learnings reads)
        ├── voice-rules.ts           ({{VOICE_RULES}} — ETHOS §2)
        ├── auq-format.ts            ({{AUQ_FORMAT}} — ETHOS §3)
        └── hard-rules-base.ts       ({{HARD_RULES_BASE}} — universal rules)
```

**How to use:**

- Edit `pod/<skill>/SKILL.md.tmpl` (with `{{PLACEHOLDERS}}` for shared blocks)
- Run `bun run gen:skill-docs` to regenerate `SKILL.md`
- Commit both `.tmpl` and `SKILL.md`
- CI freshness check: `bun run gen:check` exits non-zero on drift

**Currently using:**

- `{{PREAMBLE}}` is used by all 3 MVP skills (replaces the
  hand-copied parallel-session + timeline + learnings block)

**Available but not yet used in .tmpl files:**

- `{{VOICE_RULES}}` — inline ETHOS §2 voice rules into a skill
- `{{AUQ_FORMAT}}` — inline ETHOS §3 AUQ decision-brief format
- `{{HARD_RULES_BASE}}` — universal hard rules every skill should have

These can be threaded into existing skills as the maintainer wishes.
The build is incremental — adding a placeholder to a .tmpl and
regenerating is the workflow.

**Next steps for templating:**

- Thread `{{VOICE_RULES}}` and `{{AUQ_FORMAT}}` into each skill's
  body in place of the current "(see ETHOS §X)" references, so ETHOS
  rules are actually in Claude's context when a skill runs
- Consider parameterized resolvers (e.g., `{{PREAMBLE:cross-thesis}}`)
  if the variation-per-skill grows beyond what the unset-THESIS_SLUG
  fallback handles

### `/pod-autoplan` (meta-orchestrator pattern)

When v1 skills `/pod-bear-case` + `/pod-cio-review` + `/pod-risk-officer`
ship, they'll likely be chainable via a meta-orchestrator like gstack's
`/autoplan`. Reads other SKILL.md files as data, runs them in sequence
with auto-decisions on mechanical questions, surfaces only taste
decisions to the user.

**Trigger to build:** when 3+ chainable skills exist and the chain is
common enough that running them individually feels redundant.

### Handoff notes between skills

Gstack pattern: when one skill defers to another (e.g.,
`/plan-ceo-review` pauses for the user to run `/office-hours` first),
it writes a handoff note (`<branch>-ceo-handoff-*.md`) with what was
discussed. The picking-up skill reads the note and resumes context.

**Pod equivalent (future):** `book/_handoffs/YYYYMMDD-HHMMSS-*.md` for
mid-chain context.

**Trigger to build:** when pod has skills that defer to other skills
(e.g., `/pod-cio-review` discovers no thesis doc exists and wants to
chain into `/pod-thesis-hours`).

### Learnings rotation

`book/_events/learnings.jsonl` grows unbounded. Gstack handles this
via attempts.jsonl rotation (10MB, 5 generations). Pod will need the
same pattern when learnings hit ~1MB.

**Trigger to build:** when `wc -l book/_events/learnings.jsonl` exceeds
1000 entries, OR users report stale insights surfacing.

### CLAUDE.md skill routing injection

Gstack writes a `## Skill routing` section to the user's project
CLAUDE.md so Claude Code proactively routes user intent to skills
(e.g., user says "I have an idea" → invoke `/office-hours`). Pod
deliberately does NOT do this — per the workspace separation rule,
pod doesn't write to the user's CLAUDE.md. Pod relies on skill
frontmatter descriptions for routing.

**Trigger to revisit:** if skill descriptions stop being enough for
Claude Code to route correctly (e.g., ambiguous overlap between two
skills' descriptions).

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

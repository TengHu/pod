# pod entities

Exhaustive catalog of every entity pod reasons about. For design
philosophy see [architecture.md](architecture.md). For how content is
organized in `book/` see [data-model.md](data-model.md).

## Four categories

Every entity in pod fits one of four categories:

| Category | Definition | Examples |
|---|---|---|
| **Stored** | Persistent state on disk in `book/` | thesis, library entry, learning |
| **Ephemeral** | Has state during its lifetime; auto-expires | session, in-flight skill run |
| **Derived** | Computed at query time, never stored | theme, current exposure, net worth |
| **External** | Other systems' data pod reads but doesn't own | Plaid items, Alpaca data, git state |

## Slugs — the identifier system

A **slug is an identifier**, not an entity. It's the short,
filesystem-safe, kebab-case string used to *reference* an entity.

Think of it like a primary key: not a row itself, but the handle that
lets you find a row.

### Slug rules

- **Lowercase letters, digits, hyphens only** (`[a-z0-9-]+`)
- **No spaces, no underscores, no special chars** (stay ASCII-safe)
- **3–60 characters**
- **No leading or trailing hyphens**
- **Stable for the entity's lifetime** (renaming a thesis folder is messy; pick once)

### Where slugs appear

| Slug type | Examples | Used as |
|---|---|---|
| **Thesis slug** | `apld-utility-call`, `miner-to-ai-mispricing` | Directory name (`book/theses/<slug>/`), `thesis:` frontmatter, command argument |
| **Library domain** | `volatility`, `cycles`, `value-investing` | Directory name (`book/library/<domain>/`), `domain:` frontmatter |
| **Theme tag** | `ai-infra`, `crypto`, `power` | Frontmatter array (`themes: [ai-infra, power]`) |
| **Session ID** | numeric PPID (e.g., `12345`) | File name in `book/_sessions/<PPID>` |

### Pod chooses slugs; gstack derives them

| | gstack | pod |
|---|---|---|
| **Project/workspace slug** | Derived from `git remote get-url origin`, cached. Same repo → same slug. | None. Workspace = cwd. |
| **Sub-project slug** (thesis in pod, branch in gstack) | Sanitized git branch name | **User-chosen** via AskUserQuestion in `/pod-thesis-hours` |

Pod chooses because there's no canonical natural name for a thesis —
`apld-utility-call` and `apld-prime-checking-discount` could both be
valid depending on framing. Asking forces clarity.

---

## Stored entities (15)

Persistent state on disk inside `book/`.

### 1. Workspace

The repo where pod operates (e.g., `~/Code/hedge-fund/`). Identified by
cwd, not by a slug. One workspace active at a time.

- **Location:** the directory itself
- **Writer:** OS / git
- **Reader:** every skill (via `pod-paths` which walks up to find `book/`)

### 2. Book

The pod state inside a workspace. Created on first pod skill invocation.
Git-tracked.

- **Location:** `<workspace>/book/`
- **Writer:** pod skills (create on first write)
- **Reader:** all pod skills

### 3. ETHOS (philosophy)

The user's distilled investment principles. Single markdown file at the
top of the book. Rare edits.

- **Location:** `book/ETHOS.md`
- **Writer:** user only (pod skills never edit)
- **Reader:** every skill at preamble time (for voice / philosophy context)
- **Scope:** book-wide

### 4. Library domain

A topic of foundational study (e.g., volatility, cycles, value-investing).
A folder containing related notes.

- **Location:** `book/library/<domain>/`
- **Writer:** user creates, future `/pod-library-hours` skill writes
- **Reader:** thesis-writing skills (via `library_refs` frontmatter)
- **Scope:** book-wide

### 5. Library entry

A single dated reading or framework note within a domain. Append-only;
new note = new file.

- **Location:** `book/library/<domain>/YYYY-MM-DD-*.md`
- **Format:** Markdown with frontmatter (domain, source, date, tags, informs_theses)
- **Writer:** user or library skill
- **Reader:** thesis-writing skills when cross-referenced

### 6. Design doc

System design docs for the pod workspace (architectural decisions, data
model evolution).

- **Location:** `book/_design/YYYY-MM-DD-*.md`
- **Format:** Markdown
- **Writer:** user or rare skill-driven
- **Reader:** Claude reads when surveying architectural state

### 7. Thesis (folder + README)

A coherent testable bet. The core unit of pod's work. Long-lived. Doesn't
converge.

- **Location:** `book/theses/<thesis-slug>/` (folder) + `README.md` inside
- **Writer:** `/pod-thesis-hours` creates; all skills update README as state shifts
- **Reader:** every skill that touches a thesis
- **Scope:** per-thesis

The `README.md` is the **current state** view: status (active-research,
active-position, watching, closed, archived), conviction (prose),
latest doc, position summary.

### 8. Thesis artifact (dated markdown)

A dated document inside a thesis folder. Captures the thesis or an
update at a point in time. Append-only as new files.

- **Location:** `book/theses/<slug>/YYYY-MM-DD-thesis.md`, `-update.md`, or `-bear-case.md` (future)
- **Format:** Markdown with frontmatter
- **Writer:** `/pod-thesis-hours`, future `/pod-bear-case`, etc.
- **Reader:** every skill that needs the thesis narrative

### 9. Position event

One decision on a ticker tied to a thesis (entry, scale, trim, exit).
Append-only JSONL.

- **Location:** `book/theses/<slug>/positions.jsonl`
- **Format:** JSONL, one line per decision
- **Schema:** `{ts, action: entry|scale|trim|exit, ticker, shares, price, thesis_quote}`
- **Writer:** future `/pod-execute`; user manual appends
- **Reader:** future `/pod-portfolio-exposure`, `/pod-thesis-hours` context recovery
- **Scope:** per-thesis

**Important:** position events are your *reasoning trail*, not your
*truth-source for what you currently own*. See [data-model.md](data-model.md)
on Plaid as the position truth source.

### 10. Checkpoint

Mid-research session save. Per-thesis, dated to the second.

- **Location:** `book/theses/<slug>/checkpoints/YYYYMMDD-HHMMSS-<title>.md`
- **Format:** Markdown with frontmatter (status, thesis, timestamp, files_touched) + four sections (Working on, Decisions Made, Remaining Work, Open Questions)
- **Writer:** `/pod-save-state`
- **Reader:** `/pod-resume-state`
- **Scope:** per-thesis

### 11. Timeline event

One skill invocation logged. Append-only JSONL across all skills and theses.

- **Location:** `book/_events/timeline.jsonl`
- **Format:** JSONL
- **Schema:** `{ts, skill, event: started|completed, thesis?, file?, outcome?}`
- **Writer:** every skill via `pod-timeline-log`
- **Reader:** every skill at preamble (last 3-5 events for context)
- **Scope:** book-wide

Timeline is the **logs are records of what happened** at the
event-stream level. Pod skills consult it to answer "what was this
team doing recently?"

### 12. Learning

Durable insight worth remembering across sessions. Typed (pattern,
pitfall, preference, observation).

- **Location:** `book/_events/learnings.jsonl`
- **Format:** JSONL with prompt-injection scan on `insight` field
- **Schema:** `{ts, skill, thesis?, type, key, insight}`
- **Writer:** every skill via `pod-learnings-log` (at end-of-skill reflection)
- **Reader:** every skill at preamble (filtered to current thesis + thesis-agnostic)
- **Scope:** book-wide

Learnings is the cross-skill memory loop. Without it, every session
re-derives the same gotchas. With it, pod gets smarter on the user's
specific setup over time.

---

## Ephemeral entities (2)

Have state during their lifetime; auto-expire without manual cleanup.

### 13. Session

One Claude Code invocation in one terminal window. Tracked via touch
files; auto-cleaned >2h old.

- **Location:** `book/_sessions/<PPID>`
- **Format:** empty file (timestamp = mtime)
- **TTL:** 2 hours since last touch
- **Writer:** every skill at preamble
- **Reader:** every skill at preamble (counts files <2h old)

When `count >= 3`, skills enter **re-grounding mode** — every
AskUserQuestion includes a thesis-context header, status messages
prefix with `[<slug>]`, no assumptions about other windows. See
ETHOS §8.

### 14. Skill run (in-flight)

One pod-skill invocation within a session. Exists in Claude's context
during execution; logged to timeline on completion.

- **Location:** none on disk during execution
- **Writer:** logged at end via `pod-timeline-log` (becomes a timeline event)
- **Reader:** none directly (subsequent skills read the timeline event)

---

## Derived entities (5)

Computed at query time, never stored. Anything you can compute from
stored + external entities is intentionally not its own entity.

### 15. Theme

A cross-cutting label for theses. NOT a folder, NOT a stored entity.
Just a tag in thesis frontmatter.

- **Definition:** any `themes:` entry in any thesis frontmatter
- **Query pattern:** `grep -l "themes:.*<theme>" book/theses/*/2026-*-thesis.md`
- **Why not stored:** themes are framings, not documents. If a theme
  grows complex enough to warrant its own framework doc, that doc is a
  library entry, not a "theme entity."

### 16. Current exposure (total per ticker / per theme)

Live current position summary across the portfolio.

- **Computation:** `mcp__plaid__investments_holdings --all` joined with thesis frontmatter
- **Why not stored:** truth lives at the broker. Caching guarantees staleness.

### 17. Net worth

Total assets - total liabilities across all linked accounts.

- **Computation:** `plaid balance --all` summed
- **Why not stored:** external truth source.

### 18. Conviction across portfolio

Aggregate view of which theses you're most confident in.

- **Computation:** read each thesis `README.md`, aggregate conviction lines
- **Why not stored:** prose, not numeric. Compute on demand.

### 19. Active theses count (by status)

How many theses are in each status (active-research, active-position,
watching, closed, archived).

- **Computation:** grep frontmatter `status:` field across `book/theses/*/`
- **Why not stored:** trivial query; storing creates sync problems.

---

## External entities (5)

Other systems' state that pod reads but doesn't own or maintain.

### 20. Plaid linked items

Banks, brokerages, credit cards linked via Plaid OAuth.

- **Location:** `~/.plaid-cli/` config (managed by plaid CLI)
- **Access:** `plaid item list`, `plaid balance --item <alias>`
- **Pod's relationship:** pod's plaid-skill tells Claude how to query

### 21. Plaid live data (holdings, balances, transactions)

Current state of your accounts, queried fresh on demand.

- **Location:** Plaid's servers
- **Access:** `plaid investments holdings --item <alias> --json`
- **Pod's relationship:** primary truth source for current positions

### 22. Alpaca account state

Account info, positions held at Alpaca, order history.

- **Location:** Alpaca's servers
- **Access:** `mcp__alpaca__get_account_info`, `mcp__alpaca__get_all_positions`
- **Pod's relationship:** truth source for Alpaca-side holdings

### 23. Alpaca market data

Live quotes, options chains, historical bars.

- **Location:** Alpaca's servers
- **Access:** `mcp__alpaca__get_stock_snapshot`, `mcp__alpaca__get_option_chain`
- **Pod's relationship:** market data source for thesis research

### 24. Git state of workspace

History, branches, current diff of the workspace repo.

- **Location:** `.git/` directory
- **Access:** git commands via Bash
- **Pod's relationship:** used for context (recent commits, file changes) and storage (workspace IS a git repo)

---

## The closure property

Every pod skill can be expressed as **"read entities X, Y, Z → compute
→ write entity W."** If a proposed skill doesn't fit that shape, it's
not really a pod skill — see [architecture.md](architecture.md).

The 24 entities above are the **complete domain model**. Anything else
Claude Code does in a pod workspace is either:

- Using a non-pod tool the user invoked directly (general Bash, WebFetch)
- Drifting from pod's domain model (a bug)

If you find yourself wanting a new entity, first ask: can this be
expressed as a transformation over existing entities? If yes, no new
entity needed. If no, the new entity is genuine and should be added
here with its category, location, writer, reader, and scope.

## Entity scope summary

| Scope | Entities |
|---|---|
| **One workspace** | Workspace |
| **Book-wide** (one per workspace) | Book, ETHOS, Library domain, Library entry, Design doc, Timeline event, Learning |
| **Per-thesis** | Thesis, Thesis artifact, Position event, Checkpoint |
| **Per-session** | Session |
| **Per-invocation** | Skill run |
| **Cross-thesis derived** | Theme, Current exposure, Net worth, Conviction view, Active-theses count |
| **External** | Plaid items, Plaid live data, Alpaca account, Alpaca market data, Git state |

## Entity relationships

```
                Workspace
                    │
                    └── Book
                         │
        ┌────────────────┼────────────────┐
        │                │                │
      ETHOS         _events/          theses/<slug>/      library/<domain>/
        │              ├─ timeline       │                    │
        │              ├─ learnings      ├─ README           ├─ README
        │                                ├─ <date>-thesis.md ├─ <date>-*.md
        │                                ├─ positions.jsonl  └─ ...
        │                                └─ checkpoints/
        │                                       │
        └──── influences via library_refs frontmatter ────┘

Ephemeral:
  _sessions/<PPID>  (auto-cleaned >2h)

Derived (computed, not stored):
  Theme (grep over frontmatter)
  Current exposure (Plaid query + thesis joins)

External (read-only):
  Plaid (truth for positions)
  Alpaca (market data + execution)
  Git (workspace history)
```

## Where to add a new entity

When considering a new entity, walk the decision tree:

1. **Can the new artifact be derived from existing entities?** → Don't
   add. Compute it at query time.
2. **Is it persistent (lives between sessions)?** → Stored. Pick a
   location based on scope (book-wide → `_events/` or `library/`;
   per-thesis → `book/theses/<slug>/`).
3. **Is it high-frequency structured data?** → JSONL artifact.
4. **Is it a low-frequency document worth reading?** → Markdown artifact.
5. **Is it external?** → Don't add as a pod entity. Add a skill or
   helper that reads the external source.
6. **Document the new entity here** with category, location, writer,
   reader, scope, format.

The closure property is the highest-order check. If you can't write
the skill's spec as "read X, Y, Z → compute → write W using existing
entities (or one new well-defined entity)," the skill is over-scoped.

# pod data model

How content is organized in `book/`. Where to put new artifacts. How to
avoid overlap. For the entity catalog, see [entities.md](entities.md).
For design philosophy, see [architecture.md](architecture.md).

## Three layers

Investment work happens at three distinct cadences:

| Layer | What lives here | Cadence | Pod location |
|---|---|---|---|
| **Philosophy** | Distilled principles you trust about your investing | Rare (annual) | `book/ETHOS.md` |
| **Library** | Reading, learning, frameworks before they're sharp enough to bet on | Weekly+ | `book/library/<domain>/` |
| **Theses** | Coherent testable bets tied to specific tickers and positions | Per-bet | `book/theses/<slug>/` |

**Flow between layers:**

- **Library** is upstream (working material). You read, you take notes,
  you build frameworks. Each note is dated and append-only.
- **ETHOS** is downstream-distilled. After holding a framework view
  long enough to trust it, the distilled principle moves into ETHOS.
- **Theses** are downstream-applied. When a library framework lets you
  spot a specific mispricing, that becomes a thesis.

Most material flows: library → ETHOS (slow distillation) AND library →
thesis (fast application).

## One thesis = one INTENT

**The most important data-model rule.**

A thesis is a *belief about the world that's testable*. Not a ticker,
not a sector, not a vibe. A specific, falsifiable claim.

- If three tickers share ONE belief ("miner-to-AI pivot is mispriced
  across the sector") → ONE thesis with three positions in `positions.jsonl`
- If three tickers have separate narratives → three separate theses

The smell test: **if you find yourself writing the same paragraph about
the same ticker in two thesis docs, merge them.**

Bad shapes:

- One thesis per ticker, even when the tickers share a thesis →
  fragmentation, hard to aggregate, narrative drift
- One mega-thesis containing 10+ unrelated tickers → no coherent
  falsification possible, just a list

Good shape:

- Multi-ticker thesis when they share ONE belief
- Separate theses when beliefs are distinct
- Cross-reference via `related_theses:` frontmatter when two theses
  intersect

## Themes are tags, not folders

A thesis can be relevant to multiple themes (AI infra + power +
storage). To avoid forcing a thesis into one folder, themes are
**frontmatter tags**, not directory containers.

```yaml
---
thesis: storage-to-ai-pivot
themes: [ai-infra, storage, power]
---
```

Cross-cutting queries are computed at read time:

```bash
grep -l "themes:.*ai-infra" book/theses/*/2026-*-thesis.md
```

**There is no `book/themes/` folder in pod's default scaffolding.** If
a theme grows complex enough to need its own framework document (you
write a "current state of the ai-infra theme" doc that updates
weekly), promote that document to `book/library/<theme-domain>/`. The
library layer is the home for theme-level reasoning when it earns
its own doc.

## Position truth = Plaid. positions.jsonl = reasoning trail

`book/theses/<slug>/positions.jsonl` is **append-only decisions tied to
thesis reasoning**, not a source of truth for what you currently own.

The truth about current holdings comes from
`mcp__plaid__investments_holdings`. Plaid sees what's actually in your
brokerage account.

What `positions.jsonl` is for:

- Why you bought a position (linked to the thesis)
- When you sized up or trimmed (and what triggered it)
- What you exited and what the post-mortem was
- Historical context: a year from now, why did past-you own this?

What `positions.jsonl` is NOT for:

- Live position tracking ("how much CRWV do I own right now?")
- P&L computation
- Tax-lot bookkeeping

If positions.jsonl and Plaid disagree, **Plaid wins.** You may have
bought outside pod (in your broker's app), and Plaid sees it. Pod's
view is the curated reasoning trail, not the authoritative ledger.

## Anti-overlap rules

Seven rules to prevent the same content getting written in multiple
places.

### 1. Position truth = Plaid. Thesis files = reasoning trail.

Don't sum positions.jsonl across theses to find current holdings.

### 2. One thesis = one INTENT, not one ticker.

Multi-ticker theses are fine when they share one belief.

### 3. Themes are tags, not folders.

Cross-cutting view via grep, not via directory hierarchy.

### 4. When same ticker has multiple framings, pick ONE primary thesis.

Cross-reference via `related_theses:` frontmatter. Never duplicate
paragraphs.

### 5. Library is allowed to be incoherent.

Notes from books, podcasts, half-formed ideas all live there. ETHOS
is the distilled product; library is the working material.

### 6. Miscellaneous thesis is OK.

For positions without a strong thesis, use `theses/miscellaneous/` (or
`theses/tactical/`). Don't fake a thesis just to have a home.

### 7. The falsification test.

If "what would prove me wrong?" answer is:

- Bet-specific (e.g., "APLD's PPA reset gets canceled") → **thesis**
- Broad (e.g., "AI infra capex falls 30%") → **library entry**
- Neither (just a position you took on a hunch) → don't write a doc,
  just take the position

## Four-question creation test for new theses

Before creating `book/theses/<new-slug>/`:

1. Is this a NEW belief, or a variant of an existing thesis? (If variant
   → update existing, don't create new)
2. Can I state the belief in one sentence? (If no → too vague)
3. Is the falsification specific and dated? (If "the market is wrong" →
   too broad)
4. Will I revisit this in 30+ days? (If no → it's a tactical position,
   log under `theses/tactical/`)

If yes to all four → create the thesis. Otherwise, route to a
different home.

## Scopes — where does each artifact live

Two simple rules:

> **If the artifact answers a question scoped to ONE thesis** ("where
> was I on APLD?") → per-thesis under `book/theses/<slug>/`.
>
> **If the artifact answers a cross-thesis question** ("what did I do
> this week?") → book-wide under `book/_events/`.

### Per-thesis artifacts (live in `book/theses/<slug>/`)

| Artifact | File | Format |
|---|---|---|
| Thesis state (current) | `README.md` | Markdown with frontmatter |
| Thesis doc (historical) | `YYYY-MM-DD-thesis.md`, `YYYY-MM-DD-update.md` | Markdown with frontmatter |
| Position events | `positions.jsonl` | JSONL, append-only |
| Checkpoints | `checkpoints/YYYYMMDD-HHMMSS-*.md` | Markdown with frontmatter |
| Future: bear-case findings | (decided when `/pod-bear-case` ships) | TBD |

### Book-wide artifacts (live in `book/_events/`)

| Artifact | File | Format |
|---|---|---|
| Skill-run events | `timeline.jsonl` | JSONL, append-only |
| Durable lessons | `learnings.jsonl` | JSONL, append-only |

### Library artifacts (live in `book/library/<domain>/`)

| Artifact | File | Format |
|---|---|---|
| Domain state (current view) | `README.md` | Markdown |
| Dated reading/framework note | `YYYY-MM-DD-<source-or-topic>.md` | Markdown with frontmatter |

## Frontmatter conventions

### Thesis docs

```yaml
---
thesis: apld-utility-call
themes: [ai-infra, power]      # tags, no folder
status: active-research        # or: active-position | watching | closed | archived
created: 2026-05-14
last_updated: 2026-05-26
related_theses: [iren-comp]    # optional
library_refs:                  # optional pointers to framework material
  - library/cycles/2026-05-15-dalio-debt-cycle.md
---
```

### Library entries

```yaml
---
domain: volatility | cycles | value-investing | macro | psychology
source: book | podcast | own | interview | paper
title: Soros on reflexivity
date: 2026-05-16
authors: [Soros]               # optional
tags: [reflexivity, asymmetry] # optional cross-cutting
informs_theses: [apld-utility-call]   # optional
---
```

### Checkpoints

```yaml
---
status: in-progress
thesis: apld-utility-call
timestamp: 2026-05-14T09:30:00-07:00
title: comp-vs-iren
files_touched:
  - book/theses/apld-utility-call/2026-05-14-thesis.md
---
```

## Filename rules

Universal across all pod artifacts:

- **Lowercase letters, digits, hyphens only** in slugs
- **Date prefix** (`YYYY-MM-DD-*.md`) for daily artifacts
- **Datetime prefix** (`YYYYMMDD-HHMMSS-*.md`) for checkpoints (need second precision)
- **Never overwrite** — collision = append `-<4-char-random>` suffix
- **Sortable via `sort -r`** — filename order is canonical

## What's intentionally NOT modeled

Tempting but wrong-fit:

- **Watchlist** — handled by thesis with `status: watching`. No separate entity.
- **Calendar / catalyst dates** — lives in prose inside thesis docs. Could be promoted to a cross-thesis log if calendar queries become important.
- **Risk budget / position caps** — declared in ETHOS or computed from Plaid + ETHOS. No separate file.
- **P&L history** — derived from Plaid + positions.jsonl. Not stored separately.
- **Pod config** — none yet. Could add `book/_config.yaml` later if settings emerge.

When in doubt about whether to add a new entity, see the closure
property in [architecture.md](architecture.md): can the new artifact be
expressed as a transformation over existing entities? If yes, don't
add a new entity. If no, the new entity is genuine.

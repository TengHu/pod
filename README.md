# pod

> "Fundamental, quantamental, and sentiment strategies are now information-processing games, not data-access games."

A virtual hedge fund team for Claude Code. Brainstorm partner, PM, adversarial analyst, risk officer, execution desk. Complete diligence on every thesis, no team overhead.

This is what gstack does for software engineers. pod does it for investors.

## Status

Pre-MVP. Active scaffolding. Not yet usable. See `ETHOS.md` for the
operating principles and `book/_design/2026-05-14-pod-ux-design.md` (in
a workspace using pod) for the full UX spec.

MVP targets four artifacts:

1. `ETHOS.md` — fund philosophy + voice rules + Confusion Protocol + User Sovereignty
2. `/pod-thesis-hours` — six forcing questions, writes a dated thesis doc
3. `/pod-save-state` — checkpoint mid-research
4. `/pod-resume-state` — pick up where you left off across all theses

After MVP, v1 adds `/pod-bear-case` (adversarial fan-out review),
`/pod-cio-review`, `/pod-risk-officer`, `/pod-pre-trade-check`, `/pod-execute`.

## Why pod

The old hedge fund moat was access. That moat is gone. Every retail
trader has options flow. Every analyst has every 10-Q. The remaining
edge is what you do with the information. How you weigh it, invert it,
stress-test it. How you catch the gap between narrative and fundamentals
before consensus.

A solo PM running pod does what a six-person research team used to do.

| Task | Human team | pod + Claude Code | Compression |
|---|---|---|---|
| Initial thesis writeup | 1 day | 30 min | ~16x |
| 6-specialist bear case | 2 days | 1 hr | ~16x |
| Earnings call digest (10 names) | 6 hrs | 15 min | ~24x |
| Weekly portfolio retro | 2 hrs | 15 min | ~8x |

The compression is not the point. The point is that completeness becomes
cheap. You stop skipping diligence because it was "too much work."

## Install

**Requirements:** [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Git, Bash.

pod installs **project-local**. No global skill pollution. Skills only
fire when you are in your fund workspace.

Step 1 — clone pod once:

```bash
git clone https://github.com/TengHu/pod.git ~/Code/pod
```

Step 2 — open Claude Code from your fund workspace and tell it:

> Install pod by following `~/Code/pod/setup.md`.

Claude reads the procedure, asks any clarifying questions, and creates
project-local symlinks at `.claude/skills/pod-*`. Idempotent. Re-run
the same line any time (after `git pull` in the pod repo, or after pod
adds new skills) to refresh.

Why a markdown procedure instead of a bash script: the AI handles edge
cases (existing install, missing dependencies, custom paths) by asking
you, instead of dying with a stack trace.

To update pod source:

```bash
cd ~/Code/pod && git pull
```

Symlinks pick up changes immediately. No re-install needed unless pod
added new skills (then re-run the install line above).

## Uninstall

From your workspace, tell Claude Code:

> Uninstall pod by following `~/Code/pod/uninstall.md`.

Removes only `.claude/skills/pod-*` from this workspace. Source repo
and `book/` content stay untouched.

## How it works

pod is a process. Skills run in the order a hedge fund sprint runs:

**Brainstorm → Challenge → Risk-check → Execute → Watch → Reflect**

Each skill writes artifacts the next skill reads. `/pod-thesis-hours`
writes a thesis doc. `/pod-bear-case` reads it. `/pod-cio-review` reads
both. Nothing falls through.

All artifacts live in `book/` inside your private workspace repo:

```
book/
├── ETHOS.md                       (your fund philosophy, distilled)
├── library/                       (foundational reading + frameworks)
│   ├── volatility/                (e.g., reflexivity, vol skew as narrative)
│   ├── cycles/                    (e.g., debt cycles, AI capex cycle)
│   ├── value-investing/           (e.g., margin of safety, circle of competence)
│   └── ...                        (add domains as your reading expands)
├── _events/
│   ├── timeline.jsonl             (every skill run, every thesis)
│   ├── learnings.jsonl            (durable lessons across theses)
│   └── eureka.jsonl               (first-principles insights, your alpha)
├── _sessions/                     (ephemeral parallel-session markers, add to .gitignore)
└── theses/
    └── apld-utility-call/
        ├── README.md              (current state, position, status)
        ├── 2026-05-14-thesis.md   (from /pod-thesis-hours)
        ├── 2026-05-25-bear-case.md
        ├── positions.jsonl        (append-only entry/scale/trim/exit)
        └── checkpoints/
            └── 20260514-093000-initial-diligence.md
```

## How to think about theses (the most important convention)

**One thesis = one INTENT, not one ticker.**

A thesis is a *belief about the world that's testable*. If three tickers
share one belief ("miner-to-AI pivot is mispriced across the sector"),
they go in ONE thesis with three positions in `positions.jsonl`. If they
have separate narratives, they go in three separate theses.

The smell test: if you find yourself writing the same paragraph about the
same ticker in two thesis docs, merge them.

**The falsification test for entity type:**

- "What would prove me wrong?" answer is bet-specific (e.g., "APLD's PPA
  reset is canceled") → it's a **thesis**
- Answer is industry-wide (e.g., "AI infra capex falls 30%") → it's a
  **library entry** (`book/library/<domain>/`)
- Single data point with no claim attached → just a position, not worth
  a doc

**Themes are tags, not folders.** Theses tag themes in frontmatter
(`themes: [ai-infra, power]`). Cross-cutting queries are computed via
grep, not stored in a separate folder.

**Position truth comes from Plaid, not from `positions.jsonl`.** The
`positions.jsonl` in each thesis folder is your *reasoning trail* (why
you bought what when). The truth about what you currently own comes from
`mcp__plaid__investments_holdings`. If they disagree, Plaid wins.

See pod's [docs/](docs/) for the full design:

- [docs/architecture.md](docs/architecture.md) — why pod is built this way (closure property, JSONL as logs, append-only history, cohesion mechanisms)
- [docs/data-model.md](docs/data-model.md) — three layers, anti-overlap rules, frontmatter conventions
- [docs/entities.md](docs/entities.md) — complete entity catalog (24 entities across 4 categories) and slug system

## Three principles for the book

Three principles make this work:

1. **Append-only, never overwrite.** Filename `YYYYMMDD-HHMMSS-title.md`
   is canonical order. Stable across rsync. Diffable in git.
2. **Markdown for prose, JSONL for events.** Theses are markdown.
   Positions, learnings, timeline are JSONL. One line per event.
3. **`_events/eureka.jsonl` is your alpha file.** When pod finds a place
   where consensus narrative is wrong, it logs there. Compounds over time.

## Design philosophy

pod ships **mechanisms, not opinions**. The framework is opinion-neutral
about how to invest. Your investment philosophy lives in your own
`book/ETHOS.md` (Buffett value, Druckenmiller macro, Soros reflexivity,
pure quant — pod doesn't care, it just runs your process).

What pod's `ETHOS.md` *does* define is how the tool behaves:

1. **User sovereignty.** Models recommend. You decide. Especially when
   two models agree, that is signal, not mandate.
2. **Voice rules.** Concrete numbers, real ticker names, real catalyst
   dates. No AI hedge-speak. No em dashes.
3. **AskUserQuestion as decision brief.** Every question is structured
   (ELI10, stakes, recommendation, pros/cons, Net line). No vague
   prompts, no vague answers.
4. **Confusion Protocol.** For irreversible-feeling decisions, the skill
   stops, names the ambiguity, and asks.
5. **Append-only history.** Filename-as-canonical-order. No overwrites.
   Diffable in git.
6. **Eureka log.** A cross-thesis insight file the user owns. pod
   writes; the user decides what counts as an insight.


## Privacy

pod is the skill pack. Your `book/` (theses, positions, P&L) is your
private content and stays in your private workspace repo. Nothing in
this open-source repo touches your data.

## Credits

Helper utilities in `bin/` (`pod-paths`, `pod-thesis-list`, `pod-timeline-log`,
`pod-learnings-log`, `pod-eureka-log`) are adapted from
[gstack](https://github.com/garrytan/gstack) (MIT) and simplified for
pod's project-local layout. Architectural patterns — context recovery
preamble, AskUserQuestion as decision brief, append-only filename
ordering, eureka log, completion status — are also inspired by gstack.

pod is not a fork. It is an investment-domain rebuild that aggressively
borrows proven engineering patterns from gstack's coding-domain work.

## Roadmap

Pod is intentionally small at MVP. The "cohesive team feel" — what makes
gstack's skills feel like working with a real team instead of a collection
of files — is built from many small consistencies. We have some;
others are roadmapped.

### Done (MVP)

- ✅ Single workspace convention (`book/`)
- ✅ Context recovery per skill at start (latest doc, latest checkpoint)
- ✅ Append-only filename-as-canonical-order
- ✅ Eureka log structure
- ✅ Same voice rules across all skills (ETHOS §2)
- ✅ AskUserQuestion-only for user input (ETHOS §3)
- ✅ Confusion Protocol statement (ETHOS §4)
- ✅ Parallel-session awareness with re-grounding mode (ETHOS §8)
- ✅ Agent-targeted error style (ETHOS §9)
- ✅ Operational self-improvement / learnings.jsonl write path (ETHOS §10)
- ✅ Skills read timeline + learnings at start (cohesion gap A + C)
- ✅ Contextual next-skill recommendations at end (cohesion gap B)

### Open: cohesion mechanisms (in priority order)

- [ ] **Shared-preamble templating framework** (cohesion gap D). The
  preamble blocks (parallel session counter, context recovery, learnings
  read) are currently duplicated across 3 skills. As pod grows past ~7
  skills or the preamble grows past ~50 lines, hand-maintaining will
  drift. The fix is gstack's static-site-generator pattern:
  `SKILL.md.tmpl` with `{{PLACEHOLDER}}` tokens, `scripts/resolvers/*.ts`
  that emit markdown, a build step (~80 lines of TypeScript) that
  resolves placeholders into committed SKILL.md files, and a CI
  freshness check (`gen-skill-docs --dry-run` + `git diff --exit-code`).
  Trigger to build: when pod has 7+ skills OR the first shared-block
  divergence bug appears.

- [ ] **Cross-model overlap framing** (gstack's #9 cohesion mechanism).
  When a second model reviews the same artifact (e.g., `/pod-codex-thesis`
  reviewing a `/pod-bear-case` output), explicit overlap analysis is
  the value. OVERLAP = high-confidence findings. UNIQUE TO CODEX /
  UNIQUE TO CLAUDE = different blind spots. Trigger to build:
  when a `/pod-codex-thesis` or equivalent second-opinion skill ships.

- [ ] **Auto-decision principles** (gstack's `/autoplan` pattern).
  When `/pod-autoplan` ships (combining `/pod-bear-case` +
  `/pod-cio-review` + `/pod-risk-officer` into one flow), encode 6
  principles that auto-resolve mechanical questions so only taste
  decisions hit the user. Trigger to build: when `/pod-autoplan` lands.

- [ ] **External-reviewer triage with history** (gstack's Greptile
  pattern). When pod consumes signals from third-party reviewers
  (Codex, Plaid eureka triggers, Alpaca alerts), false positives get
  saved to `book/_events/dismissed.jsonl`. Future runs auto-skip known
  FP patterns. Trigger to build: when a skill repeatedly flags
  something the user explicitly dismissed once.

- [ ] **Proactive routing rules**. Tighten the description fields in
  every skill's frontmatter so Claude Code auto-routes user intent to
  the right skill without explicit slash-commands. Pod has this
  partially via skill descriptions; the gap is documented patterns
  for cross-skill chaining (when user says X, pod should run skill Y
  before skill Z). Lives in pod-the-framework, not in user workspaces.

- [ ] **Learnings rotation policy**. `book/_events/learnings.jsonl`
  grows unbounded. Need a policy (e.g., 10MB rotation, 5 generations,
  same as gstack's attempts log) and a `/pod-learn-prune` skill to
  remove stale entries (referenced thesis no longer exists, low-
  confidence aged out). Trigger to build: when the learnings file
  hits ~1MB OR users report stale insights surfacing.

## License

MIT. Free forever. Go find some edge.

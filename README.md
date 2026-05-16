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
├── ETHOS.md                       (your fund philosophy)
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

## License

MIT. Free forever. Go find some edge.

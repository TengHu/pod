---
name: pod-save-state
description: |
  Checkpoint mid-research session. Captures git state, decisions made,
  remaining work, and notes so any future session can pick up via
  /pod-resume-state. Writes to book/theses/$SLUG/checkpoints/.
  STATUS: not implemented yet. See book/_design/2026-05-14-pod-ux-design.md.
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - AskUserQuestion
---

# /pod-save-state — Not implemented

This skill is part of pod's MVP plan but is not yet implemented.

See `book/_design/2026-05-14-pod-ux-design.md` for the full design spec.

When invoked, tell the user:

> pod-save-state is part of the MVP plan but not yet implemented.
> The design spec is in book/_design/2026-05-14-pod-ux-design.md.

Then stop.

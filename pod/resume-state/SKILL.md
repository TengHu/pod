---
name: pod-resume-state
description: |
  Pick up where you left off. Reads the most recent checkpoint across
  ALL theses by default (cross-thesis resume). Pass a thesis slug to
  scope to one thesis. Pass `list` to see the top 20.
  STATUS: not implemented yet. See book/_design/2026-05-14-pod-ux-design.md.
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - AskUserQuestion
---

# /pod-resume-state — Not implemented

This skill is part of pod's MVP plan but is not yet implemented.

See `book/_design/2026-05-14-pod-ux-design.md` for the full design spec.

When invoked, tell the user:

> pod-resume-state is part of the MVP plan but not yet implemented.
> The design spec is in book/_design/2026-05-14-pod-ux-design.md.

Then stop.

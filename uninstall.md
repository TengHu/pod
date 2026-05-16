# pod — uninstall procedure

**For an AI assistant to read and follow.** Removes pod's project-local
skill symlinks from the current workspace. Does NOT delete the pod
source repo. Does NOT touch any `book/` content.

---

## Step 1: Detect what's installed

```bash
ls "$PWD/.claude/skills" 2>/dev/null | grep "^pod-"
```

If output is empty: pod is not installed in this workspace. Tell the
user and stop.

If output lists `pod-*` entries: continue.

---

## Step 2: Confirm with the user

Use AskUserQuestion:

```
D1 — Remove all pod skills from this workspace?
ELI10: Deletes the symlinks in .claude/skills/pod-*. The pod source
       repo at ~/Code/pod is untouched. Your book/ is untouched. You
       can reinstall any time by following setup.md.
Options:
A) Yes, remove pod-* from this workspace
B) Cancel
```

If B, stop. If A, continue to Step 3.

---

## Step 3: Remove

```bash
rm -rf "$PWD"/.claude/skills/pod-*
```

The glob expands to all `pod-*` directories inside
`<workspace>/.claude/skills/`. Symlinks inside them are removed too.
Files outside `.claude/skills/pod-*` are not touched.

---

## Step 4: Verify

```bash
ls "$PWD/.claude/skills" 2>/dev/null | grep "^pod-" || echo "clean"
```

If output is `clean`, removal succeeded.

If output still shows `pod-*` entries: something blocked the removal
(permissions, open files). Report what's left to the user and stop.

---

## Step 5: Report to the user

```
pod removed from this workspace.

Source repo at ~/Code/pod is untouched.
Your book/ content is untouched.

Reinstall: follow ~/Code/pod/setup.md
Delete the source too (irreversible without re-clone):
  rm -rf ~/Code/pod
```

---

## Notes for the AI running this

- This procedure only touches `<workspace>/.claude/skills/pod-*`.
  Never delete files outside this scope, even if asked.
- **When you need user input, use `AskUserQuestion`. Never plain chat
  prompts.** The Step 2 confirmation is mandatory and must be AUQ.
  If AUQ is not available, stop and report `BLOCKED — AskUserQuestion
  unavailable`. Do not auto-delete.
- If the user asks to also remove `~/Code/pod` (the source repo),
  surface it as a separate AskUserQuestion confirmation. Deleting the
  source is irreversible without a fresh `git clone`.
- This procedure does not touch `book/` under any circumstance. That's
  the user's work product.

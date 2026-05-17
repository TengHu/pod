# pod — uninstall procedure

**For an AI assistant to read and follow.** Removes pod's project-local
skill symlinks from a workspace. Does NOT delete the pod source repo.
Does NOT touch any `book/` content.

**When you need user input, use `AskUserQuestion`. Never plain chat
prompts.** If AUQ is not available, stop and report `BLOCKED —
AskUserQuestion unavailable`. Do not auto-delete.

---

## Step 0: Identify the workspace

Default `TARGET_DIR` to the current working directory:

```bash
echo "TARGET_DIR=$PWD"
[ -d "$PWD/.claude/skills" ] && echo "SKILLS_DIR_OK" || echo "SKILLS_DIR_MISSING"
```

If `SKILLS_DIR_MISSING`, no pod skills could possibly be installed here.
Tell the user and stop.

If the user names a different workspace (e.g. "uninstall pod from
~/Code/other-fund"), AUQ to confirm the path before proceeding. Never
guess.

---

## Step 1: Detect what's installed

```bash
ls "$TARGET_DIR/.claude/skills" 2>/dev/null | grep "^pod-"
```

If output is empty: pod is not installed in this workspace. Tell the
user and stop.

If output lists `pod-*` entries: read them out (verbatim list) so the
user sees exactly what would be removed, then continue.

---

## Step 2: Confirm with the user

Use AskUserQuestion. List the entries from Step 1 inside the brief so
the user sees the scope:

```
D1 — Remove pod skills from this workspace?
ELI10: Deletes the symlinks in <TARGET_DIR>/.claude/skills/pod-*.
       The pod source repo at <POD_SRC> is untouched. Your book/
       content is untouched. You can reinstall any time by following
       <POD_SRC>/setup.md.

To be removed:
  pod-thesis-hours
  pod-save-state
  pod-resume-state
  (or whatever Step 1 actually showed)

Options:
A) Yes, remove all pod-* from this workspace
B) Cancel
```

If B, stop. If A, continue.

---

## Step 3: Remove

```bash
rm -rf "$TARGET_DIR"/.claude/skills/pod-*
```

The glob expands to all `pod-*` directories inside the workspace's
skills directory. Symlinks inside them are removed too. Nothing outside
`.claude/skills/pod-*` is touched.

---

## Step 4: Verify

```bash
ls "$TARGET_DIR/.claude/skills" 2>/dev/null | grep "^pod-" || echo "clean"
```

If output is `clean`, removal succeeded.

If output still shows `pod-*` entries: something blocked the removal
(permissions, open files, an entry that is not a symlink). Report what
is left and stop. Do not retry with elevated permissions.

---

## Step 5: Report to the user

```
pod removed from <TARGET_DIR>.

  source repo at <POD_SRC> is untouched.
  book/ content is untouched.

Reinstall:           follow <POD_SRC>/setup.md
Delete source too:   rm -rf <POD_SRC>   (irreversible without re-clone)
```

Substitute real paths.

---

## Notes for the AI running this

- This procedure only touches `<TARGET_DIR>/.claude/skills/pod-*`.
  Never delete files outside this scope, even if asked.
- **AskUserQuestion is mandatory** (Step 0 path confirmation when
  workspace is not `$PWD`, Step 2 removal confirmation). Never plain
  chat prompts. If AUQ is not available, stop and report `BLOCKED —
  AskUserQuestion unavailable`. Do not auto-delete.
- If the user asks to also remove `~/Code/pod` (the source repo),
  surface it as a separate AskUserQuestion confirmation. Deleting the
  source is irreversible without a fresh `git clone`.
- This procedure does not touch `book/` under any circumstance. That's
  the user's work product.

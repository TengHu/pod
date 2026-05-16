# pod — install procedure

**For an AI assistant to read and follow.** Run from inside Claude Code
(or any agent with Bash + Read + AskUserQuestion). Goal: install pod's
skills into the current workspace as project-local symlinks.

After running, every skill in `<pod-src>/pod/*/` is reachable from this
workspace as `/pod-<skill-name>`. Skills only fire in this workspace
(project-local, not global). Source stays single-canonical in the pod
repo; symlinks mean `git pull` in pod updates this install instantly.

---

## Step 0: Gather inputs

Two paths, default to:

- `POD_SRC` = `~/Code/pod`
- `TARGET_DIR` = current working directory

```bash
echo "POD_SRC=$HOME/Code/pod"
echo "TARGET_DIR=$PWD"
[ -d "$HOME/Code/pod/pod" ] && echo "POD_SRC_OK" || echo "POD_SRC_MISSING"
[ -d "$PWD" ] && echo "TARGET_OK" || echo "TARGET_MISSING"
```

If `POD_SRC_MISSING`: tell the user pod is not cloned at `~/Code/pod`.
Suggest: `git clone https://github.com/TengHu/pod.git ~/Code/pod`. Then
ask if they want to use a different `POD_SRC` instead. Stop until
resolved.

If `TARGET_MISSING`: tell the user and stop. Do not guess.

---

## Step 1: Check for existing install

```bash
ls "$PWD/.claude/skills" 2>/dev/null | grep "^pod-" | head -10
```

If output is non-empty, pod is already installed in this workspace.
Ask the user (AskUserQuestion) what they want:

- **A) Refresh symlinks** (recommended after `git pull` in the pod repo, or after pod added new skills)
- **B) Skip — already up to date**
- **C) Reinstall clean** (remove existing pod-* first, then install fresh)

If B, stop here. If A, continue to Step 2. If C, run
`rm -rf "$PWD"/.claude/skills/pod-*` first, then continue.

---

## Step 2: Create the skills directory

```bash
mkdir -p "$PWD/.claude/skills"
```

Idempotent. Safe if the directory already exists.

---

## Step 3: Install each skill as a project-local entry

For each skill in `$POD_SRC/pod/*/`:

1. Compute `<skill_name>` from the directory basename
2. Skip if no `SKILL.md` inside (warn the user)
3. Create real directory: `$PWD/.claude/skills/pod-<skill_name>/`
4. Symlink `SKILL.md` inside it → the canonical SKILL.md in pod's source

One bash loop does the whole thing:

```bash
for skill_dir in "$HOME/Code/pod/pod"/*/; do
  skill_name="$(basename "$skill_dir")"
  if [ ! -f "$skill_dir/SKILL.md" ]; then
    echo "  skip pod-$skill_name (no SKILL.md inside)"
    continue
  fi
  install_dir="$PWD/.claude/skills/pod-$skill_name"
  mkdir -p "$install_dir"
  ln -sf "$skill_dir/SKILL.md" "$install_dir/SKILL.md"
  echo "  ok   pod-$skill_name -> $skill_dir"
done
```

If the user supplied a different `POD_SRC`, substitute it for
`$HOME/Code/pod` in the loop.

Use `ln -sf` (force) so re-running refreshes existing symlinks without
error. Use real directories (not directory symlinks) so Claude Code
discovers each skill at the top level of `.claude/skills/`.

---

## Step 4: Verify

```bash
echo "Installed:"
ls "$PWD/.claude/skills" | grep "^pod-"
echo ""
echo "Sample symlink:"
readlink "$PWD/.claude/skills/pod-thesis-hours/SKILL.md" 2>/dev/null || echo "(no thesis-hours skill)"
```

Confirm one symlink resolves to a file under `$POD_SRC/pod/`.

---

## Step 5: Report to the user

Tell them, in this voice:

```
pod installed.

Available in this project:
  /pod-thesis-hours
  /pod-save-state
  /pod-resume-state
  (plus any other skills in ~/Code/pod/pod/)

Update pod:    cd ~/Code/pod && git pull
               (symlinks pick up changes immediately, no re-install)
Uninstall:     follow ~/Code/pod/uninstall.md
```

---

## Notes for the AI running this

- This procedure is fully idempotent. Re-running after `git pull` or
  after adding new skills is safe.
- Never copy SKILL.md files into the workspace. Symlinks only. The
  whole point is to keep pod single-canonical.
- Never install globally to `~/.claude/skills/`. pod is project-local
  by design (no skill-namespace pollution across projects).
- The `pod-` prefix is mandatory. It prevents collisions if the user
  installs other skill packs alongside.
- Do not prompt the user for things you can detect with Bash. Defaults
  are sane; ask only when something is genuinely missing or ambiguous.

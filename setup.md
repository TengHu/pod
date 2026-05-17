# pod — install procedure

**For an AI assistant to read and follow.** Run from inside Claude Code
(or any agent with Bash + Read + AskUserQuestion). Goal: build pod's
skills from templates, then install them into the current workspace as
project-local symlinks.

After running, every skill in `<pod-src>/pod/*/` is reachable from this
workspace as `/pod-<skill-name>`. Skills only fire in this workspace
(project-local, not global). Source stays single-canonical in the pod
repo; symlinks mean `git pull` + rebuild in pod updates this install
instantly.

**When you need user input, use `AskUserQuestion`. Never plain chat
prompts.** If AUQ is not available, stop and report `BLOCKED —
AskUserQuestion unavailable`.

---

## Step 0: Gather inputs

Detect defaults:

- `POD_SRC` = `~/Code/pod`
- `TARGET_DIR` = current working directory

```bash
echo "POD_SRC=$HOME/Code/pod"
echo "TARGET_DIR=$PWD"
[ -d "$HOME/Code/pod/pod" ] && echo "POD_SRC_OK" || echo "POD_SRC_MISSING"
[ -d "$PWD" ] && echo "TARGET_OK" || echo "TARGET_MISSING"
[ "$PWD" = "$HOME/Code/pod" ] && echo "WARNING_TARGET_IS_POD_SRC"
```

Decisions:

- If `POD_SRC_MISSING`: tell the user pod is not cloned at `~/Code/pod`.
  Offer (AskUserQuestion):
  - A) `git clone https://github.com/TengHu/pod.git ~/Code/pod` for me
  - B) I'll point to a different `POD_SRC` (then AUQ for the path)
  - C) Cancel

- If `TARGET_MISSING`: stop. Do not guess.

- If `WARNING_TARGET_IS_POD_SRC`: the user is sitting in the pod source
  repo. Installing into pod itself is almost never what they want
  (skill names would collide with the source). AUQ:
  - A) Cancel — I'll cd into my fund workspace first (recommended)
  - B) Override and install into pod/.claude/skills/ anyway

---

## Step 1: Check tools

```bash
command -v bun >/dev/null 2>&1 && echo "BUN_OK" || echo "BUN_MISSING"
```

If `BUN_MISSING`, pod's templating build step cannot run. AUQ:

- A) Install bun (`curl -fsSL https://bun.sh/install | bash`) then continue
- B) Skip the build step — use the SKILL.md files already committed in
  the pod repo (works as long as you haven't edited any `.tmpl` since
  the last `git pull`)
- C) Cancel

If A, instruct the user to run the install command, then loop back to
the check. If B, set `SKIP_BUILD=1` for Step 2.

---

## Step 2: Build the skills

If `SKIP_BUILD=1`, skip this step.

Otherwise generate every `SKILL.md` from its `SKILL.md.tmpl` + resolvers:

```bash
cd "$POD_SRC"
bun install --silent 2>/dev/null || bun install
bun run gen:skill-docs
```

The build is idempotent. If the output says `OK: N skills checked, all
up to date`, that's fine — re-running doesn't change committed files.

If the build fails, surface the error and stop. Do not proceed with
stale `.md` files when `.tmpl` files have changed.

---

## Step 3: Check for existing install

```bash
ls "$TARGET_DIR/.claude/skills" 2>/dev/null | grep "^pod-" | head -20
```

If output is non-empty, pod is already installed. AUQ:

- A) Refresh symlinks (recommended after `git pull` in pod, or after pod
  added new skills) — re-runs Step 4 over existing dirs
- B) Reinstall clean — `rm -rf "$TARGET_DIR"/.claude/skills/pod-*` first,
  then re-run Step 4 (use this if symlinks point at a stale `POD_SRC`)
- C) Skip — already up to date
- D) Cancel

If C or D, stop. If B, run the cleanup command, then continue.

---

## Step 4: Install each skill as a project-local entry

For each skill in `$POD_SRC/pod/*/`:

1. Compute `<skill_name>` from the directory basename
2. Skip `node_modules` and any dir without `SKILL.md` inside
3. Create real directory: `$TARGET_DIR/.claude/skills/pod-<skill_name>/`
4. Symlink `SKILL.md` inside it → the canonical SKILL.md in pod's source

```bash
mkdir -p "$TARGET_DIR/.claude/skills"
linked=()
skipped=()
for skill_dir in "$POD_SRC/pod"/*/; do
  skill_name="$(basename "$skill_dir")"
  [ "$skill_name" = "node_modules" ] && continue
  if [ ! -f "$skill_dir/SKILL.md" ]; then
    skipped+=("$skill_name")
    continue
  fi
  install_dir="$TARGET_DIR/.claude/skills/pod-$skill_name"
  [ -L "$install_dir" ] && rm -f "$install_dir"
  mkdir -p "$install_dir"
  [ -e "$install_dir/SKILL.md" ] && rm -f "$install_dir/SKILL.md"
  ln -sf "$skill_dir/SKILL.md" "$install_dir/SKILL.md"
  linked+=("pod-$skill_name")
done
echo "linked: ${linked[*]}"
[ ${#skipped[@]} -gt 0 ] && echo "skipped (no SKILL.md): ${skipped[*]}"
```

Notes:

- Use `ln -sf` so re-running refreshes existing symlinks without error.
- Use real directories (not directory symlinks) so Claude Code discovers
  each skill at the top level of `.claude/skills/`. A directory symlink
  would nest the skill one level down and break the `/pod-<name>` form.
- The `pod-` prefix is mandatory. It prevents collisions if the user
  installs other skill packs alongside pod.

---

## Step 5: Verify

```bash
echo "Installed:"
ls "$TARGET_DIR/.claude/skills" | grep "^pod-"
echo ""
echo "Sample symlink resolves to:"
readlink "$TARGET_DIR/.claude/skills/pod-thesis-hours/SKILL.md" 2>/dev/null \
  || echo "(no thesis-hours skill — expected if upstream removed it)"
```

Confirm at least one symlink resolves to a file under `$POD_SRC/pod/`.
If `readlink` returns a path that does not exist, the symlink is
dangling. Tell the user to re-run with the Reinstall option (Step 3 B).

---

## Step 6: Report to the user

Report in this voice (no AI hedge-speak — concrete, short):

```
pod installed (project-local).

  source:    <POD_SRC>
  workspace: <TARGET_DIR>
  skills:    <TARGET_DIR>/.claude/skills

Available in this project:
  /pod-thesis-hours
  /pod-save-state
  /pod-resume-state
  (plus any other skills under <POD_SRC>/pod/)

Update pod source:
  cd <POD_SRC> && git pull
  then re-run this setup (so templates rebuild)

Uninstall:
  follow <POD_SRC>/uninstall.md
```

Substitute the real paths for `<POD_SRC>` and `<TARGET_DIR>`. Replace
the example skill list with what `ls .claude/skills | grep "^pod-"`
actually shows.

---

## Notes for the AI running this

- This procedure is fully idempotent. Re-running after `git pull` or
  after adding new skills is safe.
- Never copy SKILL.md files into the workspace. Symlinks only. The
  whole point is to keep pod single-canonical.
- Never install globally to `~/.claude/skills/`. pod is project-local
  by design (no skill-namespace pollution across projects).
- The `pod-` prefix is mandatory. Do not offer a flat-name option.
- **AskUserQuestion is mandatory for every user input** (path overrides
  in Step 0, missing-tool fallback in Step 1, existing-install handling
  in Step 3). Never plain chat prompts. If AUQ is not available, stop
  and report `BLOCKED — AskUserQuestion unavailable`.
- Do not prompt the user for things you can detect with Bash. Defaults
  are sane; AUQ only when something is genuinely missing or ambiguous.
- The build step (Step 2) is new — older versions of pod did not
  require it. If you encounter a workspace whose symlinks point at a
  `POD_SRC` without `package.json`, that's the old pre-templating pod.
  Tell the user to `cd $POD_SRC && git pull` first.

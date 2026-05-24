---
name: pod-create-skill
description: |
  Scaffold a new pod skill. Reads every existing skill's SKILL.md.tmpl
  in ~/Code/pod/pod/ first so the new skill matches current conventions
  (frontmatter shape, placeholder usage, step structure, hard rules
  block). Asks the user via AskUserQuestion for slug, description,
  triggers, allowed-tools, and which existing skill to model after.
  Writes pod/<slug>/SKILL.md.tmpl, then runs `bun run gen:skill-docs`
  to produce the final SKILL.md. Does not commit or reinstall.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
triggers:
  - create pod skill
  - new pod skill
  - scaffold skill
  - add skill
  - new skill
---
<!-- AUTO-GENERATED from SKILL.md.tmpl by scripts/gen-skill-docs.ts. Do not edit directly. -->
<!-- Regenerate: bun run gen:skill-docs -->


# /pod-create-skill — scaffold a new pod skill

You are a skill-scaffolding assistant. The user wants to add a new
skill to the pod source tree. Your job: read every existing skill
template, ask the user the minimum needed to fill in the standard
frontmatter, generate a new `SKILL.md.tmpl` matching pod's
conventions, then run the build.

**Hard gate:** This skill writes ONLY into `~/Code/pod/pod/<slug>/`.
It does NOT touch `book/`, does NOT commit, does NOT push, does NOT
reinstall symlinks. Those are the user's calls.

**Voice rules apply** (see `~/Code/pod/ETHOS.md` §2): concrete, no AI
hedge-speak, no em dashes.

**AskUserQuestion is mandatory for every user input** (ETHOS §3). No
plain chat prompts. If AUQ is unavailable, stop and report
`BLOCKED — AskUserQuestion unavailable`.

---

## Step 0: Resolve POD_SRC

```bash
POD_SRC="${POD_SRC:-$HOME/Code/pod}"
echo "POD_SRC=$POD_SRC"
[ -d "$POD_SRC/pod" ] && echo "POD_SRC_OK" || echo "POD_SRC_MISSING"
[ -f "$POD_SRC/scripts/gen-skill-docs.ts" ] && echo "BUILD_SCRIPT_OK" || echo "BUILD_SCRIPT_MISSING"
[ -f "$POD_SRC/package.json" ] && echo "PACKAGE_JSON_OK" || echo "PACKAGE_JSON_MISSING"
```

If any `*_OK` marker is missing, stop and report:

> `BLOCKED — pod source incomplete at $POD_SRC.` Need: `pod/` dir,
> `scripts/gen-skill-docs.ts`, `package.json`. Run
> `cd $POD_SRC && git pull` to refresh, or override the `POD_SRC` env
> var to point at the right path.

---

## Step 1: Context recovery (cohesion preamble)

Load shared context: paths, parallel-session awareness, recent
timeline events for this thesis (if known), any relevant learnings
from prior sessions, and routing-injection state for the workspace
CLAUDE.md.

```bash
eval "$(~/Code/pod/bin/pod-paths)"
POD_WORKSPACE="$(dirname "$POD_BOOK")"

# Parallel session awareness (ETHOS §8)
mkdir -p "$POD_BOOK/_sessions"
touch "$POD_BOOK/_sessions/$PPID"
POD_PARALLEL_SESSIONS=$(find "$POD_BOOK/_sessions" -mmin -120 -type f 2>/dev/null | wc -l | tr -d ' ')
find "$POD_BOOK/_sessions" -mmin +120 -type f -exec rm {} + 2>/dev/null || true
echo "POD_PARALLEL_SESSIONS: $POD_PARALLEL_SESSIONS"

# Recent timeline events (filtered to thesis if THESIS_SLUG is set,
# else cross-thesis tail)
echo "=== RECENT EVENTS ==="
if [ -f "$POD_EVENTS/timeline.jsonl" ]; then
  if [ -n "${THESIS_SLUG:-}" ]; then
    grep "\"thesis\":\"$THESIS_SLUG\"" "$POD_EVENTS/timeline.jsonl" 2>/dev/null | tail -5 \
      | jq -r '"\(.ts[0:10])  \(.skill // "?")  \(.event // "?")"' 2>/dev/null \
      || echo "(none yet)"
  else
    tail -8 "$POD_EVENTS/timeline.jsonl" 2>/dev/null \
      | jq -r '"\(.ts[0:10])  \(.thesis // "—")  \(.skill // "?")  \(.event // "?")"' 2>/dev/null \
      || echo "(none yet)"
  fi
else
  echo "(none yet)"
fi

# Relevant learnings (filtered to thesis OR cross-thesis-general)
echo ""
echo "=== RELEVANT LEARNINGS ==="
if [ -f "$POD_EVENTS/learnings.jsonl" ]; then
  if [ -n "${THESIS_SLUG:-}" ]; then
    jq -r --arg t "$THESIS_SLUG" \
      'select(.thesis == $t or .thesis == "" or .thesis == null) | "[\(.type)] \(.insight)"' \
      "$POD_EVENTS/learnings.jsonl" 2>/dev/null | tail -3 \
      || echo "(none yet)"
  else
    tail -3 "$POD_EVENTS/learnings.jsonl" 2>/dev/null \
      | jq -r '"[\(.type)] \(.insight)" + (if .thesis and (.thesis | length) > 0 then "  (thesis: \(.thesis))" else "" end)' 2>/dev/null \
      || echo "(none yet)"
  fi
else
  echo "(none yet)"
fi

# Routing-injection check (mirrors gstack scripts/resolvers/preamble.ts)
# Looks for "## Pod skill routing" anchor in the workspace's CLAUDE.md
# so users who hand-wrote their own routing rules under a different
# heading are not nagged. Declined state is project-local at
# $POD_BOOK/.pod-routing-declined (gitignore it).
echo ""
HAS_POD_ROUTING="no"
if [ -f "$POD_WORKSPACE/CLAUDE.md" ] && grep -q "## Pod skill routing" "$POD_WORKSPACE/CLAUDE.md" 2>/dev/null; then
  HAS_POD_ROUTING="yes"
fi
ROUTING_DECLINED="no"
[ -f "$POD_BOOK/.pod-routing-declined" ] && ROUTING_DECLINED="yes"
echo "HAS_POD_ROUTING: $HAS_POD_ROUTING"
echo "ROUTING_DECLINED: $ROUTING_DECLINED"
echo "POD_WORKSPACE: $POD_WORKSPACE"
```

**Use this context in your prose throughout the skill.** When recent
events relate to the current work, reference them in your "welcome
back" line. When a relevant learning applies (e.g., a pitfall pattern
to avoid, a per-thesis convention), state it explicitly: *"Prior
learning applies — [insight in one sentence]."*

**If `POD_PARALLEL_SESSIONS >= 3`** (re-grounding mode per ETHOS §8):

- Every AskUserQuestion brief prefixes a thesis-context header line:
  `Thesis: <slug> | Last touched: <date> | Session N of M`
- Status messages prefix with `[<slug>]` for identifiability across windows
- Never reference "earlier in this session" without restating context
- Re-state which file you're about to write before writing

---

### Routing injection (one-time per workspace)

If `HAS_POD_ROUTING` is `no` AND `ROUTING_DECLINED` is `no`,
offer to inject pod's routing rules into the workspace CLAUDE.md.
Use AskUserQuestion:

> D — Add pod skill routing to this workspace's CLAUDE.md?
> ELI10: CLAUDE.md is auto-loaded every session. Adding a small
>        routing table tells Claude to invoke /pod-thesis-hours,
>        /pod-save-state, /pod-resume-state on the right user
>        intents instead of answering directly. One-time addition,
>        about 20 lines. Workspace-specific tools (Plaid, Alpaca,
>        your fund's MCPs) are NOT included — those are yours to
>        add separately.
>
> Options:
> A) Add pod routing to CLAUDE.md (recommended)
> B) No thanks — I'll invoke pod skills manually
> C) I already have routing under a different heading

If **A**:

1. If `$POD_WORKSPACE/CLAUDE.md` does not exist, create it with just
   a one-line header: `# <workspace-name>` (where `<workspace-name>`
   is `$(basename "$POD_WORKSPACE")`).
2. Append exactly this block to the end of CLAUDE.md:

```markdown

## Pod skill routing

When the user's request matches a pod skill, invoke it via the Skill
tool as your first action. Do not answer directly. Pod skills produce
audit trails (timeline, learnings, checkpoints) that ad-hoc answers do
not.

| User intent | Skill |
|---|---|
| "I have an idea" / "let me write up a thesis on X" / "capture this thesis" | `/pod-thesis-hours` |
| "refresh the [slug] thesis" / "update my thinking on X" | `/pod-thesis-hours` (pick existing slug) |
| "save my work" / "checkpoint" / "I'll come back to this" | `/pod-save-state` |
| "resume" / "where was I" / "pick up where I left off" | `/pod-resume-state` |
| "resume work on [slug]" | `/pod-resume-state <slug>` |

Hard rules (pod ETHOS):
- AskUserQuestion is mandatory for every structured user input. Never
  plain chat prompts. If AUQ is unavailable, the skill is BLOCKED.
- Voice: concrete, short, no AI hedge-speak (no "delve", "robust",
  "comprehensive"). Use real numbers, real ticker names, real dates.
- Workspace content (theses, positions, P&L) is yours. pod is the
  mechanism only — opinion-neutral.
```

3. Stage and commit if the workspace is a git repo:

```bash
cd "$POD_WORKSPACE"
git add CLAUDE.md 2>/dev/null && git commit -m "chore: add pod skill routing to CLAUDE.md" 2>/dev/null || true
```

If the workspace is not a git repo, skip the commit step silently.

If **B**:

```bash
touch "$POD_BOOK/.pod-routing-declined"
```

Tell the user: "Got it. You can re-enable by running
`rm $POD_BOOK/.pod-routing-declined` and invoking any pod skill."

If **C**: same as B — touch the declined marker. The user has their
own routing setup; we don't need to keep asking.

This routing-injection block runs at most once per workspace. After
the user picks A, B, or C, every future skill invocation reads
`HAS_POD_ROUTING=yes` or `ROUTING_DECLINED=yes` and skips this
entire section.

---


## Step 2: Survey existing skills

This skill scaffolds from existing skills, not from pre-baked
templates. Read what's there now so the new skill matches current
conventions.

```bash
echo "=== EXISTING SKILLS ==="
for d in "$POD_SRC"/pod/*/; do
  name=$(basename "$d")
  [ "$name" = "create-skill" ] && continue
  tmpl="$d/SKILL.md.tmpl"
  if [ -f "$tmpl" ]; then
    desc=$(awk '/^description: \|/{flag=1; next} flag && /^[a-z-]+:/{flag=0} flag' "$tmpl" \
      | head -3 | tr '\n' ' ' | sed 's/  */ /g;s/^ *//')
    lines=$(wc -l < "$tmpl" | tr -d ' ')
    echo "- $name ($lines lines) : $desc"
  else
    echo "- $name : (no template)"
  fi
done
echo "======================"
```

For each existing skill template, **use the Read tool** (not `cat`)
to load the full content into working memory. You need:

- Frontmatter shape (name, description, allowed-tools, triggers)
- Which placeholders the template uses (PREAMBLE, VOICE_RULES,
  AUQ_FORMAT, HARD_RULES_BASE — pod's resolvers per
  `scripts/resolvers/index.ts`)
- Step structure (numbered `## Step N: <title>` headers)
- Hard rules block at the bottom

The user will pick one of these existing skills as the model for the
new one, or pick "from scratch" for a minimal skeleton.

---

## Step 3: AskUserQuestion — slug for the new skill

```
D0 — Slug for the new skill
ELI10: kebab-case identifier. Folder will be pod/<slug>/, invocation
       will be /pod-<slug> after install. Do NOT include the "pod-"
       prefix — the install procedure adds it as the symlink name.
       Existing skills: <comma-separated list from Step 2>
Options:
A) Type the slug (recommended)
B) Cancel
```

Capture the user's answer, then sanitize:

```bash
RAW="$USER_INPUT"
SLUG=$(printf '%s' "$RAW" | tr '[:upper:]' '[:lower:]' | tr -s ' \t_' '-' \
  | tr -cd 'a-z0-9-' | sed 's/^pod-//' | sed 's/^-*//;s/-*$//' | cut -c1-50)
[ -z "$SLUG" ] && SLUG="new-skill"
NEW_DIR="$POD_SRC/pod/$SLUG"
[ -d "$NEW_DIR" ] && echo "SLUG_TAKEN" || echo "SLUG_OK"
```

If `SLUG_TAKEN`, stop and report:

> `BLOCKED — skill $SLUG already exists at $NEW_DIR.` Pick a different
> slug, or remove the directory manually if you want to start over.

---

## Step 4: AskUserQuestion — one-line description

```
D1 — One-sentence description of what this skill does
ELI10: becomes the `description:` field in the new skill's frontmatter.
       Claude Code reads this to decide when to route a user's request
       to your skill. Be concrete: name the inputs, the action, the
       output. Example for /pod-thesis-hours: "Walk the user through
       forcing questions and write a dated thesis doc."
Options:
A) Type the description (recommended)
B) Cancel
```

Capture verbatim. Light typo fixes only.

---

## Step 5: AskUserQuestion — model skill or from scratch

Build the options from existing skills surveyed in Step 2:

```
D2 — Which existing skill should the new one be modeled after?
ELI10: pod's existing skills are the archetypes. Pick the one whose
       structure most closely matches what you want to build. The
       scaffold copies the step structure and adapts the frontmatter.
       Pick "from scratch" for a minimal skeleton (frontmatter +
       preamble + hard rules, body is TODO).

A) <existing-skill-1> — <one-line gist from its description>
B) <existing-skill-2> — <one-line gist>
C) <existing-skill-3> — <one-line gist>
...
Z) From scratch — minimal skeleton, I'll write the body
```

The options come from Step 2's `EXISTING SKILLS` list, not from a
hardcoded set. If pod adds new skills, they show up here automatically
next time. Recommend the existing skill whose description most closely
matches the user's D1 answer (keyword overlap).

---

## Step 6: AskUserQuestion — triggers

```
D3 — Trigger phrases (comma-separated)
ELI10: natural-language phrases that should route to your skill.
       Pick 3-6. Example for /pod-thesis-hours: "thesis hours,
       capture thesis, new thesis, refresh thesis".
Options:
A) Type the triggers (recommended)
B) Use defaults based on slug ("<slug>", "new <slug>", "run <slug>")
C) Cancel
```

Build YAML list:

```bash
TRIGGERS_YAML=$(printf '%s' "$RAW_TRIGGERS" | tr ',' '\n' \
  | sed 's/^ *//;s/ *$//' | awk 'NF{print "  - " $0}')
```

---

## Step 7: AskUserQuestion — allowed-tools

Default = the allowed-tools list of the model skill picked in Step 5
(read it from the model skill's frontmatter). If "from scratch", use
`Bash, Read, AskUserQuestion`.

```
D4 — Allowed tools for this skill
ELI10: which Claude tools the skill is permitted to invoke. Pod skills
       always include Bash, Read, and AskUserQuestion. Add Write/Edit
       if the skill produces files. Add Grep/Glob if it searches.
       Recommended (from model skill <name>): <comma-separated list>.
Options:
A) Use recommended (from model skill) (recommended)
B) I'll specify a custom list (comma-separated)
C) Cancel
```

If B, validate against the allowed set (`Bash, Read, Write, Edit,
Grep, Glob, AskUserQuestion, WebFetch, WebSearch`). Reject unknown
tool names and re-ask.

Build YAML list the same way as Step 6.

---

## Step 8: Write the new SKILL.md.tmpl

The output file is `$NEW_DIR/SKILL.md.tmpl`. The shape:

```
---
name: pod-<slug>
description: |
  <D1 answer, line-wrapped at 72 chars>
allowed-tools:
<TOOLS_YAML>
triggers:
<TRIGGERS_YAML>
---

# /pod-<slug> — TODO: one-line tagline

<one paragraph stub: name the user-facing purpose. TODO comment for
the user to fill in.>

**Voice rules apply** (see `~/Code/pod/ETHOS.md` §2): ...
**AskUserQuestion is mandatory for every user input** (ETHOS §3): ...

---

## Step 0: <stub appropriate to the model skill>

<copy the model skill's Step 0 verbatim if it's generic (e.g., resolve
THESIS_SLUG via pod-thesis-list + AUQ), or stub it as TODO if the model
skill's Step 0 is too specific to copy>

---

{{ PREAMBLE }}

## Step 2-N: <one section per step in the model skill>

For each numbered Step in the model skill, emit a corresponding stub:
- Keep the section heading (`## Step N: <title>`)
- Replace the body with a TODO comment naming what this step should do,
  inspired by the model skill but specific to the new skill
- Preserve any `{{ RESOLVER }}` placeholders (PREAMBLE, VOICE_RULES,
  AUQ_FORMAT, HARD_RULES_BASE) from the model skill — they're the
  cohesion mechanism

---

## Hard rules

{{ HARD_RULES_BASE }}
- TODO: add any skill-specific hard rules below this line.
```

**Important:** the literal `{{ }}` placeholder names in the body above
must be written WITHOUT spaces inside the braces in the actual output
file (i.e., the no-space brace form). pod's regex in
`scripts/gen-skill-docs.ts` matches `{{` immediately followed by a
word char. Any `{{ NAME }}` form (with internal spaces) is inert and
safe to use in prose; the no-space form is what gets resolved.

Use the Write tool to create `$NEW_DIR/SKILL.md.tmpl`. Build the
content in working memory by combining:

1. Frontmatter (name, description, allowed-tools, triggers) from
   user inputs in Steps 3-7
2. Body skeleton derived from the model skill picked in Step 5:
   - If "from scratch": minimal skeleton (frontmatter + `{{ PREAMBLE }}`
     + one TODO step + `{{ HARD_RULES_BASE }}`) — written WITHOUT the
     internal spaces in the actual output file so they resolve at build
     time
   - Otherwise: walk the model skill's steps, copy section headings,
     replace bodies with TODO stubs that reference the model

After writing, verify the file is non-empty and parses as valid
markdown by reading it back. If the frontmatter is malformed (missing
closing `---`), BLOCK and report.

---

## Step 9: Run the build

```bash
cd "$POD_SRC"
if [ ! -d node_modules ]; then
  bun install --silent 2>&1 | tail -10
fi
bun run gen:skill-docs 2>&1 | tail -20
BUILD_STATUS=$?
echo "BUILD_STATUS=$BUILD_STATUS"
[ -f "$NEW_DIR/SKILL.md" ] && echo "SKILL_MD_OK" || echo "SKILL_MD_MISSING"
```

If `BUILD_STATUS != 0`, surface the output and stop:

> `BLOCKED — bun run gen:skill-docs failed.` Most common causes:
> (1) unresolved placeholder in the new template (typo in a
> `{{ NAME }}`-style token); (2) placeholder name not registered in
> `scripts/resolvers/index.ts`; (3) malformed YAML frontmatter.
> Fix `$NEW_DIR/SKILL.md.tmpl`, then re-run `bun run gen:skill-docs`
> manually. To start clean: `rm -rf $NEW_DIR`, then re-invoke
> `/pod-create-skill`.

If `SKILL_MD_MISSING`, the build ran but didn't produce output:

> Build claimed success but `$NEW_DIR/SKILL.md` wasn't created.
> Check `scripts/discover-skills.ts` — it walks one level under
> `pod/`. Confirm `$NEW_DIR/SKILL.md.tmpl` exists at exactly that path.

---

## Step 10: Append to the timeline

```bash
~/Code/pod/bin/pod-timeline-log "$(jq -n \
  --arg slug "$SLUG" \
  --arg model "$MODEL_SKILL" \
  --arg file "$NEW_DIR/SKILL.md.tmpl" \
  '{skill:"pod-create-skill", thesis:"", event:"created", new_skill:$slug, model_skill:$model, file:$file}')"
```

`thesis` is empty since the new skill is not thesis-scoped. `model_skill`
records which existing skill the user picked as the model (or
"from-scratch").

---

## Step 11: Reflect and log learnings (ETHOS §10)

Log only if substantive. Examples worth logging:

- User picked "from scratch" and described a recurring need that doesn't
  fit any existing skill — that's a hint about a gap in pod's
  archetype coverage
- Build failed for a reason that suggests a missing resolver or a
  template-system bug worth recording for the next maintainer

Skip routine successful scaffolds.

---

## Step 12: Report and stop

```
SKILL SCAFFOLDED
Slug:       <slug>
Model:      <model-skill-name or "from-scratch">
Template:   ~/Code/pod/pod/<slug>/SKILL.md.tmpl
Generated:  ~/Code/pod/pod/<slug>/SKILL.md
Triggers:   <comma-separated list>

Next steps (not auto-run):
1. Edit ~/Code/pod/pod/<slug>/SKILL.md.tmpl — fill in the TODO stubs
2. Rebuild:   cd ~/Code/pod && bun run gen:skill-docs
3. Commit:    cd ~/Code/pod && git add pod/<slug>/ && git commit
4. Reinstall: from your workspace, tell Claude
              "Install pod by following ~/Code/pod/setup.md"
              The setup procedure picks up new skills and creates the
              symlink at .claude/skills/pod-<slug>/SKILL.md.
```

Stop. Do not edit the new template's body. Do not run git. Do not
modify the workspace's symlinks.

---

## Hard rules

- **Never ask for user input via plain chat.** Use `AskUserQuestion`
  for every choice, every disambiguation, every confirmation. If AUQ
  is not available, the skill is BLOCKED. Stop and report. Do not fall
  back to inline prompts. (ETHOS §3)
- **Voice rules apply** to your own prose: no em dashes, no AI
  hedge-speak, concrete numbers and file paths. The user's verbatim
  input is their voice, not yours. (ETHOS §2)
- **Error messages are for AI agents.** Every error tells the next
  concrete action — what failed precisely, what valid options exist,
  what to run next. No raw exception text or "file not found" bare
  errors. (ETHOS §9)
- **Re-ground when parallel** (`POD_PARALLEL_SESSIONS >= 3`): prefix
  every AUQ brief with `Thesis: <slug>` (or `[<slug>]` for status
  messages). The user is juggling windows. (ETHOS §8)
- **Never overwrite existing files.** Filename is canonical sort
  order. Collision suffix on same-timestamp saves. (ETHOS §5)

- **Never overwrite an existing skill folder.** If `pod/<slug>/`
  exists, BLOCK with a clear "delete it manually first" message.
- **Never run `git` commands.** This skill writes files and runs the
  build. Commit + push + reinstall are the user's responsibility.
- **Never reinstall symlinks** in the user's workspace. The user
  reruns `setup.md` when they want to pick up the new skill.
- **Never edit existing skills.** This skill scaffolds new ones only.
- **Always run the build** at the end (Step 9). A scaffold without a
  generated `SKILL.md` is half-done. If the build fails, BLOCK.
- **Read existing skills at runtime, not from pre-baked archetypes.**
  pod's existing skills ARE the archetypes. Adding new skills to pod
  automatically expands the menu of model options. No separate
  archetype directory to maintain.

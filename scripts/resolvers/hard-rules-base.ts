/**
 * {{HARD_RULES_BASE}} — universal hard rules every pod skill should
 * have at the bottom of its body.
 *
 * Skills can add their own skill-specific hard rules AFTER the
 * placeholder; this resolver emits only the universal ones.
 */

import type { Resolver } from './types';

export const hardRulesBase: Resolver = () => `- **Never ask for user input via plain chat.** Use \`AskUserQuestion\`
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
- **Re-ground when parallel** (\`POD_PARALLEL_SESSIONS >= 3\`): prefix
  every AUQ brief with \`Thesis: <slug>\` (or \`[<slug>]\` for status
  messages). The user is juggling windows. (ETHOS §8)
- **Never overwrite existing files.** Filename is canonical sort
  order. Collision suffix on same-timestamp saves. (ETHOS §5)
`;

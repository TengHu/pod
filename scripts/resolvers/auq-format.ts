/**
 * {{AUQ_FORMAT}} — the AskUserQuestion decision-brief format from ETHOS §3.
 *
 * Inlined into every skill so the format is in context when AUQ is
 * called.
 */

import type { Resolver } from './types';

export const auqFormat: Resolver = () => `## AskUserQuestion format (ETHOS §3)

**Hard rule: any time a skill needs information from the user, it uses
AskUserQuestion. No exceptions.** No plain chat prompts. If AUQ is
unavailable, the skill is BLOCKED — stop and report
\`BLOCKED — AskUserQuestion unavailable\`.

This applies to:

- Decisions (which thesis, which mode, refresh or update, log or skip)
- Disambiguation (multiple existing slugs, multiple candidate files)
- Confirmations (destructive actions, irreversible writes)
- Free-form prose input (use AUQ with "type your answer" option)

### Decision brief format

\`\`\`
D<N> — <one-line question>
Thesis: <slug> (if applicable)
ELI10: <plain English, 2-4 sentences, name the stakes>
Stakes if we pick wrong: <one sentence on what breaks, what's lost>
Recommendation: <choice> because <one-line reason>
Effort: A=(manual: 6 hrs / pod: 15 min), B=(manual: 30 min / pod: 2 min)
Pros / cons:
A) <option> (recommended)
  ✅ <pro, concrete, ≥40 chars>
  ❌ <con, honest, ≥40 chars>
B) <option>
  ✅ <pro>
  ❌ <con>
Net: <one-line synthesis of the tradeoff>
\`\`\`

No forced numeric scores (no 0-10 conviction, no R:R asymmetry).
Judgment lives in prose in thesis docs and in the user's free-form
answer to AUQ.

For pure prose capture (e.g., "write out the thesis in one sentence"),
use AskUserQuestion with a "type your answer" option and a "skip" option.
Never just inline-prompt and wait for chat reply.
`;

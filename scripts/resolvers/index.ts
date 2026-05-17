/**
 * Resolver registry — maps placeholder names to resolver functions.
 *
 * To add a new resolver:
 * 1. Create a new file under scripts/resolvers/ exporting one function
 *    matching the Resolver signature in types.ts.
 * 2. Import and register it in this file.
 * 3. Use `{{YOUR_PLACEHOLDER}}` in any SKILL.md.tmpl.
 * 4. Run `bun run gen:skill-docs` to regenerate.
 */

import type { Resolver } from './types';
import { preamble } from './preamble';
import { voiceRules } from './voice-rules';
import { auqFormat } from './auq-format';
import { hardRulesBase } from './hard-rules-base';

export const RESOLVERS: Record<string, Resolver> = {
  PREAMBLE: preamble,
  VOICE_RULES: voiceRules,
  AUQ_FORMAT: auqFormat,
  HARD_RULES_BASE: hardRulesBase,
};

/**
 * Discovers SKILL.md.tmpl files under pod/.
 *
 * Each skill lives in pod/<skill-name>/. A skill has a template if and
 * only if pod/<skill-name>/SKILL.md.tmpl exists. The discovery walks
 * one level of subdirectories — skills are not nested.
 */

import { readdirSync, statSync } from 'fs';
import { join } from 'path';

export interface SkillTemplate {
  /** Skill folder name, e.g. "thesis-hours" */
  skillName: string;
  /** Absolute path to SKILL.md.tmpl */
  tmpl: string;
  /** Absolute path to the generated SKILL.md output */
  output: string;
}

export function discoverTemplates(podRoot: string): SkillTemplate[] {
  const skillsDir = join(podRoot, 'pod');
  const results: SkillTemplate[] = [];

  let entries: string[];
  try {
    entries = readdirSync(skillsDir);
  } catch {
    return results;
  }

  for (const entry of entries.sort()) {
    const skillDir = join(skillsDir, entry);
    try {
      if (!statSync(skillDir).isDirectory()) continue;
    } catch {
      continue;
    }
    const tmplPath = join(skillDir, 'SKILL.md.tmpl');
    try {
      if (statSync(tmplPath).isFile()) {
        results.push({
          skillName: entry,
          tmpl: tmplPath,
          output: join(skillDir, 'SKILL.md'),
        });
      }
    } catch {
      // No template in this directory, skip
    }
  }

  return results;
}

#!/usr/bin/env bun
/**
 * pod skill build pipeline.
 *
 * Reads SKILL.md.tmpl files, resolves {{PLACEHOLDERS}} via the resolver
 * registry, writes generated SKILL.md files. Idempotent.
 *
 * Usage:
 *   bun run scripts/gen-skill-docs.ts             # build, write changes
 *   bun run scripts/gen-skill-docs.ts --dry-run   # CI check, exit 1 if drift
 *
 * Placeholder syntax: {{NAME}} or {{NAME:arg1:arg2}}
 *
 * Pattern stolen verbatim from gstack/scripts/gen-skill-docs.ts (MIT).
 * Pod's version is intentionally simpler: no host abstraction, no
 * multi-target rendering, no template inheritance.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

import { discoverTemplates } from './discover-skills';
import { RESOLVERS } from './resolvers';
import type { TemplateContext } from './resolvers/types';

const POD_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER_RE = /\{\{(\w+(?::[^}]+)?)\}\}/g;
const GENERATED_HEADER =
  '<!-- AUTO-GENERATED from SKILL.md.tmpl by scripts/gen-skill-docs.ts. Do not edit directly. -->\n<!-- Regenerate: bun run gen:skill-docs -->\n';
const DRY_RUN = process.argv.includes('--dry-run');

function render(tmplPath: string, skillName: string): string {
  const content = readFileSync(tmplPath, 'utf-8');
  const ctx: TemplateContext = { skillName, podRoot: POD_ROOT };

  const rendered = content.replace(PLACEHOLDER_RE, (_match, fullKey: string) => {
    const parts = fullKey.split(':');
    const name = parts[0];
    const args = parts.slice(1);
    const resolver = RESOLVERS[name];
    if (!resolver) {
      throw new Error(
        `Unknown placeholder {{${name}}} in ${relative(POD_ROOT, tmplPath)}. ` +
          `Known: ${Object.keys(RESOLVERS).join(', ')}.`,
      );
    }
    return args.length > 0 ? resolver(ctx, args) : resolver(ctx);
  });

  // Catch any unresolved placeholders (e.g., typos)
  const remaining = rendered.match(PLACEHOLDER_RE);
  if (remaining) {
    throw new Error(
      `Unresolved placeholders in ${relative(POD_ROOT, tmplPath)}: ${remaining.join(', ')}`,
    );
  }

  return injectHeader(rendered);
}

/**
 * Insert the AUTO-GENERATED warning after the closing --- of frontmatter,
 * or at the top of the file if there's no frontmatter.
 */
function injectHeader(content: string): string {
  if (content.startsWith('---\n')) {
    const fmEnd = content.indexOf('\n---', 4);
    if (fmEnd !== -1) {
      const insertAt = fmEnd + 4; // after the closing ---
      return content.slice(0, insertAt) + '\n' + GENERATED_HEADER + content.slice(insertAt);
    }
  }
  return GENERATED_HEADER + content;
}

function main(): void {
  const templates = discoverTemplates(POD_ROOT);
  if (templates.length === 0) {
    console.error('No SKILL.md.tmpl files found under pod/. Nothing to build.');
    process.exit(0);
  }

  const drift: string[] = [];
  let unchanged = 0;
  let updated = 0;
  let created = 0;

  for (const { skillName, tmpl, output } of templates) {
    let newContent: string;
    try {
      newContent = render(tmpl, skillName);
    } catch (err) {
      console.error(`ERROR rendering ${relative(POD_ROOT, tmpl)}:`);
      console.error(`  ${(err as Error).message}`);
      process.exit(1);
    }

    const outRel = relative(POD_ROOT, output);

    if (existsSync(output)) {
      const oldContent = readFileSync(output, 'utf-8');
      if (oldContent === newContent) {
        unchanged++;
        continue;
      }
      drift.push(outRel);
      if (!DRY_RUN) {
        writeFileSync(output, newContent);
        console.log(`  updated ${outRel}`);
        updated++;
      }
    } else {
      drift.push(outRel);
      if (!DRY_RUN) {
        writeFileSync(output, newContent);
        console.log(`  created ${outRel}`);
        created++;
      }
    }
  }

  if (DRY_RUN) {
    if (drift.length > 0) {
      console.error(`\nFAIL: ${drift.length} SKILL.md file(s) out of sync with templates:`);
      for (const d of drift) console.error(`  ${d}`);
      console.error('\nRun: bun run gen:skill-docs');
      process.exit(1);
    }
    console.log(`OK: ${templates.length} skills checked, all up to date.`);
    return;
  }

  console.log(
    `\nOK: ${templates.length} skills processed (${unchanged} unchanged, ${updated} updated, ${created} created).`,
  );
}

main();

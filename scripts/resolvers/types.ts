/**
 * Resolver context and signature shared across all resolvers.
 */

export interface TemplateContext {
  /** The skill's directory name under pod/ (e.g., "thesis-hours") */
  skillName: string;
  /** Absolute path to the pod repo root */
  podRoot: string;
}

export type Resolver = (ctx: TemplateContext, args?: string[]) => string;

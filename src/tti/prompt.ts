import { prisma } from '../db';

/**
 * Image styles for generation. A style is a prompt template with a {subject}
 * placeholder; the doll body's `appearance` (+ optional extras) becomes the
 * subject. Templates carry composition directives — head and shoulders
 * centered, eyes at the vertical center — so center-cropped square thumbnails
 * keep the face. Styles live in the TtiStyle table (admin-curated); the env
 * template is only the fallback when no style exists yet.
 */
const DEFAULT_TEMPLATE = process.env.TTI_STYLE_TEMPLATE
  ?? 'portrait of {subject}, head and shoulders centered in frame, eyes at the vertical center of the image, soft dreamy glow, delicate bokeh lights, gentle expression, high detail, sharp focus';

export interface ResolvedStyle {
  id: string | null;
  template: string;
  width: number;
  height: number;
}

/**
 * Resolve the style to generate with: the given style id (a doll body's or an
 * explicit request), else the recommended published style, else the first
 * published style, else the env-default template.
 */
export async function resolveStyle(ttiStyleId?: string | null): Promise<ResolvedStyle> {
  if (ttiStyleId) {
    const style = await prisma.ttiStyle.findUnique({ where: { id: ttiStyleId } });
    if (style) return { id: style.id, template: style.template, width: style.width, height: style.height };
  }
  const fallback = await prisma.ttiStyle.findFirst({ where: { published: true, recommended: true }, orderBy: { createdAt: 'asc' } })
    ?? await prisma.ttiStyle.findFirst({ where: { published: true }, orderBy: { createdAt: 'asc' } });
  if (fallback) return { id: fallback.id, template: fallback.template, width: fallback.width, height: fallback.height };
  return { id: null, template: DEFAULT_TEMPLATE, width: 832, height: 1216 };
}

/**
 * Fill every {placeholder} in one pass, the way chats/systemPrompt.ts does.
 *
 * Two reasons it can't be a chain of `template.replace('{x}', value)`:
 * substituted text is user-authored, so a `{scene}` inside an appearance would
 * swallow the template's own {scene} slot on the next call; and String.replace
 * expands `$&`/`$'` in a *string* replacement, letting that same text splice
 * arbitrary parts of the template into the prompt. A function replacement over
 * a single regex pass fixes both — and, being global, fills a placeholder that
 * an admin used more than once in a style template.
 */
function format(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
}

export function buildPrompt(template: string, appearance: string, extra?: string): string {
  const subject = extra ? `${appearance}, ${extra}` : appearance;
  return format(template, { subject });
}

/** Group-portrait subject from the members' appearances. */
export function groupSubject(appearances: string[]): string {
  return appearances.length === 1
    ? appearances[0]
    : `a group of ${appearances.length} companions together: ` + appearances.map((a, i) => `(${i + 1}) ${a}`).join('; ');
}

/**
 * Scene template for scenario pictures — an establishing shot of the setting,
 * no people (the character's look lives on the avatar). {scene} is the visual
 * description distilled from the scenario by its own chat model.
 */
const SCENE_TEMPLATE = process.env.TTI_SCENE_TEMPLATE
  ?? 'cinematic establishing shot of {scene}, wide angle, atmospheric lighting, rich detailed environment, depth of field, no people, no text';

export function buildScenePrompt(scene: string): string {
  return format(SCENE_TEMPLATE, { scene });
}

/**
 * Scenario picture WITH its character — used when a scenario has exactly one
 * avatar. {subject} is the avatar appearance, placed in the derived {scene}.
 */
const SCENE_CHARACTER_TEMPLATE = process.env.TTI_SCENE_CHARACTER_TEMPLATE
  ?? 'cinematic environmental portrait of {subject}, in {scene}, natural pose, atmospheric lighting, detailed background, depth of field, sharp focus, no text';

export function buildSceneWithCharacter(scene: string, appearance: string): string {
  return format(SCENE_CHARACTER_TEMPLATE, { subject: appearance, scene });
}

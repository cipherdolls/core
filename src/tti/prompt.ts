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

export function buildPrompt(template: string, appearance: string, extra?: string): string {
  const subject = extra ? `${appearance}, ${extra}` : appearance;
  return template.replace('{subject}', subject);
}

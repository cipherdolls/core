/**
 * House style prompt for image generation. The doll body's `appearance`
 * anchors the subject; an optional extra prompt adds scene/pose/outfit.
 */
const STYLE_TEMPLATE = process.env.TTI_STYLE_TEMPLATE
  ?? 'portrait of {subject}, soft dreamy glow, delicate bokeh lights, gentle expression, high detail, sharp focus';

export function buildPrompt(appearance: string, extra?: string): string {
  const subject = extra ? `${appearance}, ${extra}` : appearance;
  return STYLE_TEMPLATE.replace('{subject}', subject);
}

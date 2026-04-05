export type MdNode =
  | { heading: string; level?: 1 | 2 | 3 | 4; body?: MdNode[] }
  | { text: string }
  | { list: string[] }
  | { json: unknown; label?: string }
  | { rule: true }
  | false
  | null
  | undefined;

type MdVars = Record<string, string>;

function interpolate(text: string, vars: MdVars): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function render(nodes: MdNode[], vars: MdVars): string {
  const lines: string[] = [];

  for (const node of nodes) {
    if (!node) continue;

    if ('heading' in node) {
      const prefix = '#'.repeat(node.level ?? 3);
      lines.push(`${prefix} ${interpolate(node.heading, vars)}`);
      if (node.body) lines.push(render(node.body, vars));
    } else if ('text' in node) {
      lines.push(interpolate(node.text, vars));
    } else if ('list' in node) {
      lines.push(node.list.map((item) => `- ${interpolate(item, vars)}`).join('\n'));
    } else if ('json' in node) {
      if (node.label) lines.push(interpolate(node.label, vars));
      lines.push(JSON.stringify(node.json, null, 2));
    } else if ('rule' in node) {
      lines.push('---');
    }
  }

  return lines.join('\n\n');
}

export function md(nodes: MdNode[], vars: MdVars = {}): string {
  return render(nodes, vars);
}

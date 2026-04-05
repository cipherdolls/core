type MdNode =
  | { heading: string; level?: 1 | 2 | 3 | 4; body?: MdNode[] }
  | { text: string }
  | { list: string[] }
  | { json: unknown; label?: string }
  | { rule: true }
  | false
  | null
  | undefined;

export function md(nodes: MdNode[]): string {
  const lines: string[] = [];

  for (const node of nodes) {
    if (!node) continue;

    if ('heading' in node) {
      const prefix = '#'.repeat(node.level ?? 3);
      lines.push(`${prefix} ${node.heading}`);
      if (node.body) lines.push(md(node.body));
    } else if ('text' in node) {
      lines.push(node.text);
    } else if ('list' in node) {
      lines.push(node.list.map((item) => `- ${item}`).join('\n'));
    } else if ('json' in node) {
      if (node.label) lines.push(node.label);
      lines.push(JSON.stringify(node.json, null, 2));
    } else if ('rule' in node) {
      lines.push('---');
    }
  }

  return lines.join('\n\n');
}

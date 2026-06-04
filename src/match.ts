export function matchSlashCommand(text: string, names: string[]): { name: string; args: string } | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return undefined;
  const match = trimmed.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return undefined;
  const name = match[1];
  if (!names.includes(name)) return undefined;
  return { name, args: match[2] ?? "" };
}

export function fenced(text: string): string {
  return `\`\`\`\n${text.replace(/```/g, "`​``")}\n\`\`\``;
}

export function tokenize(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (quote) throw new Error("unterminated quote in command arguments");
  if (current) tokens.push(current);
  return tokens;
}

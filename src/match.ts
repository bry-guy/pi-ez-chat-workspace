export { matchSlashCommand, normalizeRemoteCommandText, stripLeadingMention, stripTrailingMention, stripTranscriptPrefix, type CommandMatch } from "pi-ez-lib";

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

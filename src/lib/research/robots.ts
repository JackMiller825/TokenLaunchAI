type Rule = { kind: "allow" | "disallow"; path: string };

export function robotsAllows(robotsTxt: string | null | undefined, path: string, userAgent = "TokenLaunchAIResearch") {
  if (!robotsTxt) return true;
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [name, ...rest] = line.split(":");
    const key = name.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && current) {
      current.rules.push({ kind: key, path: value });
    }
  }
  const ua = userAgent.toLowerCase();
  const specific = groups.filter((group) => group.agents.some((agent) => agent !== "*" && ua.includes(agent)));
  const star = groups.filter((group) => group.agents.includes("*"));
  const chosen = specific.length ? specific : star;
  let winner: { kind: "allow" | "disallow"; length: number } | null = null;
  for (const group of chosen) {
    for (const rule of group.rules) {
      if (!rule.path) continue;
      if (path.startsWith(rule.path) && (!winner || rule.path.length > winner.length)) {
        winner = { kind: rule.kind, length: rule.path.length };
      }
    }
  }
  return !winner || winner.kind === "allow";
}

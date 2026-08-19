import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const agentDir = join(homedir(), ".pi/agent");
const packageDir = dirname(fileURLToPath(import.meta.url));
const configPath = join(agentDir, "codex-profiles.json");
const tokenScript = join(packageDir, "../scripts/openai-codex-token-from-codex-auth.mjs");

type Profile = { name: string; path: string };

const defaults: Profile[] = [];

const cost = (input: number, output: number, cacheRead: number, cacheWrite = 0, tiers?: Array<Record<string, number>>) =>
  tiers ? { input, output, cacheRead, cacheWrite, tiers } : { input, output, cacheRead, cacheWrite };

function models(profile: string): any[] {
  return [
    { id: "gpt-5.3-codex-spark", name: `GPT-5.3 Codex Spark (${profile})`, reasoning: true, input: ["text"], cost: cost(1.75, 14, 0.175), contextWindow: 128000, maxTokens: 128000, thinkingLevelMap: { xhigh: "xhigh", minimal: "low" }, compat: { supportsOpenAIGrammarTools: true } },
    { id: "gpt-5.4", name: `GPT-5.4 (${profile})`, reasoning: true, input: ["text", "image"], cost: cost(2.5, 15, 0.25, 0, [{ inputTokensAbove: 272000, input: 5, output: 22.5, cacheRead: 0.5, cacheWrite: 0 }]), contextWindow: 272000, maxTokens: 128000, thinkingLevelMap: { xhigh: "xhigh", minimal: "low" }, compat: { supportsOpenAIGrammarTools: true, supportsToolSearch: true } },
    { id: "gpt-5.4-mini", name: `GPT-5.4 mini (${profile})`, reasoning: true, input: ["text", "image"], cost: cost(0.75, 4.5, 0.075), contextWindow: 272000, maxTokens: 128000, thinkingLevelMap: { xhigh: "xhigh", minimal: "low" }, compat: { supportsOpenAIGrammarTools: true, supportsToolSearch: true } },
    { id: "gpt-5.5", name: `GPT-5.5 (${profile})`, reasoning: true, input: ["text", "image"], cost: cost(5, 30, 0.5, 0, [{ inputTokensAbove: 272000, input: 10, output: 45, cacheRead: 1, cacheWrite: 0 }]), contextWindow: 272000, maxTokens: 128000, thinkingLevelMap: { xhigh: "xhigh", minimal: "low" }, compat: { supportsOpenAIGrammarTools: true, supportsToolSearch: true } },
    { id: "gpt-5.6-luna", name: `GPT-5.6 Luna (${profile})`, reasoning: true, input: ["text", "image"], cost: cost(0.2, 1.2, 0.02, 0.25, [{ inputTokensAbove: 272000, input: 0.4, output: 1.8, cacheRead: 0.04, cacheWrite: 0.5 }]), contextWindow: 272000, maxTokens: 128000, thinkingLevelMap: { xhigh: "xhigh", max: "max", minimal: "low" }, compat: { supportsOpenAIGrammarTools: true, supportsAdditionalTools: true, supportsToolSearch: true } },
    { id: "gpt-5.6-sol", name: `GPT-5.6 Sol (${profile})`, reasoning: true, input: ["text", "image"], cost: cost(5, 30, 0.5, 6.25, [{ inputTokensAbove: 272000, input: 10, output: 45, cacheRead: 1, cacheWrite: 12.5 }]), contextWindow: 272000, maxTokens: 128000, thinkingLevelMap: { xhigh: "xhigh", max: "max", minimal: "low" }, compat: { supportsOpenAIGrammarTools: true, supportsAdditionalTools: true, supportsToolSearch: true } },
    { id: "gpt-5.6-terra", name: `GPT-5.6 Terra (${profile})`, reasoning: true, input: ["text", "image"], cost: cost(2, 12, 0.2, 2.5, [{ inputTokensAbove: 272000, input: 4, output: 18, cacheRead: 0.4, cacheWrite: 5 }]), contextWindow: 272000, maxTokens: 128000, thinkingLevelMap: { xhigh: "xhigh", max: "max", minimal: "low" }, compat: { supportsOpenAIGrammarTools: true, supportsAdditionalTools: true, supportsToolSearch: true } },
  ];
}

function expandPath(path: string): string {
  return resolve(path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);
}

function readProfiles(): Profile[] {
  if (!existsSync(configPath)) {
    writeFileSync(configPath, `${JSON.stringify(defaults, null, 2)}\n`, { mode: 0o600 });
    return defaults;
  }
  try {
    const value = JSON.parse(readFileSync(configPath, "utf8"));
    return Array.isArray(value) ? value : defaults;
  } catch {
    return defaults;
  }
}

function saveProfiles(profiles: Profile[]) {
  writeFileSync(configPath, `${JSON.stringify(profiles, null, 2)}\n`, { mode: 0o600 });
}

function registerProfile(pi: ExtensionAPI, profile: Profile) {
  const authPath = expandPath(profile.path).endsWith(".json")
    ? expandPath(profile.path)
    : join(expandPath(profile.path), "auth.json");
  pi.registerProvider(profile.name, {
    name: `${profile.name} (${dirname(authPath)})`,
    baseUrl: "https://chatgpt.com/backend-api",
    apiKey: `!env CODEX_AUTH_JSON=${JSON.stringify(authPath)} node ${JSON.stringify(tokenScript)}`,
    api: "openai-codex-responses",
    models: models(profile.name),
  });
}

export default function (pi: ExtensionAPI) {
  const profiles = readProfiles();
  for (const profile of profiles) registerProfile(pi, profile);

  pi.registerCommand("codex-profile", {
    description: "Add or update a Codex profile: /codex-profile [name] [auth directory]",},{},{
    handler: async (args, ctx) => {
      let name: string | undefined;
      let path: string | undefined;
      const parts = args.trim().split(/\s+/);
      if (args.trim()) {
        name = parts.shift();
        path = parts.join(" ");
      }
      name ||= (await ctx.ui.input("Profile name", "e.g. codex_work"))?.trim();
      path ||= (await ctx.ui.input("Codex auth directory or auth.json path", "e.g. ~/.codex_work"))?.trim();
      if (!name || !path) return;
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        ctx.ui.notify("Tên profile chỉ được gồm chữ, số, _ hoặc -", "error");
        return;
      }

      const next = { name, path };
      const all = readProfiles();
      const index = all.findIndex((profile) => profile.name === name);
      if (index >= 0) {
        if (!(await ctx.ui.confirm("Profile đã tồn tại", `Ghi đè ${name}?`))) return;
        all[index] = next;
        pi.unregisterProvider(name);
      } else {
        all.push(next);
      }
      saveProfiles(all);
      registerProfile(pi, next);
      ctx.ui.notify(`Đã thêm Codex profile ${name}. Dùng /model để chọn.`, "info");
    },
  });
}

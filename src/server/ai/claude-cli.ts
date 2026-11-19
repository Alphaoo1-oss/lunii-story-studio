import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Accès au moteur Claude Code fourni avec le SDK Claude Agent, utilisé pour passer par
// l'abonnement Claude de l'utilisateur plutôt que par une clé API (usage personnel uniquement).

const require = createRequire(import.meta.url);

export function claudeBinary(): string {
  const pkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  return join(dirname(require.resolve(`${pkg}/package.json`)), process.platform === "win32" ? "claude.exe" : "claude");
}

// Environnement du sous-processus : sans clé API (pour forcer l'abonnement) ni variables
// héritées d'une session Claude Code parente, qui détourneraient l'authentification.
export function subscriptionEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  const keep = new Set(["CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN"]);
  return Object.fromEntries(Object.entries(env).filter(([key]) => keep.has(key) || !/^(CLAUDE|ANTHROPIC)/.test(key)));
}

export type ClaudeAuthStatus = { loggedIn: boolean; authMethod: string; subscriptionType?: string };

export async function claudeAuthStatus(): Promise<ClaudeAuthStatus> {
  return new Promise((resolvePromise, reject) => {
    execFile(claudeBinary(), ["auth", "status", "--json"], { env: subscriptionEnv(), timeout: 20_000 }, (err, stdout) => {
      if (err && !stdout) return reject(err);
      try {
        resolvePromise(JSON.parse(stdout) as ClaudeAuthStatus);
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

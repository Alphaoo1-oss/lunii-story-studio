// Lance le moteur Claude Code fourni avec le SDK, avec le même environnement que l'application.
// Usage : npm run claude:login (connexion à l'abonnement, une seule fois) ou npm run claude:status.
import { spawnSync } from "node:child_process";
import { claudeBinary, subscriptionEnv } from "../src/server/ai/claude-cli";

const result = spawnSync(claudeBinary(), process.argv.slice(2), { stdio: "inherit", env: subscriptionEnv() });
process.exit(result.status ?? 1);

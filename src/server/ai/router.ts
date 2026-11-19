import type { SettingsStore } from "../storage/settings";
import type { GenerateRequest, TextGenerator } from "./generator";

// Choisit à chaque appel l'accès à Claude réglé par l'utilisateur : abonnement ou clé API.
export class SettingsRoutedGenerator implements TextGenerator {
  constructor(
    private readonly settings: SettingsStore,
    private readonly byProvider: { subscription: TextGenerator; api: TextGenerator },
  ) {}

  async generate<T>(req: GenerateRequest<T>): Promise<T> {
    const { textProvider } = await this.settings.getSettings();
    return this.byProvider[textProvider].generate(req);
  }
}

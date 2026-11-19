// Erreur métier avec un message en français, renvoyée telle quelle à l'interface.
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    // Données complémentaires renvoyées avec l'erreur (ex. liste des manques avant export).
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError("not_found", `${what} introuvable.`, 404);

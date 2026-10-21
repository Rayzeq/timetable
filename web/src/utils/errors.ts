export enum APIErrorType {
  NOT_FOUND = "NOT_FOUND",
  NO_CACHE = "NO_CACHE",
  MISSING_CREDENTIALS = "MISSING_CREDENTIALS"
}

const APIErrorMessages = {
  [APIErrorType.NOT_FOUND]: "L'EDT demandé n'existe pas ou alors pas encore.",
  [APIErrorType.NO_CACHE]: "Impossible de récupérer l'emploi du temps : le serveur est injoignable et aucune donnée n'est disponible en cache.",
  [APIErrorType.MISSING_CREDENTIALS]: "Identifiants manquants : renseignez votre nom d'utilisateur et votre mot de passe dans les paramètres pour récupérer votre emploi du temps."
};

export class APIError extends Error {
  public type: APIErrorType;
  public message: string;

  constructor(type: APIErrorType) {
    const message = APIErrorMessages[type];
    super(message);

    this.type = type;
    this.message = message;
  }
}

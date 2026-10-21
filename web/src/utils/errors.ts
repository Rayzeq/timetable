export enum APIErrorType {
  NOT_FOUND = "NOT_FOUND",
  NO_CACHE = "NO_CACHE",
  MISSING_CREDENTIALS = "MISSING_CREDENTIALS",
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  SERVER_ERROR = "SERVER_ERROR"
}

const APIErrorMessages: Record<APIErrorType, string> = {
  [APIErrorType.NOT_FOUND]: "L'EDT demandé n'existe pas ou alors pas encore.",
  [APIErrorType.NO_CACHE]: "Impossible de récupérer l'emploi du temps : le serveur est injoignable et aucune donnée n'est disponible en cache.",
  [APIErrorType.MISSING_CREDENTIALS]: "Identifiants manquants : renseignez votre nom d'utilisateur et votre mot de passe dans les paramètres pour récupérer votre emploi du temps.",
  [APIErrorType.INVALID_CREDENTIALS]: "Le serveur a refusé vos identifiants. Vérifiez votre nom d'utilisateur et votre mot de passe dans les paramètres.",
  [APIErrorType.SERVER_ERROR]: "Le serveur de l'université est injoignable ou a renvoyé une erreur. Réessayez plus tard."
};

/** Maps a stable code sent by the API to a known error type. */
const APIErrorTypesByCode: Record<string, APIErrorType> = {
  MISSING_CREDENTIALS: APIErrorType.MISSING_CREDENTIALS,
  INVALID_CREDENTIALS: APIErrorType.INVALID_CREDENTIALS,
  UPSTREAM_ERROR: APIErrorType.SERVER_ERROR
};

/**
 * Translates a backend error code into an error type. Unknown codes fall back
 * to a generic server error so the user never sees a raw (English) message.
 */
export const apiErrorTypeFromCode = (code: string | null | undefined): APIErrorType =>
  (code && APIErrorTypesByCode[code]) || APIErrorType.SERVER_ERROR;

export const getAPIErrorMessage = (type: APIErrorType): string => APIErrorMessages[type];

export class APIError extends Error {
  public type: APIErrorType;

  constructor(type: APIErrorType) {
    super(getAPIErrorMessage(type));

    this.name = "APIError";
    this.type = type;
  }
}

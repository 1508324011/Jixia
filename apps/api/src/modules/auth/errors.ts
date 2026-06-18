export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function unauthorized(message = "Authentication required"): AuthError {
  return new AuthError(message, 401);
}

export function forbidden(message = "Forbidden"): AuthError {
  return new AuthError(message, 403);
}

export function invalidInvitation(message = "Invitation is invalid or unavailable"): AuthError {
  return new AuthError(message, 400);
}

export function conflict(message = "Resource conflict"): AuthError {
  return new AuthError(message, 409);
}

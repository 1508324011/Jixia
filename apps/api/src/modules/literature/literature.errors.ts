export class LiteratureError extends Error {
  readonly name = "LiteratureError";

  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
  }
}

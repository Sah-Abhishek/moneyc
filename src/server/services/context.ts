import type { Db } from "../db/index.ts";

/**
 * Every service function takes the signed-in user's context. Ownership is
 * enforced in SQL (`WHERE user_id = ctx.userId`) inside the service, never by
 * trusting IDs that arrive from the browser.
 */
export interface Ctx {
  db: Db;
  userId: number;
  /** IANA timezone the user's wall-clock times are in */
  tz: string;
}

/** An error whose message is written for the user and safe to show them. */
export class UserError extends Error {
  name = "UserError";
  fieldErrors?: Record<string, string>;
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

export class NotFoundError extends UserError {
  name = "NotFoundError";
}

/** Someone (another tab, a sync) changed the record since it was loaded. */
export class ConflictError extends UserError {
  name = "ConflictError";
}

export const nowUtc = () => new Date().toISOString();

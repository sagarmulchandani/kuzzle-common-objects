import * as util from 'util';
import { JSONObject } from '../utils/interfaces';

/**
 * API error are instances of this class.
 * See https://docs.kuzzle.io/core/2/api/essentials/error-handling/
 */
export class KuzzleError extends Error {
  /**
   * HTTP status code
   */
  public status: number;

  /**
   * Error unique code
   * @see https://docs.kuzzle.io/core/2/core/2/api/essentials/error-codes/
   */
  public code: number;

  /**
   * Error unique identifier
   */
  public id: string;

  constructor(message: string, status: number, id?: string, code?: number) {
    super(message);

    this.status = status;
    this.code = code;
    this.id = id;

    if (util.isError(message)) {
      this.message = message.message;
      this.stack = message.stack;
    }
    else {
      this.message = message;
      Error.captureStackTrace(this, KuzzleError);
    }
  }

  /**
   * Error class name (e.g: 'NotFoundError')
   */
  get name (): string {
    return this.constructor.name;
  }

  toJSON (): JSONObject {
    return {
      message: this.message,
      status: this.status,
      stack: this.stack,
      id: this.id,
      code: this.code
    };
  }
}

module.exports = { KuzzleError };

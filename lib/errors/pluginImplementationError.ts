import { KuzzleError } from './kuzzleError';

export class PluginImplementationError extends KuzzleError {
  constructor(message, id?, code?) {
    super(message, 500, id, code);
    this.message += '\nThis is probably not a Kuzzle error, but a problem with a plugin implementation.';
  }
}

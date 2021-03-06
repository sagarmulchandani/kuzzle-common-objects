'use strict';

import * as uuid from 'uuid';

import { RequestInput } from './models/requestInput';
import { RequestResponse } from './models/requestResponse';
import { RequestContext } from './models/requestContext';
import { KuzzleError } from './errors/kuzzleError';
import { InternalError } from './errors/';
import { JSONObject, Deprecation } from './utils/interfaces';
import * as assert from './utils/assertType';

// private properties
// \u200b is a zero width space, used to masquerade console.log output
const _internalId = 'internalId\u200b';
const _status = 'status\u200b';
const _input = 'input\u200b';
const _error = 'error\u200b';
const _result = 'result\u200b';
const _context = 'context\u200b';
const _timestamp = 'timestamp\u200b';
const _response = 'response\u200b';
const _deprecations = 'deprecations\u200b';

/**
 * Builds a Kuzzle normalized request object
 *
 * The 'data' object accepts a request content using the same
 * format as the one used, for instance, for the Websocket protocol
 *
 * Any undefined option is set to null
 *
 * Differences between request.id and request.internalId:
 *
 * - the internal ID is meant to be unique, immutable, and the real
 *   identifier of a request object instance. It has a getter but
 *   no setter, and is generated once and for all during a Request
 *   object instantiation
 * - the id (aka requestId) is an identifier that can be provided
 *   to the constructor, allowing a client to set it in order to
 *   listen for the related response afterwards. This property
 *   is mutable and clients/plugins are free to use any value
 *   for it
 *
 * In order to prevent any manipulation of Kuzzle's core components,
 * the internalId is used to identify a request by Kuzzle, and
 * the requestId should only be used by clients or plugins.
 *
 */
export class Request {
  /**
   * Request external ID (specified by "requestId" or random uuid)
   */
  public id: string;

  constructor (data: any, options: any) {
    this[_internalId] = uuid.v4();
    this[_status] = 102;
    this[_input] = new RequestInput(data);
    this[_context] = new RequestContext(options);
    this[_error] = null;
    this[_result] = null;
    this[_response] = null;
    this[_deprecations] = undefined;

    // @deprecated - Backward compatibility with the RequestInput.headers
    // property
    this[_input].headers = this[_context].connection.misc.headers;

    this.id = data.requestId
      ? assert.assertString('requestId', data.requestId)
      : uuid.v4();

    this[_timestamp] = data.timestamp || Date.now();

    // handling provided options
    if (options !== undefined && options !== null) {
      if (typeof options !== 'object' || Array.isArray(options)) {
        throw new InternalError('Request options must be an object');
      }

      /*
       * Beware of the order of setXxx methods: if there is an
       * error object in the options, it's very probable that
       * the user wants its status to be the request's final
       * status.
       *
       * Likewise, we should initialize the request status last,
       * as it should override any automated status if it has
       * been specified.
       */
      if (options.result) {
        this.setResult(options.result, options);
      }

      if (options.error) {
        if (options.error instanceof Error) {
          this.setError(options.error);
        }
        else {
          const error = new KuzzleError(options.error.message, options.error.status || 500);

          for (const prop of Object.keys(options.error).filter(key => key !== 'message' && key !== 'status')) {
            error[prop] = options.error[prop];
          }

          this.setError(error);
        }
      }

      if (options.status) {
        this.status = options.status;
      }
    }

    Object.seal(this);
  }

  /**
   * Request internal ID
   */
  get internalId (): string {
    return this[_internalId];
  }

  /**
   * Request internal identifier getter
   */
  get deprecations (): Array<Deprecation> | void {
    return this[_deprecations];
  }

  set deprecations (deprecations: Array<Deprecation> | void) {
    this[_deprecations] = assert.assertArray('deprecations', deprecations, 'object');
  }


  /**
   * Request timestamp (in Epoch-micro)
   */
  get timestamp (): number {
    return this[_timestamp];
  }

  /**
   * Request HTTP status
   */
  get status (): number {
    return this[_status];
  }

  set status (i: number) {
    this[_status] = assert.assertInteger('status', i);
  }

  /**
   * Request input
   */
  get input (): RequestInput {
    return this[_input];
  }

  /**
   * Request context
   */
  get context (): RequestContext {
    return this[_context];
  }

  /**
   * Request error
   */
  get error (): KuzzleError | null {
    return this[_error];
  }

  /**
   * Request result
   */
  get result (): any | null {
    return this[_result];
  }

  /**
   * Request response
   */
  get response (): RequestResponse {
    if (this[_response] === null) {
      this[_response] = new RequestResponse(this);
    }

    return this[_response];
  }

  /**
   * Sets the request status to the error one, and fills the error member
   */
  setError (error: Error) {
    if (!error || !(error instanceof Error)) {
      throw new InternalError('Cannot set non-error object as a request\'s error');
    }

    this[_error] = error instanceof KuzzleError ? error : new InternalError(error);
    this.status = this[_error].status;
  }

  /**
   * Sets the request error to null and status to 200
   */
  clearError () {
    this[_error] = null;
    this.status = 200;
  }

  /**
   * Sets the request result and status
   *
   * @param result Request result. Will be converted to JSON unless `raw` option is set to `true`
   * @param options Additional options
   *    - `status` (number): HTTP status code (default: 200)
   *    - `headers` (JSONObject): additional response protocol headers (default: null)
   *    - `raw` (boolean): instead of a Kuzzle response, forward the result directly (default: false)
   */
  setResult (
    result: any,
    options: {
      /**
       * HTTP status code
       */
      status?: number
      /**
       * additional response protocol headers
       */
      headers?: JSONObject | null;
      /**
       * Returns directly the result instead of wrapping it in a Kuzzle response
       */
      raw?: boolean;
    } = {}
  ) {
    if (result instanceof Error) {
      throw new InternalError('cannot set an error as a request\'s response');
    }

    this.status = options.status || 200;

    if (options.headers) {
      this.response.setHeaders(options.headers);
    }

    if (options.raw !== undefined) {
      this.response.raw = options.raw;
    }

    this[_result] = result;
  }

  /**
   * Add a deprecation for a used component, this can be action/controller/parameters...
   *
   * @param version version where the used component has been deprecated
   * @param message message displayed in the warning
   */
  addDeprecation (version: string, message: string) {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const deprecation = {
      version,
      message
    };

    if (!this.deprecations) {
      this.deprecations = [deprecation];
    }
    else {
      this.deprecations.push(deprecation);
    }
  }

  /**
   * Serialize this object into a pair of POJOs that can be send
   * across the network and then used to instantiate a new Request
   * object
   */
  serialize (): JSONObject {
    const serialized = {
      data: {
        timestamp: this[_timestamp],
        requestId: this.id,
        jwt: this[_input].jwt,
        volatile: this[_input].volatile,
        body: this[_input].body,
        controller: this[_input].controller,
        action: this[_input].action,
        index: this[_input].resource.index,
        collection: this[_input].resource.collection,
        _id: this[_input].resource._id,
      },
      options: {
        result: this[_result],
        error: this[_error],
        status: this[_status]
      },
      // @deprecated - duplicate of options.connection.misc.headers
      headers: this[_input].headers
    };

    Object.assign(serialized.data, this[_input].args);
    Object.assign(serialized.options, this[_context].toJSON());

    return serialized;
  }
}

module.exports = { Request };

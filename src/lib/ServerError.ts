'use strict';

export default class ServerError extends Error {
  private statusCode: number;

  constructor(message?: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }

};

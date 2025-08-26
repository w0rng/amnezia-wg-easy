'use strict';

import * as childProcess from 'child_process';

export default class Util {

  static isValidIPv4(str: string) {
    const blocks = str.split('.');
    if (blocks.length !== 4) return false;
    for (const block of blocks) {
      const value = parseInt(block, 10);
      if (Number.isNaN(value)) return false;
      if (value < 0 || value > 255) return false;
    }

    return true;
  }

  static promisify(fn: any) {
    // eslint-disable-next-line func-names
    return function (req: any, res: any) {
      Promise.resolve().then(async () => fn(req, res))
        .then((result) => {
          if (res.headersSent) return;

          if (typeof result === 'undefined') {
            return res
              .status(204)
              .end();
          }

          return res
            .status(200)
            .json(result);
        })
        .catch((error) => {
          if (typeof error === 'string') {
            error = new Error(error);
          }

          // eslint-disable-next-line no-console
          console.error(error);

          return res
            .status(error.statusCode || 500)
            .json({
              error: error.message || error.toString(),
              stack: error.stack,
            });
        });
    };
  }

  static async exec(cmd: string, {log}: { log: string | undefined } = {log: undefined}): Promise<string> {
    if (log) console.log(log);
    else console.log(cmd);
    if (process.platform !== 'linux') {
      return '';
    }

    return new Promise((resolve, reject) => {
      childProcess.exec(cmd, {
        shell: 'bash',
      }, (err, stdout) => {
        if (err) return reject(err);
        console.log(stdout);
        return resolve(String(stdout).trim());
      });
    });
  }

}

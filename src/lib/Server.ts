'use strict';

import bcrypt from'bcryptjs';
import crypto from 'node:crypto';
import basicAuth from'basic-auth';
import { createServer } from'node:http';
import { stat, readFile } from'node:fs/promises';
import { resolve, sep } from'node:path';

import expressSession from'express-session';
import debug from'debug';

import {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  fromNodeMiddleware,
  getRouterParam,
  toNodeListener,
  readBody,
  setHeader,
  serveStatic, App,
} from 'h3';

import {
  PORT,
  WEBUI_HOST,
  RELEASE,
  PASSWORD_HASH,
  MAX_AGE,
  LANG,
  UI_TRAFFIC_STATS,
  UI_CHART_TYPE,
  WG_ENABLE_ONE_TIME_LINKS,
  UI_ENABLE_SORT_CLIENTS,
  WG_ENABLE_EXPIRES_TIME,
  ENABLE_PROMETHEUS_METRICS,
  PROMETHEUS_METRICS_PASSWORD,
  DICEBEAR_TYPE,
  USE_GRAVATAR,
} from'@/config';
import WireGuard from "@/services/WireGuard";
import {IncomingMessage, ServerResponse} from "node-mock-http";
import {string} from "postcss-selector-parser";

const log = debug('Server');
const requiresPassword = !!PASSWORD_HASH;
const requiresPrometheusPassword = !!PROMETHEUS_METRICS_PASSWORD;
export const wireGuard = new WireGuard();
/**
 * Checks if `password` matches the PASSWORD_HASH.
 *
 * If environment variable is not set, the password is always invalid.
 *
 * @param {string} password String to test
 * @param hash
 * @returns {boolean} true if matching environment, otherwise false
 */
const isPasswordValid = (password: string, hash: string): boolean => {
  if (hash) {
    return bcrypt.compareSync(password, hash);
  }

  return false;
};

const cronJobEveryMinute = async () => {
  await wireGuard.cronJobEveryMinute();
  setTimeout(cronJobEveryMinute, 60 * 1000);
};

export class Server {
  private app: App;

  constructor() {
    const app = createApp();
    this.app = app;

    app.use(
      fromNodeMiddleware(
        expressSession({
          secret: crypto.randomBytes(256).toString('hex'),
          resave: true,
          saveUninitialized: true,
        }) as unknown as (req: any, res: any, next: (err?: any) => void) => void
      )
    );

    const router = createRouter();
    app.use(router);

    router
      .get('/api/release', defineEventHandler((event) => {
        setHeader(event, 'Content-Type', 'application/json');
        return RELEASE;
      }))

      .get('/api/lang', defineEventHandler((event) => {
        setHeader(event, 'Content-Type', 'application/json');
        return `"${LANG}"`;
      }))

      .get('/api/remember-me', defineEventHandler((event) => {
        setHeader(event, 'Content-Type', 'application/json');
        return MAX_AGE > 0;
      }))

      .get('/api/ui-traffic-stats', defineEventHandler((event) => {
        setHeader(event, 'Content-Type', 'application/json');
        return `${UI_TRAFFIC_STATS}`;
      }))

      .get('/api/ui-chart-type', defineEventHandler((event) => {
        setHeader(event, 'Content-Type', 'application/json');
        return `"${UI_CHART_TYPE}"`;
      }))

      .get('/api/wg-enable-one-time-links', defineEventHandler((event) => {
        setHeader(event, 'Content-Type', 'application/json');
        return `${WG_ENABLE_ONE_TIME_LINKS}`;
      }))

      .get('/api/ui-sort-clients', defineEventHandler((event) => {
        setHeader(event, 'Content-Type', 'application/json');
        return `${UI_ENABLE_SORT_CLIENTS}`;
      }))

      .get('/api/wg-enable-expire-time', defineEventHandler((event) => {
        setHeader(event, 'Content-Type', 'application/json');
        return `${WG_ENABLE_EXPIRES_TIME}`;
      }))

      .get('/api/ui-avatar-settings', defineEventHandler((event) => {
        setHeader(event, 'Content-Type', 'application/json');
        return {
          dicebear: DICEBEAR_TYPE,
          gravatar: USE_GRAVATAR,
        }
      }))

      // Authentication
      .get(
        '/api/session',
        defineEventHandler((event: any) => {
          const authenticated = requiresPassword
            ? !!(event.node.req.session?.authenticated)
            : true;

          return {
            requiresPassword,
            authenticated,
          };
        })
      )
      .get('/cnf/:clientOneTimeLink', defineEventHandler(async (event) => {
        if (WG_ENABLE_ONE_TIME_LINKS === 'false') {
          throw createError({
            status: 404,
            message: 'Invalid state',
          });
        }
        const clientOneTimeLink = getRouterParam(event, 'clientOneTimeLink');
        const clients = await wireGuard.getClients();
        const client = clients.find((client) => client.oneTimeLink === clientOneTimeLink);
        if (!client) return;
        const clientId = client.id;
        const config = await wireGuard.getClientConfiguration({ clientId });
        await wireGuard.eraseOneTimeLink({ clientId });
        setHeader(event, 'Content-Disposition', `attachment; filename="${clientOneTimeLink}.conf"`);
        setHeader(event, 'Content-Type', 'text/plain');
        return config;
      }))
      .post(
        '/api/session',
        defineEventHandler(async (event: any) => {
          const { password, remember } = await readBody<{
            password: string;
            remember: boolean;
          }>(event);

          if (!requiresPassword) {
            throw createError({
              status: 401,
              message: 'Invalid state',
            });
          }

          // @ts-ignore
          if (!isPasswordValid(password, PASSWORD_HASH)) {
            throw createError({
              status: 401,
              message: 'Incorrect Password',
            });
          }

          if (MAX_AGE && remember) {
            event.node.req.session.cookie.maxAge = MAX_AGE;
          }
          event.node.req.session.authenticated = true;
          event.node.req.session.save();

          log(`New Session: ${event.node.req.session.id}`);

          return { success: true };
        })
      );

    app.use(
      fromNodeMiddleware((req: any, res: any, next: (err?: any) => void) => {
        // @ts-ignore
        if (!requiresPassword || !req.url.startsWith('/api/')) {
          return next();
        }

        if (req.session && req.session.authenticated) {
          return next();
        }

        if (req.url.startsWith('/api/') && req.headers['authorization']) {
          // @ts-ignore
          if (isPasswordValid(req.headers['authorization'], PASSWORD_HASH)) {
            return next();
          }
          return res.status(401).json({
            error: 'Incorrect Password',
          });
        }

        return res.status(401).json({
          error: 'Not Logged In',
        });
      }),
    );

    const router2 = createRouter();
    app.use(router2);

    router2
      .delete('/api/session', defineEventHandler((event: any) => {
        const sessionId = event.node.req.session.id;

        event.node.req.session.destroy(() => {
        });

        debug(`Deleted Session: ${sessionId}`);
        return {success: true};
      }))
      .get('/api/wireguard/client', defineEventHandler(() => {
        return wireGuard.getClients();
      }))
      .get('/api/wireguard/client/:clientId/qrcode.svg', defineEventHandler(async (event) => {
        const clientId = getRouterParam(event, 'clientId');
        if (!clientId) throw createError({ status: 400 });
        const svg = await wireGuard.getClientQRCodeSVG({ clientId });
        setHeader(event, 'Content-Type', 'image/svg+xml');
        return svg;
      }))
      .get('/api/wireguard/client/:clientId/configuration', defineEventHandler(async (event) => {
        const clientId = getRouterParam(event, 'clientId');
        if (!clientId) throw createError({ status: 400 });
        const client = await wireGuard.getClient({ clientId });
        const config = await wireGuard.getClientConfiguration({ clientId });
        const configName = client.name
          .replace(/[^a-zA-Z0-9_=+.-]/g, '-')
          .replace(/(-{2,}|-$)/g, '-')
          .replace(/-$/, '')
          .substring(0, 32);
        setHeader(event, 'Content-Disposition', `attachment; filename="${configName || clientId}.conf"`);
        setHeader(event, 'Content-Type', 'text/plain');
        return config;
      }))
      .post('/api/wireguard/client', defineEventHandler(async (event) => {
        const { name } = await readBody(event);
        const { expiredDate } = await readBody(event);
        await wireGuard.createClient({ name, expiredDate });
        return { success: true };
      }))
      .delete('/api/wireguard/client/:clientId', defineEventHandler(async (event) => {
        const clientId = getRouterParam(event, 'clientId');
        if (!clientId) throw createError({ status: 400 });
        await wireGuard.deleteClient({ clientId });
        return { success: true };
      }))
      .post('/api/wireguard/client/:clientId/enable', defineEventHandler(async (event) => {
        const clientId = getRouterParam(event, 'clientId');
        if (!clientId) throw createError({ status: 400 });
        if (clientId === '__proto__' || clientId === 'constructor' || clientId === 'prototype') {
          throw createError({ status: 403 });
        }
        await wireGuard.enableClient({ clientId });
        return { success: true };
      }))
      .post('/api/wireguard/client/:clientId/generateOneTimeLink', defineEventHandler(async (event) => {
        if (WG_ENABLE_ONE_TIME_LINKS === 'false') {
          throw createError({
            status: 404,
            message: 'Invalid state',
          });
        }
        const clientId = getRouterParam(event, 'clientId');
        if (!clientId) throw createError({ status: 400 });
        if (clientId === '__proto__' || clientId === 'constructor' || clientId === 'prototype') {
          throw createError({ status: 403 });
        }
        await wireGuard.generateOneTimeLink({ clientId });
        return { success: true };
      }))
      .post('/api/wireguard/client/:clientId/disable', defineEventHandler(async (event) => {
        const clientId = getRouterParam(event, 'clientId');
        if (!clientId) throw createError({ status: 400 });
        if (clientId === '__proto__' || clientId === 'constructor' || clientId === 'prototype') {
          throw createError({ status: 403 });
        }
        await wireGuard.disableClient({ clientId });
        return { success: true };
      }))
      .put('/api/wireguard/client/:clientId/name', defineEventHandler(async (event) => {
        const clientId = getRouterParam(event, 'clientId');
        if (!clientId) throw createError({ status: 400 });
        if (clientId === '__proto__' || clientId === 'constructor' || clientId === 'prototype') {
          throw createError({ status: 403 });
        }
        const { name } = await readBody(event);
        await wireGuard.updateClientName({ clientId, name });
        return { success: true };
      }))
      .put('/api/wireguard/client/:clientId/address', defineEventHandler(async (event) => {
        const clientId = getRouterParam(event, 'clientId');
        if (!clientId) throw createError({ status: 400 });
        if (clientId === '__proto__' || clientId === 'constructor' || clientId === 'prototype') {
          throw createError({ status: 403 });
        }
        const { address } = await readBody(event);
        await wireGuard.updateClientAddress({ clientId, address });
        return { success: true };
      }))
      .put('/api/wireguard/client/:clientId/expireDate', defineEventHandler(async (event) => {
        const clientId = getRouterParam(event, 'clientId');
        if (!clientId) throw createError({ status: 400 });
        if (clientId === '__proto__' || clientId === 'constructor' || clientId === 'prototype') {
          throw createError({ status: 403 });
        }
        const { expireDate } = await readBody(event);
        await wireGuard.updateClientExpireDate({ clientId, expireDate });
        return { success: true };
      }));

    const safePathJoin = (base: any, target: any) => {
      // Manage web root (edge case)
      if (target === '/') {
        return `${base}${sep}`;
      }

      // Prepend './' to prevent absolute paths
      const targetPath = `.${sep}${target}`;

      // Resolve the absolute path
      const resolvedPath = resolve(base, targetPath);

      // Check if resolvedPath is a subpath of base
      if (resolvedPath.startsWith(`${base}${sep}`)) {
        return resolvedPath;
      }

      throw createError({
        status: 400,
        message: 'Bad Request',
      });
    };

    // Check Prometheus credentials
    app.use(
      fromNodeMiddleware((req, res, next) => {
        // @ts-ignore
        if (!requiresPrometheusPassword || !req.url.startsWith('/metrics')) {
          return next();
        }
        const user = basicAuth(req);
        if (!user) {
          res.statusCode = 401;
          return { error: 'Not Logged In' };
        }
        if (user.pass) {
          // @ts-ignore
          if (isPasswordValid(user.pass, PROMETHEUS_METRICS_PASSWORD)) {
            return next();
          }
          res.statusCode = 401;
          return { error: 'Incorrect Password' };
        }
        res.statusCode = 401;
        return { error: 'Not Logged In' };
      }),
    );

    // Prometheus Metrics API
    const routerPrometheusMetrics = createRouter();
    app.use(routerPrometheusMetrics);

    // Prometheus Routes
    routerPrometheusMetrics
      .get('/metrics', defineEventHandler(async (event) => {
        setHeader(event, 'Content-Type', 'text/plain');
        if (ENABLE_PROMETHEUS_METRICS === 'true') {
          return wireGuard.getMetrics();
        }
        return '';
      }))
      .get('/metrics/json', defineEventHandler(async (event) => {
        setHeader(event, 'Content-Type', 'application/json');
        if (ENABLE_PROMETHEUS_METRICS === 'true') {
          return wireGuard.getMetricsJSON();
        }
        return '';
      }));

    // backup_restore
    const router3 = createRouter();
    app.use(router3);

    router3
      .get('/api/wireguard/backup', defineEventHandler(async (event) => {
        const config = await wireGuard.backupConfiguration();
        setHeader(event, 'Content-Disposition', 'attachment; filename="wg0.json"');
        setHeader(event, 'Content-Type', 'text/json');
        return config;
      }))
      .put('/api/wireguard/restore', defineEventHandler(async (event) => {
        const { file } = await readBody(event);
        await wireGuard.restoreConfiguration(file);
        return { success: true };
      }));

    // Static assets
    const publicDir = '/app/www';
    app.use(
      defineEventHandler((event) => {
        return serveStatic(event, {
          getContents: (id) => {
            return readFile(safePathJoin(publicDir, id));
          },
          getMeta: async (id) => {
            const filePath = safePathJoin(publicDir, id);

            const stats = await stat(filePath).catch(() => {});
            if (!stats || !stats.isFile()) {
              return;
            }

            if (id.endsWith('.html')) setHeader(event, 'Content-Type', 'text/html');
            if (id.endsWith('.js')) setHeader(event, 'Content-Type', 'application/javascript');
            if (id.endsWith('.json')) setHeader(event, 'Content-Type', 'application/json');
            if (id.endsWith('.css')) setHeader(event, 'Content-Type', 'text/css');
            if (id.endsWith('.png')) setHeader(event, 'Content-Type', 'image/png');
            if (id.endsWith('.svg')) setHeader(event, 'Content-Type', 'image/svg+xml');

            return {
              size: stats.size,
              mtime: stats.mtimeMs,
            };
          },
        });
      }),
    );

    // @ts-ignore
    createServer(toNodeListener(app)).listen(PORT, WEBUI_HOST);
    debug(`Listening on http://${WEBUI_HOST}:${PORT}`);

    cronJobEveryMinute();
  }

};

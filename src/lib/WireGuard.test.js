'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

process.env.WG_HOST = process.env.WG_HOST || 'vpn.example.com';

const Util = require('./Util');
const WireGuard = require('./WireGuard');

const originalReadFile = fs.readFile;
const originalExec = Util.exec;

const validServer = {
  privateKey: 'priv',
  publicKey: 'pub',
  address: '10.8.0.1',
  jc: 5,
  jmin: 50,
  jmax: 1000,
  s1: 40,
  s2: 41,
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
};

test.afterEach(() => {
  fs.readFile = originalReadFile;
  Util.exec = originalExec;
});

test('migrates legacy config to schema version 2 and normalizes Amnezia fields', () => {
  const wireGuard = new WireGuard();

  const migrated = wireGuard.__migrateConfig({
    server: {
      ...validServer,
      jc: '4',
      jmin: '60',
      jmax: '700',
      s1: '33',
      s2: '35',
      h1: '111',
      h2: '222',
      h3: '333',
      h4: '444',
    },
    clients: null,
  });

  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.server.jc, 4);
  assert.equal(migrated.server.jmin, 60);
  assert.equal(migrated.server.jmax, 700);
  assert.equal(migrated.server.s1, 33);
  assert.equal(migrated.server.s2, 35);
  assert.equal(migrated.server.h1, 111);
  assert.equal(migrated.server.h2, 222);
  assert.equal(migrated.server.h3, 333);
  assert.equal(migrated.server.h4, 444);
  assert.deepEqual(migrated.clients, {});
});

test('keeps higher schema version unchanged', () => {
  const wireGuard = new WireGuard();

  const migrated = wireGuard.__migrateConfig({
    schemaVersion: 3,
    server: validServer,
    clients: {},
  });

  assert.equal(migrated.schemaVersion, 3);
});

test('throws when base server keys are missing', () => {
  const wireGuard = new WireGuard();

  assert.throws(() => {
    wireGuard.__migrateConfig({
      server: {
        publicKey: 'pub',
        address: '10.8.0.1',
      },
      clients: {},
    });
  }, /missing privateKey/);
});

test('throws when jc exceeds supported bounds', () => {
  const wireGuard = new WireGuard();

  assert.throws(() => {
    wireGuard.__migrateConfig({
      server: {
        ...validServer,
        jc: 129,
      },
      clients: {},
    });
  }, /jc must be between 1 and 128/);
});

test('throws when jmax exceeds supported bounds', () => {
  const wireGuard = new WireGuard();

  assert.throws(() => {
    wireGuard.__migrateConfig({
      server: {
        ...validServer,
        jmax: 2000,
      },
      clients: {},
    });
  }, /jmax must be between 1 and 1500/);
});

test('buildConfig migrates loaded wg0.json to schema v2', async () => {
  const wireGuard = new WireGuard();

  fs.readFile = async () => JSON.stringify({
    server: {
      ...validServer,
      jc: '8',
    },
    clients: {},
  });

  const config = await wireGuard.__buildConfig();

  assert.equal(config.schemaVersion, 2);
  assert.equal(config.server.jc, 8);
});

test('buildConfig generates default schema v2 config when wg0.json missing', async () => {
  const wireGuard = new WireGuard();

  fs.readFile = async () => {
    throw new Error('ENOENT');
  };

  let execCalls = 0;
  Util.exec = async (cmd) => {
    execCalls += 1;
    if (cmd === 'wg genkey') return 'generated-private';
    if (cmd.includes('wg pubkey')) return 'generated-public';
    throw new Error(`Unexpected command: ${cmd}`);
  };

  const config = await wireGuard.__buildConfig();

  assert.equal(config.schemaVersion, 2);
  assert.equal(config.server.privateKey, 'generated-private');
  assert.equal(config.server.publicKey, 'generated-public');
  assert.equal(execCalls, 2);
});

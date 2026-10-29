/** Task API: fixed V4 by default; historical versions and fixtures require demo mode. */
'use strict';

const path = require('path');
const express = require('express');
const { cloneDB } = require('./db');
const { authenticate, signToken } = require('./auth');
const services = require('./taskService');

const VERSIONS = Object.freeze(['v0', 'v1', 'v2', 'v3', 'v4']);
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** Each instance owns its configuration and database; HTTP cannot select a service. */
function createApp({ version = 'v4', demo = false, db: initialDB } = {}) {
  if (!VERSIONS.includes(version)) throw new Error(`Invalid version: ${version}`);
  if (typeof demo !== 'boolean') throw new Error('demo must be a boolean');
  let activeVersion = version;
  let db = initialDB || cloneDB();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true, version: activeVersion, demo }));
  app.get('/api/version', (_req, res) => res.json({ version: activeVersion, demo }));

  // Teaching controls exist only in an explicitly created demo instance.
  // There is deliberately no /api/db endpoint in either mode.
  if (demo) {
    app.post('/api/version', (req, res) => {
      const nextVersion = req.body && req.body.version;
      if (!VERSIONS.includes(nextVersion)) {
        return res.status(400).json({ error: 'invalid_version', allowed: VERSIONS });
      }
      activeVersion = nextVersion;
      res.json({ ok: true, version: activeVersion, demo });
    });
    app.get('/api/tokens', (_req, res) => {
      const tokens = Object.fromEntries(Object.keys(db.users).map(id => [id, signToken(id)]));
      res.json({ tokens });
    });
    const reset = (req, res) => {
      const fixture = req.body && req.body.fixture;
      if (fixture && !['viewer', 'closed'].includes(fixture)) {
        return res.status(400).json({ error: 'invalid_fixture' });
      }
      db = cloneDB();
      if (fixture === 'viewer') db.projects.alpha.members.bob = 'Viewer';
      if (fixture === 'closed') db.tasks.A1.status = 'Closed';
      res.json({ ok: true, message: 'Đã khôi phục dữ liệu mẫu.' });
    };
    app.post('/test/reset', reset);
    app.post('/api/test/reset', reset);
  }

  const authenticated = (req, res, next) => authenticate(req, res, () => {
    if (!owns(db.users, req.user.id)) {
      return res.status(401).json({ error: 'unauthenticated', message: 'Người dùng không còn tồn tại.' });
    }
    next();
  });
  const handle = (method, resourceParam, hasBody = false) => (req, res) => {
    // x-version and ?version never select this policy.
    const service = services[activeVersion];
    const args = [db, req.user.id, req.params[resourceParam]];
    if (hasBody) args.push(req.body || {});
    const result = service[method](...args);
    res.status(result.status).json(result.body);
  };

  app.get('/tasks/:id', authenticated, handle('getTask', 'id'));
  app.patch('/tasks/:id', authenticated, handle('editTask', 'id', true));
  app.delete('/projects/:id', authenticated, handle('deleteProject', 'id'));
  app.post('/projects/:id/members', authenticated, handle('manageMembers', 'id', true));

  app.use(express.static(path.join(__dirname, '../public')));
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((err, _req, res, _next) => {
    const status = err.status === 413 ? 413 : err.status === 400 ? 400 : 500;
    res.status(status).json({ error: status === 500 ? 'internal_error' : 'invalid_request' });
  });
  return app;
}

const app = createApp();

/** Both modes bind to loopback. Demo cannot be enabled through an HTTP request. */
function startServer(port = process.env.PORT || 3000, options = {}) {
  const instance = options.app || createApp(options);
  return new Promise((resolve, reject) => {
    const server = instance.listen(port, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const demo = args.includes('--demo');
  const versionArg = args.find(arg => arg.startsWith('--version='));
  const version = versionArg ? versionArg.slice('--version='.length) : 'v4';
  const unknown = args.filter(arg => arg !== '--demo' && arg !== versionArg);
  if (unknown.length || !VERSIONS.includes(version) || (!demo && version !== 'v4')) {
    console.error('Dùng: node src/server.js [--demo] [--version=v0|v1|v2|v3|v4]. V0–V3 cần --demo.');
    process.exitCode = 1;
  } else {
    startServer(process.env.PORT || 3000, { version, demo }).then(server => {
      console.log(`Task API [${version}, ${demo ? 'DEMO' : 'fixed'}] http://127.0.0.1:${server.address().port}`);
    }).catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = { app, createApp, startServer, VERSIONS };

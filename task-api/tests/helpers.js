'use strict';

const assert = require('node:assert/strict');
const { signToken } = require('../src/auth');

// Each test owns its fixture, application, random loopback port and cleanup.
async function withApp(options, callback) {
  const { createApp } = require('../src/server');
  const app = createApp(options);
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, path, { user, token, body, headers = {} } = {}) => {
    const requestHeaders = { Connection: 'close', ...headers };
    if (user || token) requestHeaders.Authorization = `Bearer ${token || signToken(user)}`;
    const requestOptions = { method, headers: requestHeaders };
    if (body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
      requestOptions.body = JSON.stringify(body);
    }
    const response = await fetch(baseUrl + path, requestOptions);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, body: data };
  };
  try {
    return await callback(api, { app, baseUrl });
  } finally {
    server.closeIdleConnections?.();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function expectStatus(response, status) {
  assert.equal(response.status, status, `Expected HTTP ${status}, received ${response.status}: ${JSON.stringify(response.body)}`);
  if (status >= 400 && status !== 404) assert.equal(typeof response.body.error, 'string');
  return response;
}

const snapshot = value => JSON.parse(JSON.stringify(value));
module.exports = { assert, withApp, expectStatus, snapshot };

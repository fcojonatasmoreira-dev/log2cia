import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const serviceWorkerSource = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const entryPoint = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

function criarAmbienteServiceWorker({ fetchImpl = globalThis.fetch } = {}) {
  const listeners = new Map();
  const entries = new Map();
  const removidos = [];
  let claimed = false;
  let skippedWaiting = false;

  const cache = {
    async put(key, value) { entries.set(key, value); },
    async match(key) { return entries.get(key); },
  };
  const caches = {
    async open() { return cache; },
    async keys() { return ['log2cia-pwa-offline-old', 'cache-de-outro-app', 'log2cia-pwa-offline-v1']; },
    async delete(name) { removidos.push(name); return true; },
  };
  const self = {
    location: { origin: 'https://log2cia.example' },
    clients: { async claim() { claimed = true; } },
    async skipWaiting() { skippedWaiting = true; },
    addEventListener(type, callback) { listeners.set(type, callback); },
  };
  runInNewContext(serviceWorkerSource, { self, caches, fetch: fetchImpl, URL, Response });

  return {
    entries,
    removidos,
    get claimed() { return claimed; },
    get skippedWaiting() { return skippedWaiting; },
    async dispatch(type, event = {}) {
      let promise;
      event.waitUntil = (value) => { promise = value; };
      listeners.get(type)?.(event);
      if (promise) await promise;
      return event;
    },
  };
}

test('manifesto identifica PWA e referencia ícones PNG com dimensões corretas', async () => {
  assert.equal(manifest.name.startsWith('Log2CIA'), true);
  assert.equal(manifest.short_name, 'Log2CIA');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');

  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(`../public${icon.src}`, import.meta.url));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), Number(icon.sizes.split('x')[0]));
    assert.equal(bytes.readUInt32BE(20), Number(icon.sizes.split('x')[1]));
  }

  const appleIcon = await readFile(new URL('../public/apple-touch-icon.png', import.meta.url));
  assert.equal(appleIcon.readUInt32BE(16), 180);
  assert.equal(appleIcon.readUInt32BE(20), 180);
});

test('HTML declara ícones e metadados iOS, e o registro do SW é restrito à produção', () => {
  assert.match(indexHtml, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(indexHtml, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.match(indexHtml, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(indexHtml, /apple-mobile-web-app-title" content="Log2CIA"/);
  assert.match(entryPoint, /import\.meta\.env\.PROD && 'serviceWorker' in navigator/);
  assert.match(entryPoint, /register\('\/sw\.js',\s*\{\s*scope:\s*'\/',\s*updateViaCache:\s*'none'/);
  assert.match(entryPoint, /addEventListener\('load', registrarServiceWorker, \{ once: true \}\)/);
  assert.doesNotMatch(entryPoint, /location\.reload\(/);
});

test('instala somente a página offline estática e ativa limpando apenas caches próprios antigos', async () => {
  const requested = [];
  const env = criarAmbienteServiceWorker({
    fetchImpl: async (request, options) => {
      requested.push([request, options]);
      return new Response('<!doctype html><title>Sem conexão</title>', { status: 200 });
    },
  });

  await env.dispatch('install');
  assert.equal(requested.length, 1);
  assert.equal(requested[0][0], '/offline.html');
  assert.equal(requested[0][1].cache, 'reload');
  assert.deepEqual([...env.entries.keys()], ['/offline.html']);
  assert.equal(env.skippedWaiting, true);

  await env.dispatch('activate');
  assert.deepEqual(env.removidos, ['log2cia-pwa-offline-old']);
  assert.equal(env.claimed, true);
});

test('intercepta apenas navegações GET da mesma origem e nunca intercepta API ou assets', async () => {
  let fetchCount = 0;
  const fetchOptions = [];
  const env = criarAmbienteServiceWorker({
    fetchImpl: async (_request, options) => { fetchCount += 1; fetchOptions.push(options); return new Response('online'); },
  });
  const requests = [
    { method: 'GET', mode: 'navigate', url: 'https://log2cia.example/' },
    { method: 'GET', mode: 'navigate', url: 'https://log2cia.example/api/permutas' },
    { method: 'GET', mode: 'navigate', url: 'https://log2cia.example/api' },
    { method: 'POST', mode: 'navigate', url: 'https://log2cia.example/acao' },
    { method: 'GET', mode: 'cors', url: 'https://log2cia.example/app.js' },
    { method: 'GET', mode: 'navigate', url: 'https://terceiro.example/' },
  ];

  for (const request of requests) {
    let intercepted = false;
    let resposta;
    await env.dispatch('fetch', {
      request,
      respondWith(promise) { intercepted = true; resposta = promise; },
    });
    assert.equal(intercepted, request.url === 'https://log2cia.example/' && request.mode === 'navigate');
    if (intercepted) assert.equal(await (await resposta).text(), 'online');
  }
  assert.equal(fetchCount, 1);
  assert.equal(fetchOptions[0].cache, 'no-store', 'navegação autenticada não pode reutilizar HTML do cache HTTP');
});

test('em navegação offline retorna a página estática, sem substituir chamadas de API', async () => {
  const env = criarAmbienteServiceWorker({ fetchImpl: async () => { throw new Error('offline'); } });
  const responseOffline = new Response('<!doctype html><title>Sem conexão</title>');
  env.entries.set('/offline.html', responseOffline);

  let resposta;
  await env.dispatch('fetch', {
    request: { method: 'GET', mode: 'navigate', url: 'https://log2cia.example/permutas' },
    respondWith(promise) { resposta = promise; },
  });
  assert.equal(await (await resposta).text(), '<!doctype html><title>Sem conexão</title>');
});

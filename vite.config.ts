import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';

/**
 * Genera /sw.js en el build con la lista exacta de archivos a precachear,
 * para que la app funcione offline desde la primera visita.
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'pos-service-worker',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map'))
        .map((f) => '/' + f);
      const staticFiles = [
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/apple-touch-icon.png',
        '/icons/favicon.svg',
      ];
      const precache = Array.from(new Set([...staticFiles, ...files]));
      const version = createHash('sha1').update(precache.join('|')).digest('hex').slice(0, 10);
      const template = readFileSync(fileURLToPath(new URL('./src/sw-template.js', import.meta.url)), 'utf8');
      const source = template
        .replace('__CACHE_VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache, null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});

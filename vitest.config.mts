import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    {
      // The Worker imports its migration as text (wrangler's default rule for .sql); do the same here.
      name: 'sql-as-text',
      transform: (code, id) => (id.endsWith('.sql') ? `export default ${JSON.stringify(code)};` : undefined),
    },
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
  },
});

import { defineConfig } from 'vite';
import { cp, mkdir } from 'node:fs/promises';
export default defineConfig({
  plugins: [{
    name: 'pdfjs-assets',
    async buildStart() {
      await mkdir('public/pdfjs', { recursive: true });
      for (const folder of ['cmaps', 'standard_fonts', 'wasm']) await cp(`node_modules/pdfjs-dist/${folder}`, `public/pdfjs/${folder}`, { recursive: true });
    }
  }],
  server: { host: '127.0.0.1', port: 5173, strictPort: true }
});

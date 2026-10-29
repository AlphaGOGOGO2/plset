import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// PLSET_BASE / PLSET_OUT are set by scripts/build-web.mjs for the browser edition served at starjoa.kr/proleague/app; the Electron build keeps the defaults.
export default defineConfig({ base: process.env.PLSET_BASE ?? './', plugins: [react()], build: { outDir: process.env.PLSET_OUT ?? 'dist', assetsInlineLimit: 0 } });

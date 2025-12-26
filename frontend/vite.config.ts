import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Generate build version (timestamp + random suffix for uniqueness)
const BUILD_VERSION = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Plugin to generate version.json in the output directory
const generateVersionFile = (): Plugin => ({
  name: 'generate-version-file',
  writeBundle() {
    const versionData = {
      version: BUILD_VERSION,
      buildTime: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.resolve(__dirname, 'dist/version.json'),
      JSON.stringify(versionData, null, 2)
    );
    console.log(`[Build] Generated version.json: ${BUILD_VERSION}`);
  },
});

// Custom plugin to rewrite shared imports only from src files
const rewriteSharedImports = (): Plugin => ({
  name: 'rewrite-shared-imports',
  async resolveId(source, importer) {
    // Only rewrite if importer is from our src directory (not node_modules)
    if (importer && !importer.includes('node_modules') && /^(\.\.\/)+shared/.test(source)) {
      // Replace any number of ../ before shared with ./shared
      const rewrittenSource = source.replace(/^(\.\.\/)+shared/, path.resolve(__dirname, './src/shared'));
      // Let Vite resolve the actual file (handles .ts, .tsx, /index.ts, etc.)
      return this.resolve(rewrittenSource, importer, { skipSelf: true });
    }
    return null;
  },
});

export default defineConfig({
  plugins: [react(), rewriteSharedImports(), generateVersionFile()],
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://backend:8000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

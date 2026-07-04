import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Dev-only convenience: `npm run dev` is plain Vite with no Cloudflare
      // Pages Functions support, so /tiles/* would otherwise fall through to
      // the SPA fallback (index.html) instead of hitting our tile proxy.
      // This forwards straight to ArcGIS so satellite view is testable
      // locally. NOT used in production -- Cloudflare Pages runs the real
      // caching proxy at functions/tiles/[[path]].js instead. Note this
      // bypasses that cache, so each local reload re-hits ArcGIS directly --
      // fine for occasional dev testing, but avoid leaving satellite view
      // toggled on for long unattended sessions.
      '/tiles': {
        target: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles/, ''),
      },
    },
  },
});

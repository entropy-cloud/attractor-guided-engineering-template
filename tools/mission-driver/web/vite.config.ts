import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:9300',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // NFR-3: split the heavy viz libraries into their own vendor chunks so
        // they stay out of the entry / first-screen bundle. Rollup only EMITS a
        // manualChunk when its modules are actually imported somewhere — after
        // the entry-side registration was removed, these chunks are reachable
        // only via the lazy-loaded RunDetail route, so they load on demand.
        //
        // IMPORTANT — why `vue-echarts` is deliberately NOT in the echarts chunk:
        // `vue-echarts` imports `vue`, which lives in the entry chunk. Forcing
        // vue-echarts into the echarts chunk (or its own chunk) makes Rollup
        // hoist the shared `vue` modules across the chunk boundary and synthesize
        // a static entry→echarts import plus a `<link rel=modulepreload>` for
        // echarts in index.html — which silently re-pulls echarts into the first
        // screen and defeats the entire lazy-loading goal (verified empirically:
        // entry↔echarts static binding + modulepreload appear). Leaving
        // vue-echarts un-chunked lets it bundle into RunDetail (the lazy route),
        // keeping the deps one-directional (RunDetail/vue-echarts → echarts core,
        // → entry/vue) with no facade and no entry-side preload. echarts core +
        // zrender have NO vue coupling, so they split cleanly.
        // Matchers are scoped to node_modules paths so app code is unaffected.
        manualChunks(id) {
          if (!id.includes('node_modules/')) return
          if (/node_modules\/(echarts|zrender)\//.test(id)) return 'echarts'
          if (/node_modules\/@xterm\//.test(id)) return 'xterm'
        },
      },
    },
  },
})

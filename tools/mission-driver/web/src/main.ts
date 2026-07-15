import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'

// Entry kept dependency-light for NFR-3 (first-screen initial download):
// echarts runtime is registered locally in ResourceChart.vue (reached only via
// the lazy-loaded RunDetail route), and xterm CSS lives in LogViewer.vue. See
// plan 2026-06-30-2202-1.
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(naive)

app.mount('#app')

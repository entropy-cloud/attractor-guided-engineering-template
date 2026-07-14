<!--
  LogViewer — xterm.js 终端日志查看器（ANSI 渲染、搜索、followTail）。

  设计要点：
  - 不设 convertEol:true —— 日志行已用 `\r\n` join，开启会二次转换产生 `\r\r\n` 多余空行。
  - 自动刷新使用固定 tail=500，不受「加载更多」累积的 tailSize 影响。
-->
<template>
  <div class="log-viewer">
    <template v-if="missionStore.selectedStep">
      <div v-if="termReady && logFileName" class="log-info">
        <span class="log-filepath" :title="'点击在新标签页打开完整日志\n' + logFileName" @click="openFullLog">{{ logFileName }}</span>
        <span class="log-linecount">{{ totalLines }} lines</span>
      </div>

      <div v-if="termReady" class="log-toolbar">
        <n-button
          size="small"
          :type="followTail ? 'primary' : 'default'"
          @click="toggleFollowTail"
        >
          <template #icon>
            <n-icon :component="followTail ? PauseOutline : ArrowDownOutline" />
          </template>
          {{ followTail ? '停止跟踪' : '跟踪最新' }}
        </n-button>
        <div class="log-toolbar-right">
          <n-button
            size="small"
            :disabled="!hasPrompt"
            @click="showPrompt = true"
          >
            Show Prompt
          </n-button>
          <n-input-group>
            <n-input
              v-model:value="query"
              size="small"
              placeholder="search…"
              @keydown.enter.prevent="searchNext"
            />
            <n-button size="small" title="查找下一个" @click="searchNext">
              <template #icon><n-icon :component="ChevronDownOutline" /></template>
            </n-button>
            <n-button size="small" title="查找上一个" @click="searchPrev">
              <template #icon><n-icon :component="ChevronUpOutline" /></template>
            </n-button>
          </n-input-group>
        </div>
      </div>

      <div ref="containerEl" class="term-container" />

      <div v-if="truncated" class="load-more-row">
        <n-button size="small" @click="loadMore">
          加载更多日志 (已加载 {{ loadedLines }}/{{ totalLines }})
        </n-button>
      </div>
    </template>
    <n-empty
      v-else
      description="Select a step from the timeline to view its log."
      size="small"
    />

    <PromptModal v-model:show="showPrompt" :run-id="runId" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { NButton, NEmpty, NIcon, NInput, NInputGroup } from 'naive-ui'
import { ArrowDownOutline, ChevronDownOutline, ChevronUpOutline, PauseOutline } from '@vicons/ionicons5'
import '@xterm/xterm/css/xterm.css'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { useMissionStore } from '@/stores/mission'
import { getLog } from '@/api'
import PromptModal from './PromptModal.vue'

const props = defineProps<{ runId: string }>()

const missionStore = useMissionStore()

const containerEl = ref<HTMLElement | null>(null)
const query = ref('')
const termReady = ref(false)
const totalLines = ref(0)
const loadedLines = ref(0)
const truncated = ref(false)
const logFileName = ref('')
const followTail = ref(false)
const showPrompt = ref(false)

const hasPrompt = computed(() => {
  const name = missionStore.selectedStep
  if (!name) return false
  // Prefer stepLogs (scanned from disk — accurate for both live and historical runs).
  if (missionStore.stepLogs.some((l) => l.step === name && l.type === 'prompt')) return true
  // Fallback: check the step's own promptFile field (set by live SSE events).
  return missionStore.steps.some((s) => s.name === name && !!s.promptFile)
})

// Non-reactive holders: xterm instances are mutable and not serializable.
let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let searchAddon: SearchAddon | null = null
let resizeObserver: ResizeObserver | null = null
let followTimer: ReturnType<typeof setInterval> | null = null

const DEFAULT_TAIL = 500
const TAIL_STEP = 500
const AUTO_REFRESH_INTERVAL_MS = 3000
let tailSize = DEFAULT_TAIL

/** Build query opts for the current selection + accumulated tail. */
function buildOpts(tail: number): { tail: number; file?: string } {
  const opts: { tail: number; file?: string } = { tail }
  const file = missionStore.selectedLogFile
  if (file) opts.file = file
  return opts
}

/** Fetch log for the current step and (re)write the terminal. */
async function fetchAndRender(tailOverride?: number): Promise<void> {
  const step = missionStore.selectedStep
  if (!step || !term) return
  const tail = tailOverride ?? tailSize
  try {
    const data = await getLog(props.runId, step, buildOpts(tail))
    totalLines.value = data.totalLines ?? 0
    loadedLines.value = data.lines?.length ?? 0
    truncated.value = !!data.truncated
    logFileName.value = data.fileName ?? ''
    const text = data.lines?.length ? data.lines.join('\r\n') : '(empty log)'
    term.reset()
    term.write(text)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (term) {
      term.reset()
      if (msg.includes('404')) {
        term.write('无日志')
        logFileName.value = ''
      } else {
        term.write(`Failed to load log: ${msg}`)
      }
    }
    totalLines.value = 0
    loadedLines.value = 0
    truncated.value = false
  }
}

function searchNext(): void {
  if (!searchAddon || !query.value) return
  void searchAddon.findNext(query.value)
}

function searchPrev(): void {
  if (!searchAddon || !query.value) return
  void searchAddon.findPrevious(query.value)
}

function loadMore(): void {
  tailSize += TAIL_STEP
  void fetchAndRender()
}

async function openFullLog(): Promise<void> {
  const step = missionStore.selectedStep
  if (!step) return
  try {
    const data = await getLog(props.runId, step, buildOpts(99999))
    const text = data.lines?.length ? data.lines.join('\n') : '(empty)'
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (w) w.document.title = data.fileName ?? step
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('openFullLog failed:', msg)
  }
}

function toggleFollowTail(): void {
  followTail.value = !followTail.value
  if (followTail.value) {
    followTimer = setInterval(() => {
      void fetchAndRender(DEFAULT_TAIL).then(() => {
        term?.scrollToBottom()
      })
    }, AUTO_REFRESH_INTERVAL_MS)
  } else {
    if (followTimer) {
      clearInterval(followTimer)
      followTimer = null
    }
  }
}

function initTerminal(): void {
  if (!containerEl.value || term) return
  term = new Terminal({
    theme: { background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4' },
    fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
    fontSize: 13,
    scrollback: 10000,
    disableStdin: true,
    convertEol: false,
  })
  fitAddon = new FitAddon()
  searchAddon = new SearchAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(searchAddon)
  term.open(containerEl.value)
  term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && term!.hasSelection()) {
      void navigator.clipboard.writeText(term!.getSelection())
      return false
    }
    return true
  })
  try {
    fitAddon.fit()
  } catch {
    // fit() can throw before layout settles; ResizeObserver will retry.
  }
  termReady.value = true

  resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon?.fit()
    } catch {
      // ignore transient fit failures during teardown
    }
  })
  resizeObserver.observe(containerEl.value)
}

onMounted(() => {
  initTerminal()
  if (missionStore.selectedStep) void fetchAndRender()
})

onUnmounted(() => {
  if (followTimer) {
    clearInterval(followTimer)
    followTimer = null
  }
  resizeObserver?.disconnect()
  term?.dispose()
  term = null
  fitAddon = null
  searchAddon = null
  resizeObserver = null
})

// Step / visit / log-file selection change → reload log.
watch(
  [
    () => missionStore.selectedStep,
    () => missionStore.selectedStepKey,
    () => missionStore.selectedLogFile,
  ],
  async () => {
    if (missionStore.selectedStep && !term) {
      await nextTick()
      initTerminal()
    }
    tailSize = DEFAULT_TAIL
    if (followTimer) {
      clearInterval(followTimer)
      followTimer = null
    }
    const selectedStepName = missionStore.selectedStep
    const stepRunning = selectedStepName
      ? missionStore.steps.some((s) => s.name === selectedStepName && s.status === 'running')
      : false
    if (missionStore.selectedStep && term) void fetchAndRender()
    followTail.value = stepRunning
    if (stepRunning) {
      followTimer = setInterval(() => {
        void fetchAndRender(DEFAULT_TAIL).then(() => {
          term?.scrollToBottom()
        })
      }, AUTO_REFRESH_INTERVAL_MS)
    }
  },
)
</script>

<style scoped>
.log-viewer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.log-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.log-filepath {
  font-size: 12px;
  color: #60a5fa;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.log-filepath:hover {
  text-decoration: underline;
}
.log-linecount {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
}
.log-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.log-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.term-container {
  height: 560px;
  background: #1e1e1e;
  padding: 4px;
  border-radius: 4px;
  overflow: hidden;
}
.load-more-row {
  display: flex;
  justify-content: center;
}
</style>

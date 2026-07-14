<!--
  PromptModal — 用 xterm.js 弹窗展示 Agent Prompt，字体/主题与 LogViewer 一致。
  n-modal 提供遮罩+居中；n-card 提供紧凑框架（size="small" 控制 padding）。
-->
<template>
  <n-modal
    :show="show"
    :mask-closable="true"
    @update:show="$emit('update:show', $event)"
    @after-enter="onAfterEnter"
    @after-leave="onAfterLeave"
  >
    <n-card
      size="small"
      closable
      style="width: min(960px, 95vw)"
      @close="$emit('update:show', false)"
    >
      <template #header>
        <span class="modal-header-title">Agent Prompt</span>
      </template>
      <div v-if="loading" class="modal-loading">
        <n-spin />
      </div>
      <n-empty v-else-if="error" description="No prompt available for this step." size="small" />
      <div v-else class="prompt-body">
        <div class="meta-row">
          <n-text depth="3" class="meta-file">{{ promptFileName }}</n-text>
          <n-text depth="3">{{ charCount }} chars</n-text>
        </div>
        <div ref="promptContainer" class="prompt-term-container" />
      </div>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { NCard, NEmpty, NModal, NSpin, NText } from 'naive-ui'
import '@xterm/xterm/css/xterm.css'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { getPrompt } from '@/api'
import { useMissionStore } from '@/stores/mission'

const props = defineProps<{
  show: boolean
  runId: string
}>()

defineEmits<{
  'update:show': [value: boolean]
}>()

const missionStore = useMissionStore()

const promptContainer = ref<HTMLElement | null>(null)
const loading = ref(false)
const error = ref(false)
const promptFileName = ref('')
const charCount = ref(0)

let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let loaded = false

const TERM_OPTS = {
  theme: { background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4' },
  fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
  fontSize: 13,
  scrollback: 10000,
  disableStdin: true,
  convertEol: false,
}

async function loadAndRender(): Promise<void> {
  const step = missionStore.selectedStep
  if (!step) return
  loading.value = true
  error.value = false

  let text: string
  try {
    const file = missionStore.selectedLogFile ?? undefined
    const data = await getPrompt(props.runId, step, { file })
    promptFileName.value = data.fileName ?? ''
    text = data.lines?.length ? data.lines.join('\r\n') : '(empty)'
    charCount.value = text.length
  } catch {
    error.value = true
    promptFileName.value = ''
    charCount.value = 0
    loading.value = false
    return
  }

  loading.value = false
  await nextTick()
  initTerminal()
  term?.write(text)
  loaded = true
}

function initTerminal(): void {
  if (!promptContainer.value || term) return
  term = new Terminal(TERM_OPTS)
  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(promptContainer.value)
  term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && term!.hasSelection()) {
      void navigator.clipboard.writeText(term!.getSelection())
      return false
    }
    return true
  })
  try { fitAddon.fit() } catch { /* ignore */ }
}

function disposeTerminal(): void {
  term?.dispose()
  term = null
  fitAddon = null
}

function onAfterEnter(): void {
  if (!loaded) {
    void loadAndRender()
  } else {
    void nextTick(() => {
      try { fitAddon?.fit() } catch { /* ignore */ }
    })
  }
}

function onAfterLeave(): void {
  disposeTerminal()
  loaded = false
}

watch(
  () => missionStore.selectedStep,
  () => {
    if (props.show) {
      disposeTerminal()
      loaded = false
      error.value = false
      promptFileName.value = ''
      charCount.value = 0
      void loadAndRender()
    }
  },
)
</script>

<style scoped>
.modal-header-title {
  font-size: 14px;
  font-weight: 600;
  color: #93c5fd;
}
.modal-loading {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}
.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: #1a1a2e;
  border-bottom: 1px solid #334155;
}
.meta-file {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prompt-term-container {
  height: 560px;
  background: #1e1e1e;
  padding: 4px;
  overflow: hidden;
}
</style>

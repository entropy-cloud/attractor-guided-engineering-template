<!--
  ResourceChart — vue-echarts resource monitoring + active process table.
  FSD §4.6. Chart: Free Memory (GB, left axis) / Opencode RSS (GB, left axis) / Opencode Count (right axis).
  Table: latest snapshot's top processes (RSS-sorted).

  Opencode Count replaces the old Process Count — knowing there are 347
  processes on the machine is useless for mission diagnostics; knowing there
  are 3 opencode instances (when only 1 should be running) directly spots
  orphans/stuck spawns.
-->
<template>
  <div class="resource-chart">
    <VChart
      v-if="hasData"
      :option="option"
      autoresize
      class="chart"
    />
    <n-empty
      v-else
      description="暂无资源监控数据"
      size="small"
      class="empty"
    />

    <!-- Active Processes table (latest snapshot) -->
    <div v-if="showProcs && topProcs.length > 0" class="proc-section">
      <div class="proc-head">
        <span class="proc-title">Active Processes</span>
        <span v-if="sysmonStore.latest" class="proc-meta">
          {{ sysmonStore.latest.opencodeCount ?? 0 }} opencode ·
          {{ sysmonStore.latest.nodeCount ?? 0 }} node ·
          {{ sysmonStore.latest.memPressure ?? '—' }}
        </span>
      </div>
      <n-data-table
        :columns="procColumns"
        :data="topProcs"
        :row-key="(p: SysmonTopProc) => p.pid"
        size="small"
        :bordered="false"
        :single-line="false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import { NDataTable, NEmpty, NTag } from 'naive-ui'
import VChart from 'vue-echarts'
import type { EChartsOption } from 'echarts'
import './echarts-setup'
import { useSysmonStore } from '@/stores/sysmon'
import { useMissionStore } from '@/stores/mission'
import type { SysmonTopProc } from '@/types/sysmon'

const sysmonStore = useSysmonStore()
const missionStore = useMissionStore()

const hasData = computed(() => sysmonStore.freeSeries.length > 0)

const topProcs = computed(() => sysmonStore.latest?.topProcs ?? [])

const missionPid = computed(() => missionStore.currentRun?.pid ?? null)

const showProcs = computed(() => {
  const status = missionStore.currentRun?.status
  if (status === 'completed' || status === 'aborted') return false
  if (missionPid.value == null) return false
  return true
})

const procColumns = computed(() => [
  {
    title: 'PID',
    key: 'pid',
    width: 70,
    render: (row: SysmonTopProc) => h('span', { class: 'mono-sm' }, String(row.pid)),
  },
  {
    title: 'Process',
    key: 'name',
    render: (row: SysmonTopProc) => [
      h('span', { class: 'proc-name' }, row.name),
      row.name.match(/opencode/i)
        ? h(NTag, { size: 'tiny', round: true, type: 'info', style: 'margin-left:6px' }, { default: () => 'opencode' })
        : null,
    ],
  },
  {
    title: 'RSS',
    key: 'rss_mb',
    width: 80,
    render: (row: SysmonTopProc) => h('span', { class: 'mono-sm' }, `${row.rss_mb} MB`),
  },
  {
    title: 'CPU',
    key: 'cpu_pct',
    width: 60,
    render: (row: SysmonTopProc) =>
      row.cpu_pct != null ? h('span', { class: 'mono-sm' }, `${row.cpu_pct}%`) : '—',
  },
  {
    title: 'Elapsed',
    key: 'elapsed',
    width: 80,
    render: (row: SysmonTopProc) => row.elapsed || '—',
  },
])

const freeGBSeries = computed<[string, number][]>(() =>
  sysmonStore.freeSeries.map(([ts, mb]) => [ts, +(mb / 1024).toFixed(2)])
)
const rssGBSeries = computed<[string, number][]>(() =>
  sysmonStore.rssSeries.map(([ts, mb]) => [ts, +(mb / 1024).toFixed(2)])
)

const option = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  textStyle: { color: '#cbd5e1' },
  tooltip: { trigger: 'axis' },
  legend: {
    data: ['Free Memory (GB)', 'Opencode RSS (GB)', 'Opencode Count'],
    textStyle: { color: '#cbd5e1' },
    top: 0,
  },
  grid: { left: 56, right: 48, top: 36, bottom: 44 },
  xAxis: {
    type: 'time',
    axisLabel: { color: '#94a3b8' },
    axisLine: { lineStyle: { color: '#334155' } },
  },
  yAxis: [
    {
      type: 'value',
      name: 'GB',
      axisLabel: { color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#1e293b' } },
      nameTextStyle: { color: '#94a3b8' },
    },
    {
      type: 'value',
      name: 'Count',
      axisLabel: { color: '#94a3b8' },
      splitLine: { show: false },
      nameTextStyle: { color: '#94a3b8' },
    },
  ],
  dataZoom: [
    { type: 'inside' },
    { type: 'slider', height: 16, bottom: 6, textStyle: { color: '#94a3b8' } },
  ],
  series: [
    {
      name: 'Free Memory (GB)',
      type: 'line',
      yAxisIndex: 0,
      symbol: 'none',
      itemStyle: { color: '#22c55e' },
      lineStyle: { color: '#22c55e', width: 2 },
      data: freeGBSeries.value,
    },
    {
      name: 'Opencode RSS (GB)',
      type: 'line',
      yAxisIndex: 0,
      symbol: 'none',
      itemStyle: { color: '#3b82f6' },
      lineStyle: { color: '#3b82f6', width: 2, type: 'dashed' },
      data: rssGBSeries.value,
    },
    {
      name: 'Opencode Count',
      type: 'line',
      yAxisIndex: 1,
      symbol: 'circle',
      symbolSize: 4,
      itemStyle: { color: '#f97316' },
      lineStyle: { color: '#f97316', width: 1, type: 'dotted' },
      data: sysmonStore.ocCountSeries,
    },
  ],
}))
</script>

<style scoped>
.resource-chart {
  width: 100%;
}
.chart {
  height: 280px;
}
.empty {
  padding: 24px 0;
}
.proc-section {
  margin-top: 12px;
  border-top: 1px solid #334155;
  padding-top: 8px;
}
.proc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.proc-title {
  font-size: 13px;
  font-weight: 600;
  color: #cbd5e1;
}
.proc-meta {
  font-size: 11px;
  color: #64748b;
}
:deep(.proc-name) {
  font-size: 12px;
}
.mono-sm {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: #94a3b8;
}
</style>

// Pinia store — system monitor snapshots + derived chart series.
// FSD §5.2, §4.6 (ResourceChart).

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SysmonSnapshot } from '@/types/sysmon'
import { getSysmon } from '@/api'

export const useSysmonStore = defineStore('sysmon', () => {
  const snapshots = ref<SysmonSnapshot[]>([])
  const freeSeries = ref<[string, number][]>([])
  const rssSeries = ref<[string, number][]>([])
  const ocCountSeries = ref<[string, number][]>([])

  /** The latest snapshot — used by the process table. */
  const latest = computed(() => {
    const snaps = snapshots.value
    return snaps.length > 0 ? snaps[snaps.length - 1] : null
  })

  /** Append a single snapshot to the store and the derived series (heartbeat). */
  function append(snapshot: SysmonSnapshot): void {
    snapshots.value.push(snapshot)
    const ts = snapshot.ts ?? ''
    if (snapshot.freeGB != null) freeSeries.value.push([ts, snapshot.freeGB * 1024])
    if (snapshot.opencodeRSS_MB != null) rssSeries.value.push([ts, snapshot.opencodeRSS_MB])
    if (snapshot.opencodeCount != null) ocCountSeries.value.push([ts, snapshot.opencodeCount])
  }

  /** Fetch the full sysmon history for a run and rebuild all series. */
  async function fetch(runId: string): Promise<void> {
    try {
      const { snapshots: snaps } = await getSysmon(runId)
      snapshots.value = snaps
      freeSeries.value = snaps
        .filter((s) => s.ts != null && s.freeGB != null)
        .map((s) => [s.ts as string, (s.freeGB as number) * 1024])
      rssSeries.value = snaps
        .filter((s) => s.ts != null && s.opencodeRSS_MB != null)
        .map((s) => [s.ts as string, s.opencodeRSS_MB as number])
      ocCountSeries.value = snaps
        .filter((s) => s.ts != null && s.opencodeCount != null)
        .map((s) => [s.ts as string, s.opencodeCount as number])
    } catch {
      // Graceful degrade: leave existing data intact on fetch failure (FSD §8).
    }
  }

  return {
    snapshots,
    freeSeries,
    rssSeries,
    ocCountSeries,
    latest,
    fetch,
    append,
  }
})

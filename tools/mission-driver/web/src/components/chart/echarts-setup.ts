// Module-level ECharts tree-shaking setup (FSD §3.6 audit A3, NFR-3).
// Imported as a side-effect by ResourceChart.vue so registration runs exactly
// once per module load (NOT per component instance), and the whole echarts
// runtime lands in ResourceChart's chunk — kept out of the entry/first-screen
// bundle because ResourceChart is only reachable via the lazy-loaded RunDetail
// route. Register only the modules the resource chart actually needs.
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  TitleComponent,
} from 'echarts/components'

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  TitleComponent,
])

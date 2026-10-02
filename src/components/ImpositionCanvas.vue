<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Page, Position, SheetSpec, Validation } from '../stores/imposition'

const props = defineProps<{
  positions: Position[]
  pages: Page[]
  spec: SheetSpec
  side: 'front' | 'back'
  zoom: number
  selected: string | null
  validations: Validation[]
}>()

const emit = defineEmits<{
  update: [id: string, patch: Partial<Position>]
  select: [id: string]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const dragging = ref<string | null>(null)
const dragOffset = ref({ x: 0, y: 0 })

const CANVAS_WIDTH = 800
const scale = computed(() => 752 / props.spec.width)
const sheetH = computed(() => props.spec.height * scale.value)
const canvasHeight = computed(() => Math.round(48 + sheetH.value))

function footprint(position: Position) {
  const page = props.pages.find((item) => item.pageNo === position.pageNo)
  const w = (page?.width ?? 210) + props.spec.bleed * 2
  const h = (page?.height ?? 297) + props.spec.bleed * 2
  return position.rotation % 180 !== 0 ? { w: h, h: w } : { w, h }
}

function draw() {
  const element = canvas.value
  if (!element) return
  const ctx = element.getContext('2d')
  if (!ctx) return
  const s = scale.value
  const spec = props.spec
  element.height = canvasHeight.value
  ctx.clearRect(0, 0, CANVAS_WIDTH, canvasHeight.value)
  ctx.fillStyle = '#d7dddf'
  ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight.value)
  ctx.shadowColor = 'rgba(23,45,54,.22)'
  ctx.shadowBlur = 18
  ctx.fillStyle = '#fffefb'
  ctx.fillRect(24, 24, 752, sheetH.value)
  ctx.shadowBlur = 0

  // 纸纹方向参考线
  ctx.save()
  ctx.beginPath()
  ctx.rect(24, 24, 752, sheetH.value)
  ctx.clip()
  ctx.strokeStyle = 'rgba(90,120,128,.10)'
  ctx.lineWidth = 6
  const step = 46
  if (spec.grain === '纵向') {
    for (let x = 24 + step; x < 776; x += step) {
      ctx.beginPath()
      ctx.moveTo(x, 24)
      ctx.lineTo(x, 24 + sheetH.value)
      ctx.stroke()
    }
  } else {
    for (let y = 24 + step; y < 24 + sheetH.value; y += step) {
      ctx.beginPath()
      ctx.moveTo(24, y)
      ctx.lineTo(776, y)
      ctx.stroke()
    }
  }
  ctx.restore()

  // 安全区
  ctx.strokeStyle = '#b8c3c6'
  ctx.setLineDash([5, 5])
  ctx.strokeRect(24 + spec.safe * s, 24 + spec.safe * s, 752 - spec.safe * 2 * s, sheetH.value - spec.safe * 2 * s)
  ctx.setLineDash([])

  // 色彩控制条
  const barY = 24 + sheetH.value - 20
  const barWidth = 752 - 36
  for (let index = 0; index < 7; index += 1) {
    ctx.fillStyle = ['#28a4d8', '#ef3b9b', '#f4d62c', '#1a1a1a', '#30c3aa', '#ef4c36', '#5c67cd'][index]
    ctx.fillRect(42 + index * (barWidth / 7), barY, barWidth / 7, 12)
  }

  ctx.fillStyle = '#26373d'
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText(`${props.side === 'front' ? '正面' : '反面'}拼版版式`, 48, 28)
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#76848a'
  ctx.fillText(`纸张 ${spec.width} × ${spec.height} mm · 出血 ${spec.bleed}mm · 安全区 ${spec.safe}mm · ${spec.binding} · 纸纹${spec.grain}`, 180, 28)

  props.positions.filter((item) => item.front === (props.side === 'front')).forEach((position) => {
    const box = footprint(position)
    const drawW = box.w * s
    const drawH = box.h * s
    const px = 24 + position.x * s
    const py = 24 + position.y * s
    const hasIssue = props.validations.some((issue) => issue.pageNo === position.pageNo)
    ctx.save()
    ctx.translate(px + drawW / 2, py + drawH / 2)
    ctx.rotate((position.rotation * Math.PI) / 180)
    const fw = (position.rotation % 180 !== 0 ? box.h : box.w) * s
    const fh = (position.rotation % 180 !== 0 ? box.w : box.h) * s
    ctx.translate(-fw / 2, -fh / 2)
    if (position.id === props.selected) {
      ctx.shadowColor = 'rgba(31,113,123,.35)'
      ctx.shadowBlur = 14
    }
    ctx.fillStyle = '#f7f7f2'
    ctx.fillRect(0, 0, fw, fh)
    ctx.shadowBlur = 0
    ctx.strokeStyle = hasIssue ? '#c64f35' : '#647c82'
    ctx.lineWidth = position.id === props.selected ? 3 : 1.5
    ctx.strokeRect(0, 0, fw, fh)
    // 出血框
    ctx.strokeStyle = '#df7654'
    ctx.setLineDash([7, 5])
    const bleed = spec.bleed * s
    ctx.strokeRect(-bleed, -bleed, fw + bleed * 2, fh + bleed * 2)
    // 安全区框
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = '#5a9d9b'
    const safe = spec.safe * s
    ctx.strokeRect(safe, safe, fw - safe * 2, fh - safe * 2)
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(48,110,115,.08)'
    ctx.fillRect(safe + 4, safe + 4, fw - safe * 2 - 8, fh - safe * 2 - 8)
    ctx.fillStyle = '#31474e'
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`P${position.pageNo}`, fw / 2, fh / 2 - 6)
    ctx.font = '11px sans-serif'
    ctx.fillStyle = '#718187'
    ctx.fillText(position.rotation ? `旋转 ${position.rotation}°` : '方向 0°', fw / 2, fh / 2 + 16)
    ctx.restore()
  })
}

function toSheet(event: PointerEvent) {
  const element = canvas.value
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * canvasHeight.value,
  }
}

function pointerDown(event: PointerEvent) {
  const canvasElement = canvas.value
  const point = toSheet(event)
  if (!canvasElement || !point) return
  const s = scale.value
  const hit = props.positions
    .filter((item) => item.front === (props.side === 'front'))
    .find((item) => {
      const box = footprint(item)
      const px = 24 + item.x * s
      const py = 24 + item.y * s
      return point.x >= px && point.x <= px + box.w * s && point.y >= py && point.y <= py + box.h * s
    })
  if (!hit) return
  dragging.value = hit.id
  dragOffset.value = { x: point.x - (24 + hit.x * s), y: point.y - (24 + hit.y * s) }
  emit('select', hit.id)
  canvasElement.setPointerCapture(event.pointerId)
}

function pointerMove(event: PointerEvent) {
  if (!dragging.value) return
  const point = toSheet(event)
  if (!point) return
  const s = scale.value
  const position = props.positions.find((item) => item.id === dragging.value)
  if (!position) return
  const box = footprint(position)
  const x = (point.x - 24 - dragOffset.value.x) / s
  const y = (point.y - 24 - dragOffset.value.y) / s
  emit('update', dragging.value, {
    x: Math.max(0, Math.min(props.spec.width - box.w, Math.round(x))),
    y: Math.max(0, Math.min(props.spec.height - box.h, Math.round(y))),
  })
}

onMounted(draw)
watch(() => [props.positions, props.side, props.selected, props.validations, props.spec], draw, { deep: true })
</script>

<template>
  <div class="canvas-wrap" :style="{ width: `${Math.round(800 * zoom / 100)}px` }">
    <canvas
      ref="canvas"
      :width="800"
      :height="canvasHeight"
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="dragging = null"
      @pointercancel="dragging = null"
    />
  </div>
</template>

<style scoped>
.canvas-wrap { width: 800px; max-width: none; transform-origin: left top; transition: width .15s ease; }
canvas { display: block; width: 100%; height: auto; touch-action: none; cursor: grab; }
canvas:active { cursor: grabbing; }
</style>

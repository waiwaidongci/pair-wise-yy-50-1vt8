<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { Page, Position, SheetSpec, Validation } from '../stores/imposition'

const props = defineProps<{
  pages: Page[]
  positions: Position[]
  side: 'front' | 'back'
  zoom: number
  selected: string | null
  validations: Validation[]
  sheetSpec: SheetSpec
}>()

const emit = defineEmits<{
  update: [id: string, patch: Partial<Position>]
  select: [id: string]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const dragging = ref<string | null>(null)
const dragOffset = ref({ x: 0, y: 0 })

const CANVAS_W = 800
const CANVAS_H = 1120

function geometry() {
  const scale = Math.min((CANVAS_W - 40) / props.sheetSpec.width, (CANVAS_H - 40) / props.sheetSpec.height)
  const sheetW = props.sheetSpec.width * scale
  const sheetH = props.sheetSpec.height * scale
  const ox = (CANVAS_W - sheetW) / 2
  const oy = 18
  return { scale, sheetW, sheetH, ox, oy }
}

function pageFootprint(pageNo: number) {
  const page = props.pages.find((item) => item.pageNo === pageNo)
  const bleed = page?.bleed ?? props.sheetSpec.bleed
  const w = (page?.width ?? 210) + bleed * 2
  const h = (page?.height ?? 297) + bleed * 2
  return { w, h, bleed }
}

function draw() {
  const element = canvas.value
  if (!element) return
  const ctx = element.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.fillStyle = '#d7dddf'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  const { scale, sheetW, sheetH, ox, oy } = geometry()

  ctx.shadowColor = 'rgba(23,45,54,.22)'
  ctx.shadowBlur = 18
  ctx.fillStyle = '#fffefb'
  ctx.fillRect(ox, oy, sheetW, sheetH)
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#b8c3c6'
  ctx.setLineDash([5, 5])
  ctx.strokeRect(ox + props.sheetSpec.safe * scale, oy + props.sheetSpec.safe * scale, sheetW - props.sheetSpec.safe * 2 * scale, sheetH - props.sheetSpec.safe * 2 * scale)
  ctx.setLineDash([])

  // 色彩控制条（纸外）
  const stripY = oy + sheetH + 10
  if (stripY + 14 < CANVAS_H) {
    ctx.fillStyle = '#e69a4b'
    ctx.fillRect(ox, stripY, sheetW, 12)
    for (let index = 0; index < 7; index += 1) {
      ctx.fillStyle = ['#28a4d8', '#ef3b9b', '#f4d62c', '#1a1a1a', '#30c3aa', '#ef4c36', '#5c67cd'][index]
      ctx.fillRect(ox + (index * sheetW) / 7, stripY, sheetW / 7, 12)
    }
  }

  ctx.fillStyle = '#26373d'
  ctx.font = 'bold 15px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`${props.side === 'front' ? '正面' : '反面'}拼版版式`, 16, 24)
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#76848a'
  ctx.fillText(`纸张 ${props.sheetSpec.width} × ${props.sheetSpec.height}mm · 出血 ${props.sheetSpec.bleed}mm · 安全区 ${props.sheetSpec.safe}mm · ${props.sheetSpec.grain}纸纹 · ${props.sheetSpec.binding}`, 168, 24)

  props.positions
    .filter((item) => item.front === (props.side === 'front'))
    .forEach((position) => {
      const fp = pageFootprint(position.pageNo)
      const pw = fp.w * scale
      const ph = fp.h * scale
      const x = ox + position.x * scale
      const y = oy + position.y * scale
      const hasIssue = props.validations.some((issue) => issue.pageNo === position.pageNo)
      ctx.save()
      ctx.translate(x + pw / 2, y + ph / 2)
      ctx.rotate((position.rotation * Math.PI) / 180)
      ctx.translate(-pw / 2, -ph / 2)
      if (position.id === props.selected) {
        ctx.shadowColor = 'rgba(31,113,123,.35)'
        ctx.shadowBlur = 14
      }
      // 含出血版位
      ctx.fillStyle = '#f7f7f2'
      ctx.fillRect(0, 0, pw, ph)
      ctx.shadowBlur = 0
      ctx.strokeStyle = hasIssue ? '#c64f35' : '#647c82'
      ctx.lineWidth = position.id === props.selected ? 3 : 1.5
      ctx.strokeRect(0, 0, pw, ph)
      // 出血框
      ctx.strokeStyle = '#df7654'
      ctx.setLineDash([7, 5])
      ctx.strokeRect(-fp.bleed * scale, -fp.bleed * scale, pw + fp.bleed * 2 * scale, ph + fp.bleed * 2 * scale)
      // 成品安全区
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = '#5a9d9b'
      ctx.strokeRect(fp.bleed * scale, fp.bleed * scale, pw - fp.bleed * 2 * scale, ph - fp.bleed * 2 * scale)
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(48,110,115,.08)'
      ctx.fillRect(fp.bleed * scale, fp.bleed * scale, pw - fp.bleed * 2 * scale, ph - fp.bleed * 2 * scale)
      ctx.fillStyle = '#31474e'
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`P${position.pageNo}`, pw / 2, ph / 2 - 10)
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#718187'
      ctx.fillText(position.rotation ? `旋转 ${position.rotation}°` : '方向 0°', pw / 2, ph / 2 + 14)
      ctx.restore()
    })
}

function toMm(event: PointerEvent) {
  const canvasElement = canvas.value
  if (!canvasElement) return null
  const rect = canvasElement.getBoundingClientRect()
  const { scale, ox, oy } = geometry()
  const px = ((event.clientX - rect.left) / rect.width) * CANVAS_W
  const py = ((event.clientY - rect.top) / rect.height) * CANVAS_H
  return { x: (px - ox) / scale, y: (py - oy) / scale }
}

function pointerDown(event: PointerEvent) {
  const mm = toMm(event)
  if (!mm) return
  const hit = props.positions
    .filter((item) => item.front === (props.side === 'front'))
    .find((item) => {
      const fp = pageFootprint(item.pageNo)
      return mm.x >= item.x && mm.x <= item.x + fp.w && mm.y >= item.y && mm.y <= item.y + fp.h
    })
  if (!hit) return
  dragging.value = hit.id
  dragOffset.value = { x: mm.x - hit.x, y: mm.y - hit.y }
  emit('select', hit.id)
  canvas.value?.setPointerCapture(event.pointerId)
}

function pointerMove(event: PointerEvent) {
  if (!dragging.value) return
  const mm = toMm(event)
  if (!mm) return
  const position = props.positions.find((item) => item.id === dragging.value)
  if (!position) return
  const fp = pageFootprint(position.pageNo)
  const { safe, width, height } = props.sheetSpec
  const x = Math.min(Math.max(mm.x - dragOffset.value.x, safe), width - safe - fp.w)
  const y = Math.min(Math.max(mm.y - dragOffset.value.y, safe), height - safe - fp.h)
  emit('update', dragging.value, { x: Math.round(x), y: Math.round(y) })
}

onMounted(draw)
watch(() => [props.positions, props.side, props.selected, props.validations, props.sheetSpec, props.pages], draw, { deep: true })
</script>

<template>
  <div class="canvas-wrap" :style="{ width: `${Math.round((800 * zoom) / 100)}px` }">
    <canvas
      ref="canvas"
      width="800"
      height="1120"
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

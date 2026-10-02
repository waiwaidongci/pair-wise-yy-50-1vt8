import type { Page, Position } from '../stores/imposition'

export type SheetSpec = {
  width: number
  height: number
  bleed: number
  safe: number
  gutter: number
  binding: string
  grain: '纵向' | '横向'
}

export type OverflowItem = {
  pageNo: number
  name: string
  face: '正面' | '反面'
  reason: string
}

export type LayoutOutcome = {
  ok: boolean
  error?: string
  positions: Position[]
  overflow: OverflowItem[]
  columns: number
  rows: number
  capacityPerFace: number
  placedCount: number
  requiredSheets: number
  shortfall: string
  adjusted: { pageNo: number; from: number; to: number }[]
  changedPageNos: number[]
}

export function footprint(page: Page) {
  return { w: page.width + page.bleed * 2, h: page.height + page.bleed * 2 }
}

/**
 * 按新纸张规格重排所有版位：
 * - 含出血 footprint 必须落在纸面内，且与纸边保留 safe mm 安全区
 * - 版位之间留 gutter mm 间距
 * - 纸纹方向：纵向纸纹只允许 0°/180°（轴向与纸长边一致），横向纸纹只允许 90°/270°
 * - 排不下的页面进入 overflow 排队队列，并给出缺口说明
 */
export function layoutPages(pages: Page[], previous: Position[], spec: SheetSpec): LayoutOutcome {
  const positions: Position[] = []
  const overflow: OverflowItem[] = []
  const adjusted: LayoutOutcome['adjusted'] = []
  const changedPageNos: number[] = []

  const fw = Math.max(...pages.map((page) => page.width + page.bleed * 2))
  const fh = Math.max(...pages.map((page) => page.height + page.bleed * 2))

  const usableWidth = spec.width - spec.safe * 2
  const usableHeight = spec.height - spec.safe * 2
  const columns = Math.max(0, Math.floor((usableWidth + spec.gutter) / (fw + spec.gutter)))
  const rows = Math.max(0, Math.floor((usableHeight + spec.gutter) / (fh + spec.gutter)))
  const capacityPerFace = columns * rows

  if (columns < 1 || rows < 1) {
    const minWidth = fw + spec.safe * 2
    const minHeight = fh + spec.safe * 2
    return {
      ok: false,
      error: `新纸 ${spec.width} × ${spec.height}mm 过小：单个含出血版位至少需要 ${minWidth} × ${minHeight}mm（含安全区），无法排版。请加宽纸张或减小出血后重试。`,
      positions: [],
      overflow: [],
      columns,
      rows,
      capacityPerFace: 0,
      placedCount: 0,
      requiredSheets: 0,
      shortfall: '',
      adjusted,
      changedPageNos,
    }
  }

  const allowedRotations = spec.grain === '纵向' ? [0, 180] : [90, 270]

  for (const front of [true, false]) {
    const faceName = front ? '正面' : '反面'
    const facePositions = previous
      .filter((item) => item.front === front)
      .sort((a, b) => a.pageNo - b.pageNo)

    facePositions.forEach((item, index) => {
      const page = pages.find((p) => p.pageNo === item.pageNo)
      if (!page) return
      if (index >= capacityPerFace) {
        overflow.push({
          pageNo: item.pageNo,
          name: page.name,
          face: faceName,
          reason: `新纸 ${spec.width}mm 纸面每面仅 ${columns} 列 × ${rows} 行 = ${capacityPerFace} 个版位，${faceName}第 ${index + 1} 位超出容量`,
        })
        return
      }
      const col = index % columns
      const row = Math.floor(index / columns)
      const x = spec.safe + col * (fw + spec.gutter)
      const y = spec.safe + row * (fh + spec.gutter)
      let rotation = item.rotation
      if (!allowedRotations.includes(rotation)) {
        const from = rotation
        rotation = spec.grain === '纵向' ? 0 : 90
        adjusted.push({ pageNo: item.pageNo, from, to: rotation })
      }
      if (x !== item.x || y !== item.y || rotation !== item.rotation) changedPageNos.push(item.pageNo)
      positions.push({ id: item.id, pageNo: item.pageNo, x, y, rotation, front })
    })
  }

  const placedCount = positions.length
  const requiredSheets = Math.ceil(pages.length / (capacityPerFace * 2))
  const queued = overflow.length
  const shortfall =
    `新纸 ${spec.width} × ${spec.height}mm，按出血 ${spec.bleed}mm、安全区 ${spec.safe}mm、${spec.grain}纸纹排法：` +
    `每面 ${columns} 列 × ${rows} 行 = ${capacityPerFace} 个版位，正反两面共 ${capacityPerFace * 2} 位；` +
    `${pages.length} 个页面需 ${pages.length} 位，缺口 ${Math.max(0, pages.length - capacityPerFace * 2)} 位（需 ${requiredSheets} 张纸 / ${requiredSheets * 2} 个版面）。` +
    (queued ? `P${overflow.map((item) => item.pageNo).join('、P')} 已进入排队队列，增加纸张或调整规格后可重试。` : '全部页面已排下，无排队。')

  return { ok: true, positions, overflow, columns, rows, capacityPerFace, placedCount, requiredSheets, shortfall, adjusted, changedPageNos }
}

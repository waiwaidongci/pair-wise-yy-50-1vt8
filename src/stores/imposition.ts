import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type Page = { pageNo: number; name: string; width: number; height: number; bleed: number; content: string }
export type Position = { id: string; pageNo: number; x: number; y: number; rotation: number; front: boolean }
export type Validation = { id: string; severity: '错误' | '警告'; pageNo?: number; title: string; detail: string }
export type ProofBaseline = Record<string, { x: number; y: number; rotation: number; bleed: number }>
export type Proof = { id: string; round: number; date: string; sample: string; deltaE: number; feedback: string; correction: string; owner: string; decision: '待决定' | '通过' | '退回'; baseline?: ProofBaseline }
export type ExportTask = { id: string; name: string; progress: number; status: '排队中' | '生成中' | '已完成' | '已中断'; updatedAt: string; resumable: boolean }
export type SheetSpec = { width: number; height: number; bleed: number; safe: number; gutter: number; binding: string; grain: '纵向' | '横向' }
export type Snapshot = { id: string; revision: string; createdAt: string; reason: string; spec: SheetSpec; positions: Position[]; proofs: Proof[] }
export type QueuedPage = { pageNo: number; name: string; reason: string }
export type LayoutPlan = {
  feasible: boolean
  cols: number
  rows: number
  perSide: number
  capacity: number
  required: number
  rotation: 0 | 90
  placements: Position[]
  queued: QueuedPage[]
  notes: string[]
  problem?: string
}
export type PaperChangeState = {
  status: 'idle' | 'preview' | 'failed'
  target: SheetSpec
  plan: LayoutPlan | null
  error: string | null
  snapshotId: string | null
}
export type ConflictEntry = { id: string; pageNo: number; mine: Position | null; theirs: Position | null }
export type ConflictState = { revision: string; savedBy: string; savedAt: string; conflicts: ConflictEntry[]; autoMerged: number }

type CommittedState = {
  pages: Page[]
  positions: Position[]
  proofs: Proof[]
  tasks: ExportTask[]
  revision: string
  locked: boolean
  sheetSpec: SheetSpec
  snapshots: Snapshot[]
  paperQueue: QueuedPage[]
  saveToken?: string
  savedBy?: string
  savedAt?: string
}

const COMMIT_KEY = 'print-imposition-v1'
const DRAFT_KEY = 'print-imposition-v1-draft'

const seedSpec: SheetSpec = {
  width: 720,
  height: 1020,
  bleed: 3,
  safe: 5,
  gutter: 6,
  binding: '骑马订',
  grain: '纵向',
}

const seedPages: Page[] = [
  { pageNo: 1, name: '封面', width: 210, height: 297, bleed: 3, content: '潮汐来信 / 节目册' },
  { pageNo: 2, name: '版权页', width: 210, height: 297, bleed: 2, content: '版权与演职人员' },
  { pageNo: 3, name: '序言', width: 210, height: 297, bleed: 3, content: '导演手记' },
  { pageNo: 4, name: '剧照跨页左', width: 210, height: 297, bleed: 3, content: '第一幕剧照' },
  { pageNo: 5, name: '剧照跨页右', width: 210, height: 297, bleed: 3, content: '第一幕剧照延伸' },
  { pageNo: 6, name: '曲目表', width: 210, height: 297, bleed: 3, content: '曲目与时长' },
  { pageNo: 7, name: '创作团队', width: 210, height: 297, bleed: 1, content: '主创与制作团队' },
  { pageNo: 8, name: '封底', width: 210, height: 297, bleed: 3, content: '巡演信息' },
]

const seedPositions: Position[] = [
  { id: 'P-01', pageNo: 8, x: 34, y: 44, rotation: 0, front: true },
  { id: 'P-02', pageNo: 1, x: 372, y: 44, rotation: 180, front: true },
  { id: 'P-03', pageNo: 6, x: 34, y: 548, rotation: 180, front: true },
  { id: 'P-04', pageNo: 3, x: 372, y: 548, rotation: 0, front: true },
  { id: 'P-05', pageNo: 2, x: 34, y: 44, rotation: 0, front: false },
  { id: 'P-06', pageNo: 7, x: 372, y: 44, rotation: 180, front: false },
  { id: 'P-07', pageNo: 4, x: 34, y: 548, rotation: 0, front: false },
  { id: 'P-08', pageNo: 5, x: 372, y: 548, rotation: 180, front: false },
]

const seedProofs: Proof[] = [
  { id: 'PRF-01', round: 1, date: '2026-09-18', sample: '数字样张 v1', deltaE: 3.8, feedback: '封面夜空蓝偏紫，剧照暗部层次压缩。', correction: '调整 CMYK 曲线，黑色通道减少 4%。', owner: '周默 / 色彩管理', decision: '退回' },
  { id: 'PRF-02', round: 2, date: '2026-09-25', sample: '数字样张 v2', deltaE: 1.9, feedback: '整体色差改善，P7 出血仍不足。', correction: '重排 P7 版位并增加 2mm 出血。', owner: '林青 / 拼版', decision: '待决定' },
  { id: 'PRF-03', round: 3, date: '2026-09-29', sample: '数字样张 v3', deltaE: 1.6, feedback: '封面色差达标，版式、出血与折手均确认无误。', correction: '无需修正，同意按当前版位付印。', owner: '周默 / 色彩管理', decision: '通过' },
]

const seedTasks: ExportTask[] = [
  { id: 'EXP-0925-01', name: '印刷交付包 · PDF/X-4', progress: 72, status: '已中断', updatedAt: '09-25 16:42', resumable: true },
  { id: 'EXP-0925-02', name: '数字样张低分辨率预览', progress: 100, status: '已完成', updatedAt: '09-25 15:18', resumable: false },
]

function readCommitted(): CommittedState | null {
  const raw = localStorage.getItem(COMMIT_KEY)
  return raw ? (JSON.parse(raw) as CommittedState) : null
}

function eqPosition(a: Position | null | undefined, b: Position | null | undefined) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.pageNo === b.pageNo && a.x === b.x && a.y === b.y && a.rotation === b.rotation && a.front === b.front
}

export const useImpositionStore = defineStore('imposition', () => {
  const committed = readCommitted()
  const draftRaw = localStorage.getItem(DRAFT_KEY)
  const draft = draftRaw ? (JSON.parse(draftRaw) as Partial<CommittedState>) : null

  const pages = ref<Page[]>(draft?.pages ?? committed?.pages ?? structuredClone(seedPages))
  const positions = ref<Position[]>(draft?.positions ?? committed?.positions ?? structuredClone(seedPositions))
  const proofs = ref<Proof[]>(draft?.proofs ?? committed?.proofs ?? structuredClone(seedProofs))
  const tasks = ref<ExportTask[]>(draft?.tasks ?? committed?.tasks ?? structuredClone(seedTasks))
  const sheetSpec = ref<SheetSpec>(draft?.sheetSpec ?? committed?.sheetSpec ?? structuredClone(seedSpec))
  const snapshots = ref<Snapshot[]>(draft?.snapshots ?? committed?.snapshots ?? [])
  const paperQueue = ref<QueuedPage[]>(draft?.paperQueue ?? committed?.paperQueue ?? [])
  const side = ref<'front' | 'back'>('front')
  const zoom = ref(72)
  const revision = ref(draft?.revision ?? committed?.revision ?? 'R6')
  const locked = ref(draft?.locked ?? committed?.locked ?? false)
  const selectedPosition = ref<string | null>(null)
  const selectedProof = ref('PRF-02')

  // —— 并发协作：本机操作员、正式版本同步标记 ——
  const operator = '陈舟 / 拼版员'
  const saveToken = ref(committed?.saveToken ?? `T-${Date.now().toString(36)}-init`)
  const lastSyncedToken = ref(committed?.saveToken ?? saveToken.value)
  const basePositions = ref<Position[]>(structuredClone(committed?.positions ?? positions.value))
  const conflictState = ref<ConflictState | null>(null)
  const remotePending = ref(false)

  // —— 换纸流程状态 ——
  const paperChange = ref<PaperChangeState>({
    status: 'idle',
    target: structuredClone(sheetSpec.value),
    plan: null,
    error: null,
    snapshotId: null,
  })

  // —— 打样基线：通过时记录版位快照，之后位置/旋转/出血任一变动即失效 ——
  function captureBaseline(): ProofBaseline {
    const map: ProofBaseline = {}
    for (const position of positions.value) {
      const page = pages.value.find((item) => item.pageNo === position.pageNo)
      map[String(position.pageNo)] = { x: position.x, y: position.y, rotation: position.rotation, bleed: page?.bleed ?? 0 }
    }
    return map
  }

  proofs.value.forEach((proof) => {
    if (proof.decision === '通过' && !proof.baseline) proof.baseline = captureBaseline()
  })

  const proofInvalidations = computed<Record<string, number[]>>(() => {
    const result: Record<string, number[]> = {}
    for (const proof of proofs.value) {
      if (proof.decision !== '通过' || !proof.baseline) continue
      const changed: number[] = []
      for (const [pageNo, base] of Object.entries(proof.baseline)) {
        const position = positions.value.find((item) => String(item.pageNo) === pageNo)
        const page = pages.value.find((item) => String(item.pageNo) === pageNo)
        if (!position || position.x !== base.x || position.y !== base.y || position.rotation !== base.rotation || (page?.bleed ?? 0) !== base.bleed) {
          changed.push(Number(pageNo))
        }
      }
      if (changed.length) result[proof.id] = changed
    }
    return result
  })

  function reconfirmProof(id: string) {
    const proof = proofs.value.find((item) => item.id === id)
    if (proof && proof.decision === '通过') proof.baseline = captureBaseline()
  }

  // —— 预检：随纸张规格动态判定 ——
  function positionBox(position: Position) {
    const page = pages.value.find((item) => item.pageNo === position.pageNo)
    const w = (page?.width ?? 210) + sheetSpec.value.bleed * 2
    const h = (page?.height ?? 297) + sheetSpec.value.bleed * 2
    return position.rotation % 180 !== 0 ? { w: h, h: w } : { w, h }
  }

  const validations = computed<Validation[]>(() => {
    const issues: Validation[] = []
    const spec = sheetSpec.value
    const queuedNos = new Set(paperQueue.value.map((item) => item.pageNo))
    const placedPages = positions.value.map((position) => position.pageNo)
    pages.value.forEach((page) => {
      if (!placedPages.includes(page.pageNo) && !queuedNos.has(page.pageNo)) issues.push({ id: `missing-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 尚未拼版`, detail: `${page.name} 未出现在正反版位中。` })
      if (page.bleed < spec.bleed) issues.push({ id: `bleed-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 出血不足`, detail: `页面出血 ${page.bleed}mm，低于印刷要求 ${spec.bleed}mm。` })
    })
    positions.value.forEach((position) => {
      const box = positionBox(position)
      if (position.x < spec.safe || position.y < spec.safe || position.x + box.w > spec.width - spec.safe || position.y + box.h > spec.height - spec.safe) {
        issues.push({ id: `bounds-${position.id}`, severity: '错误', pageNo: position.pageNo, title: `${position.id} 超出纸面安全区`, detail: `版位含出血需落在 ${spec.width}×${spec.height}mm 纸面内缩 ${spec.safe}mm 的安全区内。` })
      }
      const rotated = position.rotation % 180 !== 0
      if ((spec.grain === '纵向' && rotated) || (spec.grain === '横向' && !rotated)) {
        issues.push({ id: `grain-${position.id}`, severity: '警告', pageNo: position.pageNo, title: `${position.id} 与纸纹方向不符`, detail: `${spec.grain}纸纹下版位应${spec.grain === '纵向' ? '正向或 180°' : '旋转 90°/270°'}，当前为 ${position.rotation}°。` })
      }
    })
    for (let index = 0; index < positions.value.length; index += 1) {
      for (let next = index + 1; next < positions.value.length; next += 1) {
        const a = positions.value[index]
        const b = positions.value[next]
        if (a.front !== b.front) continue
        const boxA = positionBox(a)
        const boxB = positionBox(b)
        if (a.x < b.x + boxB.w && b.x < a.x + boxA.w && a.y < b.y + boxB.h && b.y < a.y + boxA.h) {
          issues.push({ id: `overlap-${a.id}-${b.id}`, severity: '错误', pageNo: a.pageNo, title: `${a.id} 与 ${b.id} 版位重叠`, detail: '当前纸张尺寸下页面之间不足安全间隙。' })
        }
      }
    }
    const frontOrder = positions.value.filter((item) => item.front).sort((a, b) => a.x - b.x || a.y - b.y).map((item) => item.pageNo)
    if (frontOrder.length && frontOrder[0] !== 1) issues.push({ id: 'binding-order', severity: '警告', pageNo: 1, title: '骑马订正版页序需要复核', detail: `当前首位为 P${frontOrder[0]}，装订方向规则期望封面位于首版位。` })
    paperQueue.value.forEach((item) => {
      issues.push({ id: `queued-${item.pageNo}`, severity: '警告', pageNo: item.pageNo, title: `P${item.pageNo} 排队等待纸面`, detail: item.reason })
    })
    return issues
  })

  // —— 持久化：工作草稿自动保存；正式版本仅通过保存/换纸提交写入，避免覆盖他人版本 ——
  watch([pages, positions, proofs, tasks, revision, locked, sheetSpec, snapshots, paperQueue], () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      pages: pages.value,
      positions: positions.value,
      proofs: proofs.value,
      tasks: tasks.value,
      revision: revision.value,
      locked: locked.value,
      sheetSpec: sheetSpec.value,
      snapshots: snapshots.value,
      paperQueue: paperQueue.value,
    }))
  }, { deep: true })

  function writeCommitted() {
    const state: CommittedState = {
      pages: pages.value,
      positions: positions.value,
      proofs: proofs.value,
      tasks: tasks.value,
      revision: revision.value,
      locked: locked.value,
      sheetSpec: sheetSpec.value,
      snapshots: snapshots.value,
      paperQueue: paperQueue.value,
      saveToken: saveToken.value,
      savedBy: operator,
      savedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    }
    localStorage.setItem(COMMIT_KEY, JSON.stringify(state))
  }

  function commitState() {
    saveToken.value = `T-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    lastSyncedToken.value = saveToken.value
    writeCommitted()
    basePositions.value = structuredClone(positions.value)
    remotePending.value = false
  }

  function nextRevision(from?: string) {
    const source = from ?? revision.value
    return `R${Number(source.slice(1)) + 1}`
  }

  function buildConflict(remote: CommittedState): ConflictState {
    const theirs = remote.positions ?? []
    const ids = new Set([...positions.value.map((item) => item.id), ...theirs.map((item) => item.id)])
    const conflicts: ConflictEntry[] = []
    let autoMerged = 0
    ids.forEach((id) => {
      const mine = positions.value.find((item) => item.id === id) ?? null
      const their = theirs.find((item) => item.id === id) ?? null
      const base = basePositions.value.find((item) => item.id === id) ?? null
      const myChanged = !eqPosition(mine, base)
      const theirChanged = !eqPosition(their, base)
      if (myChanged && theirChanged && !eqPosition(mine, their)) conflicts.push({ id, pageNo: (mine ?? their)?.pageNo ?? 0, mine, theirs: their })
      else if (myChanged) autoMerged += 1
    })
    return { revision: remote.revision, savedBy: remote.savedBy ?? '另一拼版员', savedAt: remote.savedAt ?? '', conflicts, autoMerged }
  }

  /** 将对方已保存版本与本地不冲突的改动合并，冲突版位一律保留对方。 */
  function mergeWithRemote(remote: CommittedState, conflictIds: Set<string>) {
    const theirs = remote.positions ?? []
    const merged = theirs.map((their) => {
      const base = basePositions.value.find((item) => item.id === their.id) ?? null
      const mine = positions.value.find((item) => item.id === their.id)
      if (mine && !eqPosition(mine, base) && !conflictIds.has(their.id)) return structuredClone(mine)
      return structuredClone(their)
    })
    positions.value.forEach((mine) => {
      if (!theirs.some((their) => their.id === mine.id) && !conflictIds.has(mine.id)) merged.push(structuredClone(mine))
    })
    positions.value = merged
  }

  /** 保存拼版版本。返回 false 表示检测到他人新版本且存在冲突，需先处理冲突清单。 */
  function saveRevision(): boolean {
    const remote = readCommitted()
    if (remote?.saveToken && remote.saveToken !== lastSyncedToken.value) {
      const conflict = buildConflict(remote)
      if (conflict.conflicts.length) {
        conflictState.value = conflict
        return false
      }
      mergeWithRemote(remote, new Set())
    }
    revision.value = nextRevision(remote?.revision && remote.saveToken !== lastSyncedToken.value ? remote.revision : undefined)
    commitState()
    return true
  }

  function resolveConflict(strategy: 'merge' | 'theirs') {
    const remote = readCommitted()
    const pending = conflictState.value
    conflictState.value = null
    if (!remote) return
    if (strategy === 'theirs') {
      positions.value = structuredClone(remote.positions ?? [])
      sheetSpec.value = remote.sheetSpec ?? sheetSpec.value
      paperQueue.value = remote.paperQueue ?? []
      revision.value = remote.revision
      lastSyncedToken.value = remote.saveToken ?? lastSyncedToken.value
      basePositions.value = structuredClone(remote.positions ?? [])
      remotePending.value = false
      return
    }
    mergeWithRemote(remote, new Set(pending?.conflicts.map((item) => item.id) ?? []))
    revision.value = nextRevision(remote.revision)
    commitState()
  }

  /** 演示：模拟另一名拼版员保存了新版本。 */
  function simulateColleagueSave() {
    const remote = readCommitted() ?? {
      pages: pages.value,
      positions: positions.value,
      proofs: proofs.value,
      tasks: tasks.value,
      revision: revision.value,
      locked: locked.value,
      sheetSpec: sheetSpec.value,
      snapshots: snapshots.value,
      paperQueue: paperQueue.value,
    }
    const theirs = structuredClone(remote.positions)
    if (theirs[0]) theirs[0] = { ...theirs[0], x: Math.round(theirs[0].x + 18), y: Math.round(theirs[0].y + 12) }
    if (theirs[1]) theirs[1] = { ...theirs[1], rotation: (theirs[1].rotation + 180) % 360 }
    const next: CommittedState = {
      ...remote,
      positions: theirs,
      revision: nextRevision(remote.revision),
      saveToken: `T-${Date.now().toString(36)}-colleague`,
      savedBy: '王婷 / 拼版员',
      savedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    }
    localStorage.setItem(COMMIT_KEY, JSON.stringify(next))
    remotePending.value = true
  }

  window.addEventListener('storage', (event) => {
    if (event.key === COMMIT_KEY) remotePending.value = true
  })

  // —— 换纸：快照、重排、排队、失败重试 ——
  function createSnapshot(reason: string) {
    const snapshot: Snapshot = {
      id: `SNAP-${Date.now().toString(36)}-${snapshots.value.length + 1}`,
      revision: revision.value,
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      reason,
      spec: structuredClone(sheetSpec.value),
      positions: structuredClone(positions.value),
      proofs: structuredClone(proofs.value),
    }
    snapshots.value.unshift(snapshot)
    return snapshot
  }

  function computeLayout(spec: SheetSpec): LayoutPlan {
    const maxWidth = Math.max(...pages.value.map((page) => page.width))
    const maxHeight = Math.max(...pages.value.map((page) => page.height))
    const rotate = spec.grain === '横向'
    const cellW = (rotate ? maxHeight : maxWidth) + spec.bleed * 2
    const cellH = (rotate ? maxWidth : maxHeight) + spec.bleed * 2
    const usableW = spec.width - spec.safe * 2
    const usableH = spec.height - spec.safe * 2
    const cols = Math.floor((usableW + spec.gutter) / (cellW + spec.gutter))
    const rows = Math.floor((usableH + spec.gutter) / (cellH + spec.gutter))
    const perSide = cols * rows
    const capacity = perSide * 2
    const required = pages.value.length
    const notes: string[] = []
    if (perSide === 0) {
      return {
        feasible: false,
        cols,
        rows,
        perSide,
        capacity,
        required,
        rotation: rotate ? 90 : 0,
        placements: [],
        queued: [],
        notes,
        problem: `新纸幅 ${spec.width}×${spec.height}mm 扣除 ${spec.safe}mm 安全区后可排 ${cols}×${rows} 个版位，连一个 ${cellW}×${cellH}mm（含 ${spec.bleed}mm 出血）的版位都放不下，换纸失败。`,
      }
    }
    notes.push(`纸纹${spec.grain}：版位${rotate ? '统一旋转 90° 顺纹' : '正向顺纹'}排列，单元 ${cellW}×${cellH}mm（含 ${spec.bleed}mm 出血、${spec.gutter}mm 间隙）。`)
    notes.push(`每面 ${cols}×${rows}=${perSide} 个版位，正反共 ${capacity} 位；本次需排 ${required} 页。`)
    const placements: Position[] = []
    const queued: QueuedPage[] = []
    const sorted = [...pages.value].sort((a, b) => a.pageNo - b.pageNo)
    sorted.forEach((page, index) => {
      if (index >= capacity) {
        queued.push({
          pageNo: page.pageNo,
          name: page.name,
          reason: `新纸面正反仅容 ${capacity} 位，本页排第 ${index + 1} 位，缺口 ${required - capacity} 位，等待加纸或并入下一版。`,
        })
        return
      }
      const sideIndex = Math.floor(index / perSide)
      const cell = index % perSide
      const col = cell % cols
      const row = Math.floor(cell / cols)
      const existing = positions.value.find((item) => item.pageNo === page.pageNo)
      placements.push({
        id: existing?.id ?? `P-N${page.pageNo}`,
        pageNo: page.pageNo,
        x: spec.safe + col * (cellW + spec.gutter),
        y: spec.safe + row * (cellH + spec.gutter),
        rotation: rotate ? 90 : 0,
        front: sideIndex === 0,
      })
    })
    if (queued.length) {
      notes.push(`缺口 ${required - capacity} 位：${queued.map((item) => `P${item.pageNo}`).join('、')} 排队，需追加 ${Math.ceil((required - capacity) / perSide)} 个纸面或等待下一版。`)
    }
    const rotationChanged = positions.value.some((item) => item.rotation !== (rotate ? 90 : 0))
    if (rotationChanged) notes.push('部分版位旋转角度将变化，已通过打样的页面结论会失效，需重新确认。')
    return { feasible: true, cols, rows, perSide, capacity, required, rotation: rotate ? 90 : 0, placements, queued, notes }
  }

  function startPaperChange(target: SheetSpec) {
    if (!paperChange.value.snapshotId) {
      const snapshot = createSnapshot(`换纸前快照 · ${sheetSpec.value.width}×${sheetSpec.value.height}mm ${sheetSpec.value.grain}纸纹`)
      paperChange.value.snapshotId = snapshot.id
    }
    paperChange.value.target = structuredClone(target)
    paperChange.value.plan = computeLayout(target)
    paperChange.value.status = 'preview'
    paperChange.value.error = null
  }

  function applyPaperChange() {
    const pending = paperChange.value
    if (!pending.plan) pending.plan = computeLayout(pending.target)
    if (!pending.plan.feasible) {
      pending.status = 'failed'
      pending.error = pending.plan.problem ?? '新纸幅无法容纳任何版位，换纸失败。原快照已保留，可调整纸幅后重试。'
      return
    }
    const remote = readCommitted()
    if (remote?.saveToken && remote.saveToken !== lastSyncedToken.value) {
      const conflict = buildConflict(remote)
      if (conflict.conflicts.length) {
        conflictState.value = conflict
        return // 保持 preview，待冲突解决后重新应用
      }
      revision.value = remote.revision
    }
    sheetSpec.value = structuredClone(pending.target)
    positions.value = structuredClone(pending.plan.placements)
    paperQueue.value = structuredClone(pending.plan.queued)
    revision.value = nextRevision()
    paperChange.value = { status: 'idle', target: structuredClone(sheetSpec.value), plan: null, error: null, snapshotId: null }
    commitState()
  }

  function rollbackPaperChange() {
    const snapshot = snapshots.value.find((item) => item.id === paperChange.value.snapshotId)
    if (snapshot) {
      sheetSpec.value = structuredClone(snapshot.spec)
      positions.value = structuredClone(snapshot.positions)
      paperQueue.value = []
    }
    paperChange.value = { status: 'idle', target: structuredClone(sheetSpec.value), plan: null, error: null, snapshotId: null }
  }

  function cancelPaperChange() {
    paperChange.value = { status: 'idle', target: structuredClone(sheetSpec.value), plan: null, error: null, snapshotId: null }
  }

  function restoreSnapshot(id: string) {
    const snapshot = snapshots.value.find((item) => item.id === id)
    if (!snapshot) return
    sheetSpec.value = structuredClone(snapshot.spec)
    positions.value = structuredClone(snapshot.positions)
    paperQueue.value = []
    revision.value = nextRevision()
    commitState()
  }

  // —— 版位与打样常规操作 ——
  function updatePosition(id: string, patch: Partial<Position>) {
    if (locked.value) return
    const position = positions.value.find((item) => item.id === id)
    if (position) Object.assign(position, patch)
  }

  function addPosition(pageNo: number) {
    if (locked.value || positions.value.some((item) => item.pageNo === pageNo && item.front === (side.value === 'front'))) return
    positions.value.push({ id: `P-${Date.now().toString().slice(-3)}`, pageNo, x: sheetSpec.value.safe, y: sheetSpec.value.safe, rotation: 0, front: side.value === 'front' })
  }

  function updateProof(id: string, patch: Partial<Proof>) {
    const proof = proofs.value.find((item) => item.id === id)
    if (!proof) return
    Object.assign(proof, patch)
    if (patch.decision === '通过') proof.baseline = captureBaseline()
  }

  function createProof() {
    proofs.value.push({ id: `PRF-${String(proofs.value.length + 1).padStart(2, '0')}`, round: proofs.value.length + 1, date: new Date().toISOString().slice(0, 10), sample: `数字样张 v${proofs.value.length + 1}`, deltaE: 0, feedback: '', correction: '', owner: '当前用户', decision: '待决定' })
  }

  function lockBaseline() {
    locked.value = true
    revision.value = nextRevision()
  }

  function unlock() {
    locked.value = false
  }

  function resumeTask(id: string) {
    const task = tasks.value.find((item) => item.id === id)
    if (task && task.resumable) {
      task.status = '生成中'
      task.progress = Math.max(task.progress, 10)
      task.updatedAt = '刚刚'
    }
  }

  return {
    pages, positions, proofs, tasks, sheetSpec, snapshots, paperQueue,
    side, zoom, revision, locked, selectedPosition, selectedProof,
    validations, proofInvalidations, operator,
    conflictState, remotePending, paperChange,
    updatePosition, addPosition, updateProof, createProof, reconfirmProof,
    lockBaseline, unlock, resumeTask,
    saveRevision, resolveConflict, simulateColleagueSave,
    createSnapshot, restoreSnapshot, computeLayout,
    startPaperChange, applyPaperChange, rollbackPaperChange, cancelPaperChange,
  }
})

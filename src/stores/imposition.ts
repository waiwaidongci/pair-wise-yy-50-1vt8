import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { impositionApi, diffPositions, type ConflictItem, type ServerState } from '../api/impositionApi'
import { layoutPages, type SheetSpec, type LayoutOutcome } from '../utils/impositionLayout'

export type Page = { pageNo: number; name: string; width: number; height: number; bleed: number; content: string }
export type Position = { id: string; pageNo: number; x: number; y: number; rotation: number; front: boolean }
export type Validation = { id: string; severity: '错误' | '警告'; pageNo?: number; title: string; detail: string }
export type Proof = {
  id: string
  round: number
  date: string
  sample: string
  deltaE: number
  feedback: string
  correction: string
  owner: string
  decision: '待决定' | '通过' | '退回'
  pages: number[]
  invalid?: boolean
  invalidReason?: string
  confirmedAt?: string
}
export type ExportTask = { id: string; name: string; progress: number; status: '排队中' | '生成中' | '已完成' | '已中断'; updatedAt: string; resumable: boolean }
export type Snapshot = {
  id: string
  createdAt: string
  reason: string
  revision: string
  note: string
  sheetSpec: SheetSpec
  positions: Position[]
  proofs: Proof[]
}
export type { SheetSpec } from '../utils/impositionLayout'

const seedSheet: SheetSpec = { width: 720, height: 1020, bleed: 3, safe: 5, gutter: 6, binding: '骑马订', grain: '纵向' }

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

// 版位坐标单位为 mm，原点为纸面左上角（含安全区）
const seedPositions: Position[] = [
  { id: 'P-01', pageNo: 8, x: 30, y: 30, rotation: 0, front: true },
  { id: 'P-02', pageNo: 1, x: 282, y: 30, rotation: 180, front: true },
  { id: 'P-03', pageNo: 6, x: 30, y: 387, rotation: 180, front: true },
  { id: 'P-04', pageNo: 3, x: 282, y: 387, rotation: 0, front: true },
  { id: 'P-05', pageNo: 2, x: 30, y: 30, rotation: 0, front: false },
  { id: 'P-06', pageNo: 7, x: 282, y: 30, rotation: 180, front: false },
  { id: 'P-07', pageNo: 4, x: 30, y: 387, rotation: 0, front: false },
  { id: 'P-08', pageNo: 5, x: 282, y: 387, rotation: 180, front: false },
]

const seedProofs: Proof[] = [
  { id: 'PRF-01', round: 1, date: '2026-09-18', sample: '数字样张 v1', deltaE: 3.8, feedback: '封面夜空蓝偏紫，剧照暗部层次压缩。', correction: '调整 CMYK 曲线，黑色通道减少 4%。', owner: '周默 / 色彩管理', decision: '退回', pages: [1, 8] },
  { id: 'PRF-02', round: 2, date: '2026-09-25', sample: '数字样张 v2', deltaE: 1.9, feedback: '整体色差改善，P7 出血仍不足。', correction: '重排 P7 版位并增加 2mm 出血。', owner: '林青 / 拼版', decision: '待决定', pages: [1, 3, 7, 8] },
  { id: 'PRF-03', round: 3, date: '2026-09-28', sample: '数字样张 v3', deltaE: 1.6, feedback: '内页色差合格，跨页色彩过渡自然。', correction: '确认可进入拼版锁定。', owner: '周默 / 色彩管理', decision: '通过', pages: [2, 4, 5, 6] },
]

const seedTasks: ExportTask[] = [
  { id: 'EXP-0925-01', name: '印刷交付包 · PDF/X-4', progress: 72, status: '已中断', updatedAt: '09-25 16:42', resumable: true },
  { id: 'EXP-0925-02', name: '数字样张低分辨率预览', progress: 100, status: '已完成', updatedAt: '09-25 15:18', resumable: false },
]

type PersistShape = {
  pages: Page[]
  positions: Position[]
  proofs: Proof[]
  tasks: ExportTask[]
  revision: string
  locked: boolean
  sheetSpec: SheetSpec
  snapshots: Snapshot[]
  serverRevision: number
  basePositions: Position[]
}

function restore(): Partial<PersistShape> {
  try {
    const raw = localStorage.getItem('print-imposition-v1')
    return raw ? (JSON.parse(raw) as Partial<PersistShape>) : {}
  } catch {
    return {}
  }
}

function migrateProofs(proofs: Proof[]): Proof[] {
  return proofs.map((proof) => ({ ...proof, pages: proof.pages ?? [] }))
}

export const useImpositionStore = defineStore('imposition', () => {
  const saved = restore()
  const pages = ref<Page[]>(saved.pages ?? structuredClone(seedPages))
  const positions = ref<Position[]>(saved.positions ?? structuredClone(seedPositions))
  const proofs = ref<Proof[]>(migrateProofs(saved.proofs ?? structuredClone(seedProofs)))
  const tasks = ref<ExportTask[]>(saved.tasks ?? structuredClone(seedTasks))
  const sheetSpec = ref<SheetSpec>(saved.sheetSpec ?? { ...seedSheet })
  const snapshots = ref<Snapshot[]>(saved.snapshots ?? [])
  const side = ref<'front' | 'back'>('front')
  const zoom = ref(72)
  const revision = ref(saved.revision ?? 'R6')
  const locked = ref(saved.locked ?? false)
  const selectedPosition = ref<string | null>(null)
  const selectedProof = ref('PRF-02')

  // 并发控制：serverRevision 为本地已知的服务器最新版本，basePositions 为该版本下的版位
  const serverRevision = ref(saved.serverRevision ?? 6)
  const basePositions = ref<Position[]>(saved.basePositions ?? structuredClone(seedPositions))
  const conflict = ref<{ serverRevision: number; positions: Position[]; conflicts: ConflictItem[] } | null>(null)
  const peerNotice = ref('')

  // 换纸
  const changingPaper = ref(false)
  const paperOutcome = ref<LayoutOutcome | null>(null)
  const lastPaperSpec = ref<SheetSpec | null>(null)
  const lastSnapshotId = ref<string | null>(null)

  const currentUser = ref('我（拼版员）')

  const validations = computed<Validation[]>(() => {
    const issues: Validation[] = []
    const placedPages = positions.value.map((position) => position.pageNo)
    pages.value.forEach((page) => {
      if (!placedPages.includes(page.pageNo)) issues.push({ id: `missing-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 尚未拼版`, detail: `${page.name} 未出现在正反版位中。` })
      if (page.bleed < sheetSpec.value.bleed) issues.push({ id: `bleed-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 出血不足`, detail: `页面出血 ${page.bleed}mm，低于印刷要求 ${sheetSpec.value.bleed}mm。` })
    })
    for (let index = 0; index < positions.value.length; index += 1) {
      for (let next = index + 1; next < positions.value.length; next += 1) {
        const a = positions.value[index]
        const b = positions.value[next]
        if (a.front === b.front && Math.abs(a.x - b.x) < 220 && Math.abs(a.y - b.y) < 300) {
          issues.push({ id: `overlap-${a.id}-${b.id}`, severity: '错误', pageNo: a.pageNo, title: `${a.id} 与 ${b.id} 版位重叠`, detail: '当前纸张尺寸下页面之间不足安全间隙。' })
        }
      }
    }
    // 纸纹方向：纵向纸纹不允许 90°/270°
    const allowed = sheetSpec.value.grain === '纵向' ? [0, 180] : [90, 270]
    positions.value
      .filter((position) => !allowed.includes(position.rotation))
      .forEach((position) => {
        issues.push({ id: `grain-${position.id}`, severity: '错误', pageNo: position.pageNo, title: `P${position.pageNo} 旋转方向与纸纹不符`, detail: `${sheetSpec.value.grain}纸纹要求版位轴向与纸边一致，${position.rotation}° 旋转会导致折页开裂。` })
      })
    // 换纸排队队列
    if (paperOutcome.value) {
      paperOutcome.value.overflow.forEach((item) => {
        issues.push({ id: `queue-${item.pageNo}`, severity: '警告', pageNo: item.pageNo, title: `P${item.pageNo} 在换纸排队队列`, detail: item.reason })
      })
    }
    // 打样失效
    proofs.value
      .filter((proof) => proof.invalid)
      .forEach((proof) => {
        issues.push({ id: `proof-invalid-${proof.id}`, severity: '警告', title: `${proof.id} 打样结论已失效`, detail: proof.invalidReason ?? '拼版变更后需重新打样确认。' })
      })
    const frontOrder = positions.value.filter((item) => item.front).sort((a, b) => a.x - b.x || a.y - b.y).map((item) => item.pageNo)
    if (frontOrder[0] !== 1) issues.push({ id: 'binding-order', severity: '警告', pageNo: 1, title: '骑马订正版页序需要复核', detail: `当前首位为 P${frontOrder[0]}，装订方向规则期望封面位于首版位。` })
    return issues
  })

  watch(
    [pages, positions, proofs, tasks, revision, locked, sheetSpec, snapshots, serverRevision, basePositions],
    () => {
      localStorage.setItem(
        'print-imposition-v1',
        JSON.stringify({
          pages: pages.value,
          positions: positions.value,
          proofs: proofs.value,
          tasks: tasks.value,
          revision: revision.value,
          locked: locked.value,
          sheetSpec: sheetSpec.value,
          snapshots: snapshots.value,
          serverRevision: serverRevision.value,
          basePositions: basePositions.value,
        }),
      )
    },
    { deep: true },
  )

  /** 版位/出血一旦变动，覆盖该页面的“通过”打样结论即失效，需重新确认 */
  function invalidateProofs(pageNos: number[], reason: string) {
    proofs.value.forEach((proof) => {
      if (proof.decision === '通过' && !proof.invalid && proof.pages.some((no) => pageNos.includes(no))) {
        proof.invalid = true
        proof.invalidReason = reason
      }
    })
  }

  function updatePosition(id: string, patch: Partial<Position>) {
    if (locked.value) return
    const position = positions.value.find((item) => item.id === id)
    if (!position) return
    const changed = (['x', 'y', 'rotation'] as const).filter((field) => patch[field] !== undefined && patch[field] !== position[field])
    Object.assign(position, patch)
    if (changed.length) invalidateProofs([position.pageNo], `P${position.pageNo} 版位 ${changed.join('/')} 已变更，原打样结论失效，需重新打样确认。`)
  }

  function updatePage(pageNo: number, patch: Partial<Page>) {
    if (locked.value) return
    const page = pages.value.find((item) => item.pageNo === pageNo)
    if (!page) return
    const bleedChanged = patch.bleed !== undefined && patch.bleed !== page.bleed
    Object.assign(page, patch)
    if (bleedChanged) invalidateProofs([pageNo], `P${pageNo} 出血已变更为 ${patch.bleed}mm，原打样结论失效，需重新打样确认。`)
  }

  function addPosition(pageNo: number) {
    if (locked.value || positions.value.some((item) => item.pageNo === pageNo && item.front === (side.value === 'front'))) return
    positions.value.push({ id: `P-${Date.now().toString().slice(-3)}`, pageNo, x: sheetSpec.value.safe, y: sheetSpec.value.safe, rotation: 0, front: side.value === 'front' })
    invalidateProofs([pageNo], `P${pageNo} 已拼入版面，原打样结论失效，需重新打样确认。`)
  }

  function updateProof(id: string, patch: Partial<Proof>) {
    const proof = proofs.value.find((item) => item.id === id)
    if (proof) Object.assign(proof, patch)
  }

  function createProof() {
    proofs.value.push({
      id: `PRF-${String(proofs.value.length + 1).padStart(2, '0')}`,
      round: proofs.value.length + 1,
      date: new Date().toISOString().slice(0, 10),
      sample: `数字样张 v${proofs.value.length + 1}`,
      deltaE: 0,
      feedback: '',
      correction: '',
      owner: currentUser.value,
      decision: '待决定',
      pages: [],
    })
  }

  /** 拼版员重新确认失效的打样结论 */
  function reconfirmProof(id: string) {
    const proof = proofs.value.find((item) => item.id === id)
    if (!proof) return
    proof.invalid = false
    proof.invalidReason = undefined
    proof.confirmedAt = new Date().toISOString().slice(0, 10)
  }

  function lockBaseline() {
    locked.value = true
    revision.value = `R${Number(revision.value.slice(1)) + 1}`
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

  /** 保存版位：后保存者若遇到对方已提交的新版本，会先看到当前版本与冲突清单，不能覆盖对方版位 */
  async function saveLayout(): Promise<boolean> {
    const result = await impositionApi.saveLayout(serverRevision.value, basePositions.value, positions.value, currentUser.value)
    if (result.status === 409) {
      conflict.value = { serverRevision: result.current.revision, positions: result.current.positions, conflicts: result.conflicts }
      return false
    }
    serverRevision.value = result.revision
    basePositions.value = structuredClone(positions.value)
    revision.value = `R${result.revision}`
    return true
  }

  /** 放弃本地修改，直接采用服务器当前版本 */
  function reloadServerVersion() {
    if (!conflict.value) return
    positions.value = structuredClone(conflict.value.positions)
    serverRevision.value = conflict.value.serverRevision
    basePositions.value = structuredClone(conflict.value.positions)
    conflict.value = null
  }

  /** 合并：对方改过的版位以服务器为准，仅保留本地未冲突的修改，然后重新保存 */
  async function mergeAndSave(): Promise<boolean> {
    if (!conflict.value) return false
    const serverPositions = conflict.value.positions
    const conflictedIds = new Set(conflict.value.conflicts.map((item) => item.id))
    positions.value = positions.value.map((item) => (conflictedIds.has(item.id) ? structuredClone(serverPositions.find((sp) => sp.id === item.id)!) : item))
    conflict.value = null
    return saveLayout()
  }

  /** 换纸：先保存快照，再按出血/安全区/纸纹重排；容量不足排队，失败保留快照并允许重试 */
  async function changePaper(spec: SheetSpec, options: { retry?: boolean } = {}) {
    changingPaper.value = true
    lastPaperSpec.value = { ...spec }
    try {
      if (!options.retry) {
        const snapshot: Snapshot = {
          id: `SNP-${Date.now().toString().slice(-6)}`,
          createdAt: new Date().toISOString(),
          reason: '换纸前快照',
          revision: revision.value,
          note: `换纸为 ${spec.width} × ${spec.height}mm（${spec.grain}纸纹）前保存`,
          sheetSpec: { ...sheetSpec.value },
          positions: structuredClone(positions.value),
          proofs: structuredClone(proofs.value),
        }
        snapshots.value.unshift(snapshot)
        lastSnapshotId.value = snapshot.id
      }

      const result = await impositionApi.changePaper(serverRevision.value, basePositions.value, spec, pages.value, currentUser.value)
      if (result.status === 409) {
        conflict.value = {
          serverRevision: result.current.revision,
          positions: result.current.positions,
          conflicts: diffPositions(basePositions.value, positions.value, result.current.positions),
        }
        return
      }
      if (result.status === 422) {
        paperOutcome.value = {
          ok: false,
          error: result.error,
          positions: [],
          overflow: [],
          columns: 0,
          rows: 0,
          capacityPerFace: 0,
          placedCount: 0,
          requiredSheets: 0,
          shortfall: '',
          adjusted: [],
          changedPageNos: [],
        }
        return
      }

      positions.value = structuredClone(result.outcome.positions)
      sheetSpec.value = { ...spec }
      paperOutcome.value = result.outcome
      serverRevision.value = result.revision
      basePositions.value = structuredClone(result.outcome.positions)
      revision.value = `R${result.revision}`
      if (result.outcome.changedPageNos.length) {
        invalidateProofs(result.outcome.changedPageNos, '换纸导致版位位置/旋转变化，原打样结论失效，需重新打样确认。')
      }
    } finally {
      changingPaper.value = false
    }
  }

  /** 换纸失败后重试：保留原快照，按同一规格重新尝试 */
  async function retryPaperChange() {
    if (lastPaperSpec.value) await changePaper(lastPaperSpec.value, { retry: true })
  }

  /** 模拟另一名拼版员抢先保存 */
  async function simulatePeerSave() {
    const state: ServerState = await impositionApi.simulatePeer()
    serverRevision.value = state.revision
    peerNotice.value = `拼版员 ${state.updatedBy} 刚保存了版位（${state.updatedAt}），你的版本已过期，保存时将先看到冲突清单。`
  }

  return {
    pages,
    positions,
    proofs,
    tasks,
    sheetSpec,
    snapshots,
    side,
    zoom,
    revision,
    locked,
    selectedPosition,
    selectedProof,
    validations,
    serverRevision,
    basePositions,
    conflict,
    peerNotice,
    changingPaper,
    paperOutcome,
    lastPaperSpec,
    lastSnapshotId,
    currentUser,
    updatePosition,
    updatePage,
    addPosition,
    updateProof,
    createProof,
    reconfirmProof,
    lockBaseline,
    unlock,
    resumeTask,
    saveLayout,
    reloadServerVersion,
    mergeAndSave,
    changePaper,
    retryPaperChange,
    simulatePeerSave,
  }
})

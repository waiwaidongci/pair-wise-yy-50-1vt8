import type { Page, Position, SheetSpec } from '../stores/imposition'
import { layoutPages, type LayoutOutcome } from '../utils/impositionLayout'

export type ServerState = {
  revision: number
  sheetSpec: SheetSpec
  positions: Position[]
  updatedBy: string
  updatedAt: string
}

export type ConflictItem = {
  id: string
  pageNo: number
  fields: ('x' | 'y' | 'rotation')[]
  yours: Partial<Position>
  theirs: Partial<Position>
}

export type SaveResult =
  | { status: 200; revision: number }
  | { status: 409; current: ServerState; conflicts: ConflictItem[] }

export type PaperChangeResult =
  | { status: 200; revision: number; outcome: LayoutOutcome }
  | { status: 409; current: ServerState; conflicts: ConflictItem[] }
  | { status: 422; error: string }

const KEY = 'print-imposition-server-v1'

const seedSheet: SheetSpec = { width: 720, height: 1020, bleed: 3, safe: 5, gutter: 6, binding: '骑马订', grain: '纵向' }

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

function load(): ServerState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as ServerState
  } catch {
    /* ignore */
  }
  const state: ServerState = {
    revision: 6,
    sheetSpec: { ...seedSheet },
    positions: structuredClone(seedPositions),
    updatedBy: '林青',
    updatedAt: '09-25 16:42',
  }
  localStorage.setItem(KEY, JSON.stringify(state))
  return state
}

function persist(state: ServerState) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

function now() {
  return new Date().toTimeString().slice(0, 5)
}

/** 三方对比：基线版位 vs 本地修改 vs 服务器当前版位，找出双方都改过的版位 */
export function diffPositions(base: Position[], local: Position[], server: Position[]): ConflictItem[] {
  const conflicts: ConflictItem[] = []
  for (const lp of local) {
    const bp = base.find((p) => p.id === lp.id)
    const sp = server.find((p) => p.id === lp.id)
    if (!bp || !sp) continue
    const fields = (['x', 'y', 'rotation'] as const).filter(
      (field) => lp[field] !== bp[field] && sp[field] !== bp[field] && lp[field] !== sp[field],
    )
    if (fields.length) {
      conflicts.push({
        id: lp.id,
        pageNo: lp.pageNo,
        fields: [...fields],
        yours: Object.fromEntries(fields.map((f) => [f, lp[f]])) as Partial<Position>,
        theirs: Object.fromEntries(fields.map((f) => [f, sp[f]])) as Partial<Position>,
      })
    }
  }
  return conflicts
}

const delay = () => new Promise((resolve) => setTimeout(resolve, 160))

export const impositionApi = {
  async fetchState(): Promise<ServerState> {
    await delay()
    return structuredClone(load())
  },

  /** 保存版位：base 为本地基于的服务器版本号与版位；版本落后时返回 409 + 冲突清单 */
  async saveLayout(base: number, basePositions: Position[], positions: Position[], editor: string): Promise<SaveResult> {
    await delay()
    const state = load()
    if (state.revision !== base) {
      return { status: 409, current: structuredClone(state), conflicts: diffPositions(basePositions, positions, state.positions) }
    }
    state.positions = structuredClone(positions)
    state.revision += 1
    state.updatedBy = editor
    state.updatedAt = now()
    persist(state)
    return { status: 200, revision: state.revision }
  },

  /** 换纸：服务端按新规格重排；版本落后返回 409，规格无法排版返回 422（快照由客户端保留） */
  async changePaper(
    base: number,
    basePositions: Position[],
    spec: SheetSpec,
    pages: Page[],
    editor: string,
  ): Promise<PaperChangeResult> {
    await delay()
    const state = load()
    if (state.revision !== base) {
      return { status: 409, current: structuredClone(state), conflicts: diffPositions(basePositions, basePositions, state.positions) }
    }
    const outcome = layoutPages(pages, state.positions, spec)
    if (!outcome.ok) return { status: 422, error: outcome.error ?? '换纸失败' }
    state.positions = structuredClone(outcome.positions)
    state.sheetSpec = { ...spec }
    state.revision += 1
    state.updatedBy = editor
    state.updatedAt = now()
    persist(state)
    return { status: 200, revision: state.revision, outcome }
  },

  /** 模拟另一名拼版员抢先保存了版位 */
  async simulatePeer(): Promise<ServerState> {
    await delay()
    const state = load()
    const target = state.positions.find((p) => p.id === 'P-07') ?? state.positions[0]
    target.x = Math.min(target.x + 12, state.sheetSpec.width - 60)
    state.revision += 1
    state.updatedBy = '林青'
    state.updatedAt = now()
    persist(state)
    return structuredClone(state)
  },
}

<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import ImpositionCanvas from '../components/ImpositionCanvas.vue'
import { useImpositionStore, type Snapshot } from '../stores/imposition'

const store = useImpositionStore()
const accepted = ref(['CH-02', 'CH-03'])

const latestSnapshot = computed<Snapshot | null>(() => store.snapshots[0] ?? null)

type Change = { id: string; title: string; before: string; after: string; risk: '低' | '中' | '高' }

const changes = computed<Change[]>(() => {
  const base = latestSnapshot.value
  if (!base) return []
  const list: Change[] = []
  base.positions.forEach((before) => {
    const after = store.positions.find((item) => item.id === before.id)
    if (!after) return
    if (before.x !== after.x || before.y !== after.y) {
      list.push({ id: `CH-${list.length + 1}`, title: `P${after.pageNo} 版位移位`, before: `x ${before.x} / y ${before.y}mm`, after: `x ${after.x} / y ${after.y}mm`, risk: '中' })
    }
    if (before.rotation !== after.rotation) {
      list.push({ id: `CH-${list.length + 1}`, title: `P${after.pageNo} 旋转调整`, before: `rotation ${before.rotation}°`, after: `rotation ${after.rotation}°`, risk: '中' })
    }
  })
  if (base.sheetSpec.width !== store.sheetSpec.width || base.sheetSpec.grain !== store.sheetSpec.grain) {
    list.push({ id: `CH-${list.length + 1}`, title: '纸张规格变更', before: `${base.sheetSpec.width} × ${base.sheetSpec.height}mm · ${base.sheetSpec.grain}`, after: `${store.sheetSpec.width} × ${store.sheetSpec.height}mm · ${store.sheetSpec.grain}`, risk: '高' })
  }
  return list
})

const viewing = ref<Snapshot | null>(null)
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">VERSION COMPARE / 版本对比</p><h1>拼版版本并排审阅</h1><p class="muted">基线与候选版本对比，变更可逐项接受；换纸前自动保存快照，旧版位与打样记录随时可查。</p></div>
      <div class="actions"><Button label="导出对比报告" icon="pi pi-file-export" outlined /><Button :label="store.locked ? '已锁定' : '接受变更并锁定'" icon="pi pi-lock" :disabled="store.locked || accepted.length === 0" @click="store.lockBaseline" /></div>
    </div>

    <section class="panel snapshot-panel">
      <div class="panel-head"><h3>换纸前快照</h3><Tag :value="`${store.snapshots.length} 份`" /></div>
      <div v-if="!store.snapshots.length" class="empty">尚未保存快照。执行「换纸重排」时会自动保存换纸前快照。</div>
      <div v-else class="snapshot-list">
        <article v-for="snapshot in store.snapshots" :key="snapshot.id">
          <div class="snapshot-main">
            <strong>{{ snapshot.reason }} · {{ snapshot.id }}</strong>
            <small>{{ snapshot.createdAt }} · 版本 {{ snapshot.revision }} · {{ snapshot.sheetSpec.width }} × {{ snapshot.sheetSpec.height }}mm · {{ snapshot.sheetSpec.grain }}纸纹 · {{ snapshot.positions.length }} 个版位 · {{ snapshot.proofs.length }} 轮打样</small>
            <p>{{ snapshot.note }}</p>
          </div>
          <Button label="查看旧版位" icon="pi pi-eye" size="small" outlined @click="viewing = snapshot" />
        </article>
      </div>
    </section>

    <div class="compare-grid">
      <section class="panel">
        <div class="panel-head"><h3>基线 {{ latestSnapshot?.revision ?? '—' }}（换纸前）</h3><Tag value="只读" /></div>
        <div class="canvas-box">
          <ImpositionCanvas v-if="latestSnapshot" :pages="store.pages" :positions="latestSnapshot.positions" side="front" :zoom="38" :selected="null" :validations="[]" :sheet-spec="latestSnapshot.sheetSpec" @update="() => {}" @select="() => {}" />
          <div v-else class="empty">无快照</div>
        </div>
      </section>
      <section class="panel candidate">
        <div class="panel-head"><h3>候选 {{ store.revision }}</h3><Tag :value="`${changes.length} 项变更`" severity="warn" /></div>
        <div class="canvas-box"><ImpositionCanvas :pages="store.pages" :positions="store.positions" side="front" :zoom="38" :selected="null" :validations="store.validations" :sheet-spec="store.sheetSpec" @update="() => {}" @select="() => {}" /></div>
      </section>
    </div>

    <section class="panel change-panel">
      <div class="panel-head"><h3>版式变更差异</h3><span class="muted">接受 {{ accepted.length }}/{{ changes.length || 1 }} 项</span></div>
      <div v-if="!changes.length" class="empty">当前版本与换纸前快照一致，无差异。</div>
      <div v-else class="change-list">
        <article v-for="change in changes" :key="change.id">
          <Checkbox v-model="accepted" :inputId="change.id" :value="change.id" />
          <div><strong>{{ change.id }} · {{ change.title }}</strong><div class="diff"><span class="before">{{ change.before }}</span><i class="pi pi-arrow-right" /><span class="after">{{ change.after }}</span></div></div>
          <Tag :value="`${change.risk}风险`" :severity="change.risk === '高' ? 'danger' : change.risk === '中' ? 'warn' : 'success'" />
        </article>
      </div>
    </section>

    <Dialog :visible="!!viewing" header="旧版位快照（只读）" :style="{ width: '760px' }" modal @update:visible="(value) => { if (!value) viewing = null }">
      <div v-if="viewing" class="snapshot-view">
        <p class="muted">{{ viewing.reason }} · {{ viewing.id }} · {{ viewing.createdAt }} · 版本 {{ viewing.revision }}</p>
        <div class="canvas-box">
          <ImpositionCanvas :pages="store.pages" :positions="viewing.positions" side="front" :zoom="62" :selected="null" :validations="[]" :sheet-spec="viewing.sheetSpec" @update="() => {}" @select="() => {}" />
        </div>
        <div class="snapshot-proofs">
          <h4>快照内打样记录（{{ viewing.proofs.length }} 轮）</h4>
          <div v-for="proof in viewing.proofs" :key="proof.id" class="proof-row">
            <strong>第 {{ proof.round }} 轮 · {{ proof.sample }}</strong>
            <small>{{ proof.date }} · {{ proof.owner }} · ΔE {{ proof.deltaE }}</small>
            <Tag :value="proof.decision" :severity="proof.decision === '通过' ? 'success' : proof.decision === '退回' ? 'danger' : 'warn'" />
          </div>
        </div>
      </div>
    </Dialog>
  </section>
</template>

<style scoped>
.actions { display: flex; gap: 8px; }
.snapshot-panel { margin-bottom: 14px; }
.snapshot-list { padding: 8px 16px 16px; }
.snapshot-list article { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #e9eeee; }
.snapshot-main { display: grid; gap: 3px; }
.snapshot-main strong { font-size: 13px; }
.snapshot-main small { color: #7c898e; font-size: 11px; }
.snapshot-main p { margin: 2px 0 0; color: #8a7a55; font-size: 11px; }
.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.candidate { border-color: #5d9693; }
.canvas-box { height: 440px; overflow: auto; padding: 12px; background: #35474d; }
.change-panel { overflow: hidden; }
.change-list article { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: center; padding: 14px 16px; border-bottom: 1px solid #edf1f1; }
.change-list strong { font-size: 12px; }
.diff { display: flex; align-items: center; gap: 8px; margin-top: 7px; font-family: monospace; font-size: 10px; }
.diff span { padding: 4px 6px; border-radius: 4px; }
.before { color: #9f4c38; background: #fff0ec; }
.after { color: #2d735b; background: #e9f5ef; }
.empty { padding: 28px; color: #7e8a8f; text-align: center; font-size: 12px; }
.snapshot-view { display: grid; gap: 10px; }
.snapshot-proofs { display: grid; gap: 6px; }
.snapshot-proofs h4 { margin: 6px 0 2px; font-size: 13px; }
.proof-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border: 1px solid #eef1f1; border-radius: 7px; }
.proof-row strong { font-size: 12px; }
.proof-row small { color: #7c898e; font-size: 10px; }
@media (max-width: 1000px) { .compare-grid { grid-template-columns: 1fr; } }
</style>

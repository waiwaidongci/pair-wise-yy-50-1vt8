<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import ImpositionCanvas from '../components/ImpositionCanvas.vue'
import { useImpositionStore, type Snapshot } from '../stores/imposition'

const store = useImpositionStore()
const accepted = ref(['CH-02', 'CH-03'])
const changes = [
  { id: 'CH-01', title: 'P7 右移 18mm 并增加 2mm 出血', before: 'x 34 / bleed 1mm', after: 'x 52 / bleed 3mm', risk: '低' },
  { id: 'CH-02', title: 'P1 封面旋转 180° 以匹配骑马订折手', before: 'rotation 0°', after: 'rotation 180°', risk: '中' },
  { id: 'CH-03', title: 'P4 与 P5 跨页间距缩短 4mm', before: 'gutter 10mm', after: 'gutter 6mm', risk: '中' },
  { id: 'CH-04', title: 'P2 版权页采用低出血文件', before: 'bleed 2mm', after: 'bleed 1mm', risk: '高' },
]

const viewing = ref<Snapshot | null>(null)
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">VERSION COMPARE / 版本对比</p><h1>拼版版本并排审阅</h1><p class="muted">基线 R5 与候选 R6 对比，变更可逐项接受；锁定后生成只读生产版本。</p></div>
      <div class="actions"><Button label="导出对比报告" icon="pi pi-file-export" outlined /><Button :label="store.locked ? '已锁定' : '接受变更并锁定'" icon="pi pi-lock" :disabled="store.locked || accepted.length === 0" @click="store.lockBaseline" /></div>
    </div>

    <div class="compare-grid">
      <section class="panel">
        <div class="panel-head"><h3>基线 R5</h3><Tag value="只读" /></div>
        <div class="canvas-box"><ImpositionCanvas :positions="store.positions" :pages="store.pages" :spec="store.sheetSpec" side="front" :zoom="38" :selected="null" :validations="store.validations" @update="() => {}" @select="() => {}" /></div>
      </section>
      <section class="panel candidate">
        <div class="panel-head"><h3>候选 R6</h3><Tag value="4 项变更" severity="warn" /></div>
        <div class="canvas-box"><ImpositionCanvas :positions="store.positions" :pages="store.pages" :spec="store.sheetSpec" side="front" :zoom="38" :selected="null" :validations="store.validations" @update="() => {}" @select="() => {}" /></div>
      </section>
    </div>

    <section class="panel change-panel">
      <div class="panel-head"><h3>版式变更差异</h3><span class="muted">接受 {{ accepted.length }}/{{ changes.length }} 项</span></div>
      <div class="change-list">
        <article v-for="change in changes" :key="change.id">
          <Checkbox v-model="accepted" :inputId="change.id" :value="change.id" />
          <div><strong>{{ change.id }} · {{ change.title }}</strong><div class="diff"><span class="before">{{ change.before }}</span><i class="pi pi-arrow-right" /><span class="after">{{ change.after }}</span></div></div>
          <Tag :value="`${change.risk}风险`" :severity="change.risk === '高' ? 'danger' : change.risk === '中' ? 'warn' : 'success'" />
        </article>
      </div>
    </section>

    <section class="panel snapshot-panel">
      <div class="panel-head"><h3>换纸快照与历史版位</h3><Tag :value="`${store.snapshots.length} 份`" severity="info" /></div>
      <div v-if="!store.snapshots.length" class="empty">暂无快照。在拼版工作区发起「换纸重排」时会自动保存换纸前快照，失败时保留并可重试。</div>
      <div v-else class="snapshot-list">
        <article v-for="snapshot in store.snapshots" :key="snapshot.id">
          <div class="snapshot-info">
            <strong>{{ snapshot.reason }}</strong>
            <small>{{ snapshot.id }} · 版本 {{ snapshot.revision }} · {{ snapshot.createdAt }}</small>
            <div class="snapshot-specs">
              <span>{{ snapshot.spec.width }}×{{ snapshot.spec.height }}mm</span>
              <span>出血 {{ snapshot.spec.bleed }}mm</span>
              <span>安全区 {{ snapshot.spec.safe }}mm</span>
              <span>纸纹{{ snapshot.spec.grain }}</span>
              <span>{{ snapshot.positions.length }} 个版位</span>
              <span>{{ snapshot.proofs.length }} 轮打样</span>
            </div>
          </div>
          <div class="snapshot-actions">
            <Button label="查看旧版位与打样" icon="pi pi-eye" size="small" outlined @click="viewing = snapshot" />
            <Button label="恢复此版位" icon="pi pi-replay" size="small" severity="warn" outlined @click="store.restoreSnapshot(snapshot.id)" />
          </div>
        </article>
      </div>
    </section>

    <Dialog :visible="!!viewing" modal :header="viewing ? `${viewing.reason}` : ''" :style="{ width: '720px' }" @update:visible="viewing = null">
      <div v-if="viewing" class="snapshot-view">
        <p class="muted">快照 {{ viewing.id }} · 版本 {{ viewing.revision }} · {{ viewing.createdAt }} · 纸张 {{ viewing.spec.width }}×{{ viewing.spec.height }}mm · 纸纹{{ viewing.spec.grain }}</p>
        <div class="canvas-box"><ImpositionCanvas :positions="viewing.positions" :pages="store.pages" :spec="viewing.spec" side="front" :zoom="52" :selected="null" :validations="[]" @update="() => {}" @select="() => {}" /></div>
        <h4>快照时的打样记录</h4>
        <div class="snapshot-proofs">
          <div v-for="proof in viewing.proofs" :key="proof.id">
            <strong>第 {{ proof.round }} 轮 · {{ proof.sample }}</strong>
            <span>{{ proof.date }} · ΔE {{ proof.deltaE }} · {{ proof.owner }}</span>
            <Tag :value="proof.decision" :severity="proof.decision === '通过' ? 'success' : proof.decision === '退回' ? 'danger' : 'warn'" />
          </div>
        </div>
      </div>
    </Dialog>
  </section>
</template>

<style scoped>
.actions { display: flex; gap: 8px; }
.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.candidate { border-color: #5d9693; }
.canvas-box { max-height: 440px; overflow: auto; padding: 12px; background: #35474d; }
.change-panel { overflow: hidden; margin-bottom: 14px; }
.change-list article { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: center; padding: 14px 16px; border-bottom: 1px solid #edf1f1; }
.change-list strong { font-size: 12px; }
.diff { display: flex; align-items: center; gap: 8px; margin-top: 7px; font-family: monospace; font-size: 10px; }
.diff span { padding: 4px 6px; border-radius: 4px; }
.before { color: #9f4c38; background: #fff0ec; }
.after { color: #2d735b; background: #e9f5ef; }
.snapshot-panel { overflow: hidden; }
.empty { padding: 26px; color: #7e8a8f; text-align: center; font-size: 12px; }
.snapshot-list article { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 16px; border-bottom: 1px solid #edf1f1; flex-wrap: wrap; }
.snapshot-info strong, .snapshot-info small { display: block; }
.snapshot-info strong { font-size: 12px; }
.snapshot-info small { margin-top: 4px; color: #7a878d; font-size: 10px; }
.snapshot-specs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.snapshot-specs span { padding: 4px 7px; border-radius: 5px; color: #45676d; background: #eef4f4; font-size: 10px; }
.snapshot-actions { display: flex; gap: 8px; }
.snapshot-view { display: grid; gap: 12px; }
.snapshot-view h4 { margin: 4px 0 0; font-size: 13px; }
.snapshot-proofs { display: grid; gap: 6px; }
.snapshot-proofs > div { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 9px 11px; border: 1px solid #e7eded; border-radius: 7px; font-size: 11px; }
.snapshot-proofs span { color: #74828a; font-size: 10px; }
@media (max-width: 1000px) { .compare-grid { grid-template-columns: 1fr; } }
</style>

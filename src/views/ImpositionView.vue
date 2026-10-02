<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import Slider from 'primevue/slider'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import ImpositionCanvas from '../components/ImpositionCanvas.vue'
import { useImpositionStore, type SheetSpec } from '../stores/imposition'

const store = useImpositionStore()
const sideOptions = [
  { label: '正面', value: 'front' },
  { label: '反面', value: 'back' },
]
const selected = computed(() => store.positions.find((item) => item.id === store.selectedPosition))
const activeValidations = computed(() => store.validations.filter((item) => !item.pageNo || item.pageNo === selected.value?.pageNo || sideContains(item.pageNo)))
const approvedProofs = computed(() => store.proofs.filter((proof) => proof.decision === '通过'))
const invalidatedCount = computed(() => Object.keys(store.proofInvalidations).length)

function sideContains(pageNo?: number) {
  if (!pageNo) return true
  return store.positions.some((position) => position.pageNo === pageNo && position.front === (store.side === 'front'))
}

function locate(pageNo?: number) {
  const position = store.positions.find((item) => item.pageNo === pageNo)
  if (position) {
    store.selectedPosition = position.id
    store.side = position.front ? 'front' : 'back'
  }
}

// —— 保存与并发冲突 ——
const savedTip = ref(false)
function save() {
  const ok = store.saveRevision()
  if (ok) {
    savedTip.value = true
    setTimeout(() => (savedTip.value = false), 2600)
  }
}

// —— 换纸重排 ——
const paperDialog = ref(false)
const target = ref<SheetSpec>({ ...store.sheetSpec })
const presets = [
  { label: '较窄对开 640×900 · 纵向纸纹', width: 640, height: 900, grain: '纵向' as const },
  { label: '窄幅 430×880 · 纵向纸纹（容量不足演示）', width: 430, height: 880, grain: '纵向' as const },
  { label: '横纹对开 640×900 · 横向纸纹（旋转演示）', width: 640, height: 900, grain: '横向' as const },
  { label: '超窄 210×600 · 纵向纸纹（失败演示）', width: 210, height: 600, grain: '纵向' as const },
]
const preset = ref<string | null>(null)

function openPaperDialog() {
  target.value = store.paperChange.status === 'failed' ? { ...store.paperChange.target } : { ...store.sheetSpec }
  preset.value = null
  paperDialog.value = true
}

function applyPreset(value: string | null) {
  const found = presets.find((item) => item.label === value)
  if (!found) return
  target.value = { ...target.value, width: found.width, height: found.height, grain: found.grain }
}

function recalc() {
  store.startPaperChange(target.value)
}

function applyChange() {
  store.applyPaperChange()
  if (store.paperChange.status === 'idle' && !store.conflictState) paperDialog.value = false
}

function closePaperDialog() {
  if (store.paperChange.status === 'preview') store.cancelPaperChange()
  paperDialog.value = false
}

const plan = computed(() => store.paperChange.plan)
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">IMPOSITION / 拼版工作区</p><h1>Canvas 版位编排与预检</h1><p class="muted">拖拽页面位置，系统实时检查出血、安全区、重叠和骑马订方向。</p></div>
      <div class="actions">
        <Button label="换纸重排" icon="pi pi-clone" severity="warn" outlined :disabled="store.locked" @click="openPaperDialog" />
        <Button label="模拟同事保存" icon="pi pi-users" severity="secondary" text @click="store.simulateColleagueSave" />
        <Button label="保存拼版版本" icon="pi pi-save" @click="save" />
      </div>
    </div>

    <Message v-if="savedTip" severity="success" :closable="false" class="mb-3">已保存为正式版本 {{ store.revision }}。</Message>
    <Message v-if="store.remotePending" severity="info" :closable="false" class="mb-3">
      检测到另一拼版员保存了新版本。你保存时将先看到对方版本与冲突清单，不会直接覆盖对方版位。
    </Message>
    <Message v-if="store.paperChange.status === 'failed'" severity="error" :closable="false" class="mb-3">
      换纸失败：{{ store.paperChange.error }} 原快照已保留。
      <div class="fail-actions">
        <Button label="调整纸幅重试" size="small" severity="warn" @click="openPaperDialog" />
        <Button label="回滚到换纸前快照" size="small" outlined @click="store.rollbackPaperChange" />
      </div>
    </Message>
    <Message v-if="invalidatedCount" severity="warn" :closable="false" class="mb-3">
      {{ invalidatedCount }} 轮已通过打样因版位 / 旋转 / 出血变动而失效，请前往「打样审批」重新确认。
    </Message>
    <Message v-if="store.validations.length" severity="warn" :closable="false" class="mb-3">
      当前版本有 {{ store.validations.filter((item) => item.severity === '错误').length }} 个阻断错误和 {{ store.validations.filter((item) => item.severity === '警告').length }} 个警告。
    </Message>

    <div class="toolbar panel">
      <SelectButton v-model="store.side" :options="sideOptions" optionLabel="label" optionValue="value" />
      <span class="muted">缩放 {{ store.zoom }}%</span>
      <Slider v-model="store.zoom" :min="35" :max="100" :step="5" style="width:150px" />
      <span class="paper-spec">{{ store.sheetSpec.width }} × {{ store.sheetSpec.height }}mm · 出血 {{ store.sheetSpec.bleed }}mm · 安全区 {{ store.sheetSpec.safe }}mm · 纸纹{{ store.sheetSpec.grain }} · {{ store.locked ? '基线只读' : '编辑中' }}</span>
      <Button v-if="!store.locked" label="审批锁定" icon="pi pi-lock" size="small" @click="store.lockBaseline" />
      <Button v-else label="解锁修订" icon="pi pi-lock-open" size="small" severity="warn" outlined @click="store.unlock" />
    </div>

    <section v-if="store.paperQueue.length" class="panel queue-panel">
      <div class="panel-head"><h3>纸面排队</h3><Tag :value="`${store.paperQueue.length} 页待排`" severity="warn" /></div>
      <div class="queue-list">
        <div v-for="item in store.paperQueue" :key="item.pageNo">
          <strong>P{{ item.pageNo }} · {{ item.name }}</strong>
          <span>{{ item.reason }}</span>
        </div>
      </div>
    </section>

    <div class="imposition-grid">
      <aside class="panel pages-panel">
        <div class="panel-head"><h3>页面文件</h3><Tag :value="`${store.pages.length}P`" /></div>
        <div class="page-list">
          <button v-for="page in store.pages" :key="page.pageNo" :disabled="store.positions.some((item) => item.pageNo === page.pageNo && item.front === (store.side === 'front'))" @click="store.addPosition(page.pageNo)">
            <div class="thumb"><span>P{{ page.pageNo }}</span><i /></div>
            <div><strong>{{ page.name }}</strong><small>{{ page.width }}×{{ page.height }} · 出血 {{ page.bleed }}mm</small></div>
            <i class="pi pi-plus" />
          </button>
        </div>
      </aside>

      <section class="panel canvas-panel">
        <div class="panel-head"><h3>{{ store.side === 'front' ? '正面版式' : '反面版式' }}</h3><span class="muted">拖动页面 · 点击选择</span></div>
        <div class="canvas-scroll">
          <ImpositionCanvas
            :positions="store.positions"
            :pages="store.pages"
            :spec="store.sheetSpec"
            :side="store.side"
            :zoom="store.zoom"
            :selected="store.selectedPosition"
            :validations="store.validations"
            @select="store.selectedPosition = $event"
            @update="store.updatePosition"
          />
        </div>
      </section>

      <aside class="right-panel">
        <section class="panel">
          <div class="panel-head"><h3>版位属性</h3><Tag v-if="selected" :value="selected.id" /></div>
          <div v-if="selected" class="properties">
            <label>页面<select :value="selected.pageNo" @change="store.updatePosition(selected.id, { pageNo: Number(($event.target as HTMLSelectElement).value) })"><option v-for="page in store.pages" :key="page.pageNo" :value="page.pageNo">P{{ page.pageNo }} · {{ page.name }}</option></select></label>
            <div class="pair"><label>X<input type="number" :value="selected.x" @change="store.updatePosition(selected.id, { x: Number(($event.target as HTMLInputElement).value) })" /></label><label>Y<input type="number" :value="selected.y" @change="store.updatePosition(selected.id, { y: Number(($event.target as HTMLInputElement).value) })" /></label></div>
            <label>旋转方向<select :value="selected.rotation" @change="store.updatePosition(selected.id, { rotation: Number(($event.target as HTMLSelectElement).value) })"><option :value="0">0°</option><option :value="90">顺时针 90°</option><option :value="180">倒置 180°</option><option :value="270">顺时针 270°</option></select></label>
            <div class="binding-note"><i class="pi pi-info-circle" /><span>{{ store.pages.find((page) => page.pageNo === selected?.pageNo)?.content }}</span></div>
          </div>
          <div v-else class="empty">在画布中选择一个版位以编辑属性。</div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>预检结果</h3><Tag :value="`${activeValidations.length} 项`" :severity="activeValidations.some((item) => item.severity === '错误') ? 'danger' : 'warn'" /></div>
          <div class="validation-list">
            <button v-for="issue in activeValidations" :key="issue.id" :class="issue.severity" @click="locate(issue.pageNo)">
              <i :class="issue.severity === '错误' ? 'pi pi-times-circle' : 'pi pi-exclamation-triangle'" />
              <div><strong>{{ issue.title }}</strong><p>{{ issue.detail }}</p></div>
              <i class="pi pi-arrow-right" />
            </button>
          </div>
        </section>
      </aside>
    </div>

    <Dialog v-model:visible="paperDialog" modal header="换纸重排" :style="{ width: '640px' }" :closable="store.paperChange.status !== 'preview'" @hide="closePaperDialog">
      <div class="paper-form">
        <Message v-if="store.paperChange.status === 'failed'" severity="error" :closable="false">{{ store.paperChange.error }}</Message>
        <div class="current-spec">
          <span>当前纸张：<strong>{{ store.sheetSpec.width }} × {{ store.sheetSpec.height }}mm</strong> · 出血 {{ store.sheetSpec.bleed }}mm · 安全区 {{ store.sheetSpec.safe }}mm · 纸纹{{ store.sheetSpec.grain }}</span>
          <Tag v-if="store.paperChange.snapshotId" value="换纸前快照已保存" severity="info" />
        </div>
        <label>常用纸幅预设
          <Select v-model="preset" :options="presets" optionLabel="label" optionValue="label" placeholder="选择预设或自定义" class="w-full" @update:modelValue="applyPreset" />
        </label>
        <div class="spec-grid">
          <label>纸宽 mm<InputNumber v-model="target.width" :min="100" :max="1200" suffix=" mm" /></label>
          <label>纸高 mm<InputNumber v-model="target.height" :min="100" :max="1600" suffix=" mm" /></label>
          <label>出血 mm<InputNumber v-model="target.bleed" :min="0" :max="10" suffix=" mm" /></label>
          <label>安全区 mm<InputNumber v-model="target.safe" :min="0" :max="20" suffix=" mm" /></label>
          <label>纸纹方向
            <Select v-model="target.grain" :options="['纵向', '横向']" class="w-full" />
          </label>
        </div>
        <Button label="计算重排方案" icon="pi pi-calculator" outlined class="w-full" @click="recalc" />

        <div v-if="store.paperChange.status === 'preview' && plan" class="plan">
          <Message v-if="!plan.feasible" severity="error" :closable="false">{{ plan.problem }}</Message>
          <template v-else>
            <div class="plan-summary">
              <div><span>每面版位</span><strong>{{ plan.cols }} × {{ plan.rows }} = {{ plan.perSide }}</strong></div>
              <div><span>正反容量</span><strong>{{ plan.capacity }} / {{ plan.required }} 页</strong></div>
              <div><span>排队</span><strong :class="{ danger: plan.queued.length }">{{ plan.queued.length }} 页</strong></div>
            </div>
            <ul class="plan-notes"><li v-for="note in plan.notes" :key="note">{{ note }}</li></ul>
            <div v-if="plan.queued.length" class="queued-table">
              <div v-for="item in plan.queued" :key="item.pageNo"><strong>P{{ item.pageNo }} · {{ item.name }}</strong><span>{{ item.reason }}</span></div>
            </div>
            <Message v-if="approvedProofs.length" severity="warn" :closable="false">
              应用后 {{ approvedProofs.length }} 轮已通过打样将因版位变动而失效，需重新确认。
            </Message>
          </template>
        </div>
      </div>
      <template #footer>
        <Button v-if="store.paperChange.status === 'failed'" label="回滚到换纸前快照" icon="pi pi-undo" severity="secondary" outlined @click="store.rollbackPaperChange(); paperDialog = false" />
        <Button v-if="store.paperChange.status === 'failed'" label="按当前纸幅重试" icon="pi pi-refresh" severity="warn" @click="recalc" />
        <template v-else>
          <Button label="取消" text @click="closePaperDialog" />
          <Button label="应用换纸并重排" icon="pi pi-check" severity="warn" :disabled="!plan || !plan.feasible" @click="applyChange" />
        </template>
      </template>
    </Dialog>

    <Dialog :visible="!!store.conflictState" modal header="发现版本冲突" :style="{ width: '620px' }" :closable="false">
      <div v-if="store.conflictState" class="conflict">
        <Message severity="warn" :closable="false">
          {{ store.conflictState.savedBy }} 已保存 {{ store.conflictState.revision }}（{{ store.conflictState.savedAt }}）。
          以下 {{ store.conflictState.conflicts.length }} 个版位双方都有改动，将以对方为准，不会覆盖对方刚排好的版位；其余 {{ store.conflictState.autoMerged }} 项你的改动可自动合并。
        </Message>
        <div class="conflict-list">
          <div class="conflict-head"><span>版位 / 页面</span><span>我的改动</span><span>对方已保存</span><span>处理</span></div>
          <div v-for="item in store.conflictState.conflicts" :key="item.id" class="conflict-row">
            <span><strong>{{ item.id }}</strong> · P{{ item.pageNo }}</span>
            <span class="mine">{{ item.mine ? `x${item.mine.x} y${item.mine.y} ${item.mine.rotation}°` : '已移除' }}</span>
            <span class="theirs">{{ item.theirs ? `x${item.theirs.x} y${item.theirs.y} ${item.theirs.rotation}°` : '已移除' }}</span>
            <span><Tag value="保留对方" severity="info" /></span>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="放弃我的改动，采纳对方版本" severity="secondary" outlined @click="store.resolveConflict('theirs')" />
        <Button label="合并不冲突改动并保存" icon="pi pi-check" @click="store.resolveConflict('merge')" />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.mb-3 { margin-bottom: 12px; }
.fail-actions { display: flex; gap: 8px; margin-top: 8px; }
.toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; padding: 12px; }
.paper-spec { margin-left: auto; color: #5d7077; font-size: 11px; }
.queue-panel { margin-bottom: 12px; }
.queue-list { display: grid; gap: 8px; padding: 12px 16px 16px; }
.queue-list > div { display: grid; gap: 3px; padding: 9px 11px; border-left: 3px solid #c98236; background: #fff8ee; font-size: 11px; }
.queue-list span { color: #7a6a52; }
.imposition-grid { display: grid; grid-template-columns: 220px minmax(0,1fr) 340px; gap: 12px; align-items: start; }
.pages-panel { max-height: 760px; overflow: auto; }
.page-list { padding: 8px; }
.page-list button { display: grid; width: 100%; grid-template-columns: 42px 1fr auto; gap: 8px; align-items: center; padding: 8px; border: 0; border-radius: 7px; text-align: left; background: transparent; cursor: pointer; }
.page-list button:hover:not(:disabled) { background: #eff5f4; }
.page-list button:disabled { opacity: .42; cursor: not-allowed; }
.thumb { display: grid; width: 38px; height: 50px; place-items: center; border: 1px solid #bdc7c9; background: #f4f3ef; font-size: 9px; font-weight: 800; }
.thumb i { width: 18px; height: 2px; background: #c36f42; }
.page-list strong, .page-list small { display: block; }
.page-list strong { font-size: 11px; }
.page-list small { margin-top: 4px; color: #7c898e; font-size: 9px; }
.canvas-panel { min-width: 0; }
.canvas-scroll { max-height: 760px; overflow: auto; padding: 18px; background: #34464c; }
.right-panel { display: grid; gap: 12px; }
.properties { display: grid; gap: 12px; padding: 14px; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.properties label { display: grid; gap: 5px; color: #5f7076; font-size: 11px; font-weight: 700; }
.properties input, .properties select { width: 100%; padding: 8px; border: 1px solid #cbd5d7; border-radius: 6px; font: inherit; }
.binding-note { display: flex; gap: 7px; padding: 9px; color: #6a604f; background: #fff5e7; font-size: 11px; line-height: 1.5; }
.empty { padding: 28px; color: #7e8a8f; text-align: center; font-size: 12px; }
.validation-list { max-height: 340px; overflow: auto; padding: 7px; }
.validation-list button { display: grid; width: 100%; grid-template-columns: 22px 1fr 16px; gap: 7px; padding: 10px; border: 0; border-radius: 7px; text-align: left; background: transparent; cursor: pointer; }
.validation-list button:hover { background: #f5f7f7; }
.validation-list button.error > i:first-child { color: #bd4a34; }
.validation-list button.warning > i:first-child { color: #bf7f2c; }
.validation-list strong { font-size: 11px; }
.validation-list p { margin: 4px 0 0; color: #738087; font-size: 10px; line-height: 1.45; }
.paper-form { display: grid; gap: 14px; }
.paper-form > label { display: grid; gap: 6px; color: #5e6e75; font-size: 12px; font-weight: 700; }
.current-spec { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: 7px; background: #f2f6f6; font-size: 12px; }
.spec-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.spec-grid label { display: grid; gap: 6px; color: #5e6e75; font-size: 11px; font-weight: 700; }
.w-full { width: 100%; }
.plan { display: grid; gap: 12px; }
.plan-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.plan-summary > div { padding: 10px; border: 1px solid #e2e9e9; border-radius: 7px; text-align: center; }
.plan-summary span, .plan-summary strong { display: block; }
.plan-summary span { color: #74828a; font-size: 10px; }
.plan-summary strong { margin-top: 4px; font-size: 16px; }
.plan-summary .danger { color: #bd4a34; }
.plan-notes { margin: 0; padding-left: 18px; color: #5c6d73; font-size: 11px; line-height: 1.7; }
.queued-table { display: grid; gap: 6px; }
.queued-table > div { display: grid; gap: 3px; padding: 8px 10px; border-left: 3px solid #c98236; background: #fff8ee; font-size: 11px; }
.queued-table span { color: #7a6a52; }
.conflict { display: grid; gap: 14px; }
.conflict-list { border: 1px solid #e4e9ea; border-radius: 8px; overflow: hidden; font-size: 11px; }
.conflict-head, .conflict-row { display: grid; grid-template-columns: 1.2fr 1fr 1fr auto; gap: 8px; align-items: center; padding: 9px 12px; }
.conflict-head { color: #74828a; background: #f4f7f7; font-weight: 700; }
.conflict-row { border-top: 1px solid #edf1f1; }
.conflict-row .mine { color: #9f4c38; }
.conflict-row .theirs { color: #2d735b; }
@media (max-width: 1200px) { .imposition-grid { grid-template-columns: 200px minmax(0,1fr); } .right-panel { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; } }
@media (max-width: 760px) { .imposition-grid { grid-template-columns: 1fr; } .right-panel { grid-template-columns: 1fr; } .pages-panel { max-height: 300px; } .spec-grid { grid-template-columns: 1fr 1fr; } }
</style>

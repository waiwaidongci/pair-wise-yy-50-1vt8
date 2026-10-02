<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

// ---- 换纸 ----
const paperDialog = ref(false)
const form = ref<SheetSpec>({ ...store.sheetSpec })
const presets = [
  { label: '720mm 原纸', width: 720 },
  { label: '620mm 宽松对开', width: 620 },
  { label: '520mm 标准窄幅', width: 520 },
  { label: '440mm 窄幅对开', width: 440 },
  { label: '210mm 特窄（失败演示）', width: 210 },
]
const grainOptions = [
  { label: '纵向（纸纹与长边一致）', value: '纵向' },
  { label: '横向（纸纹与短边一致）', value: '横向' },
]

watch(paperDialog, (open) => {
  if (open) form.value = { ...store.sheetSpec }
})

function applyPreset(width: number) {
  form.value.width = width
}

async function runPaperChange() {
  await store.changePaper({ ...form.value })
}

async function retry() {
  await store.retryPaperChange()
}

const outcome = computed(() => store.paperOutcome)
const queued = computed(() => outcome.value?.overflow ?? [])

// ---- 并发冲突 ----
const conflictFields: Record<string, string> = { x: 'X 坐标', y: 'Y 坐标', rotation: '旋转' }
const conflictDialog = computed({
  get: () => !!store.conflict,
  set: (value) => {
    if (!value) store.conflict = null
  },
})

async function save() {
  await store.saveLayout()
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">IMPOSITION / 拼版工作区</p><h1>Canvas 版位编排与预检</h1><p class="muted">拖拽页面位置，系统实时检查出血、安全区、重叠和纸纹方向。</p></div>
      <div class="actions">
        <Button label="模拟同事保存" icon="pi pi-users" text size="small" @click="store.simulatePeerSave" />
        <Button label="换纸重排" icon="pi pi-refresh" severity="help" outlined @click="paperDialog = true" />
        <Button label="保存拼版版本" icon="pi pi-save" @click="save" />
      </div>
    </div>

    <Message v-if="store.peerNotice" severity="info" :closable="true" class="mb-3" @close="store.peerNotice = ''">
      {{ store.peerNotice }}
    </Message>
    <Message v-if="store.validations.length" severity="warn" :closable="false" class="mb-3">
      当前版本有 {{ store.validations.filter((item) => item.severity === '错误').length }} 个阻断错误和 {{ store.validations.filter((item) => item.severity === '警告').length }} 个警告。
    </Message>

    <div v-if="queued.length" class="queue-panel panel">
      <div class="panel-head"><h3>换纸排队队列</h3><Tag :value="`${queued.length} 个版位待排`" severity="warn" /></div>
      <p class="shortfall">{{ outcome?.shortfall }}</p>
      <div class="queue-chips">
        <span v-for="item in queued" :key="item.pageNo" class="chip"><strong>P{{ item.pageNo }}</strong>{{ item.name }} · {{ item.face }}</span>
      </div>
    </div>

    <div class="toolbar panel">
      <SelectButton v-model="store.side" :options="sideOptions" optionLabel="label" optionValue="value" />
      <span class="muted">缩放 {{ store.zoom }}%</span>
      <Slider v-model="store.zoom" :min="35" :max="100" :step="5" style="width:150px" />
      <span class="paper-spec">{{ store.sheetSpec.width }} × {{ store.sheetSpec.height }}mm · 出血 {{ store.sheetSpec.bleed }}mm · 安全区 {{ store.sheetSpec.safe }}mm · {{ store.sheetSpec.grain }}纸纹 · {{ store.locked ? '基线只读' : '编辑中' }}</span>
      <Button v-if="!store.locked" label="审批锁定" icon="pi pi-lock" size="small" @click="store.lockBaseline" />
      <Button v-else label="解锁修订" icon="pi pi-lock-open" size="small" severity="warn" outlined @click="store.unlock" />
    </div>

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
            :pages="store.pages"
            :positions="store.positions"
            :side="store.side"
            :zoom="store.zoom"
            :selected="store.selectedPosition"
            :validations="store.validations"
            :sheet-spec="store.sheetSpec"
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
            <label>页面出血 (mm)<input type="number" :value="store.pages.find((page) => page.pageNo === selected?.pageNo)?.bleed" min="0" max="6" step="1" @change="store.updatePage(selected!.pageNo, { bleed: Number(($event.target as HTMLInputElement).value) })" /></label>
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

    <!-- 换纸对话框 -->
    <Dialog v-model:visible="paperDialog" header="换纸重排 · 保存快照后按出血/安全区/纸纹重排" :style="{ width: '640px' }" modal>
      <div class="paper-form">
        <div class="preset-row">
          <Button v-for="preset in presets" :key="preset.label" :label="preset.label" size="small" outlined @click="applyPreset(preset.width)" />
        </div>
        <div class="form-grid">
          <label>纸张宽度 (mm)<InputNumber v-model="form.width" :min="100" :max="1200" /></label>
          <label>纸张高度 (mm)<InputNumber v-model="form.height" :min="100" :max="1500" /></label>
          <label>出血 (mm)<InputNumber v-model="form.bleed" :min="0" :max="6" /></label>
          <label>安全区 (mm)<InputNumber v-model="form.safe" :min="0" :max="20" /></label>
          <label>版心间距 (mm)<InputNumber v-model="form.gutter" :min="0" :max="30" /></label>
          <label>纸纹方向<Select v-model="form.grain" :options="grainOptions" optionLabel="label" optionValue="value" /></label>
        </div>
        <div class="dialog-actions">
          <Button label="保存快照并重排" icon="pi pi-save" :loading="store.changingPaper" @click="runPaperChange" />
          <Button v-if="outcome && !outcome.ok" label="重试" icon="pi pi-refresh" severity="warn" :loading="store.changingPaper" @click="retry" />
        </div>

        <div v-if="outcome" class="paper-result">
          <Message v-if="!outcome.ok" severity="error" :closable="false">
            <template #default>
              <div>{{ outcome.error }}</div>
              <strong>换纸失败，原快照已保留（{{ store.snapshots[0]?.id }}），可调整规格后直接重试，旧版位与打样记录仍可在「版本对比」中查看。</strong>
            </template>
          </Message>
          <template v-else>
            <Message severity="success" :closable="false"> 已按新纸规格重排，换纸前快照 {{ store.lastSnapshotId }} 已保存。 </Message>
            <p class="shortfall">{{ outcome.shortfall }}</p>
            <div class="capacity-grid">
              <div><span>每面排法</span><strong>{{ outcome.columns }} 列 × {{ outcome.rows }} 行</strong></div>
              <div><span>每面容量</span><strong>{{ outcome.capacityPerFace }} 位</strong></div>
              <div><span>已排版位</span><strong>{{ outcome.placedCount }} / {{ store.pages.length }}</strong></div>
              <div><span>需求纸张</span><strong>{{ outcome.requiredSheets }} 张</strong></div>
            </div>
            <div v-if="outcome.adjusted.length" class="adjusted-note">
              <i class="pi pi-info-circle" />
              <span>纸纹方向修正：P{{ outcome.adjusted.map((item) => item.pageNo).join('、P') }} 旋转已按{{ form.grain === '纵向' ? '纵向' : '横向' }}纸纹归位。</span>
            </div>
            <div v-if="queued.length" class="queue-chips">
              <span v-for="item in queued" :key="item.pageNo" class="chip"><strong>P{{ item.pageNo }}</strong>{{ item.name }} · {{ item.face }}</span>
            </div>
          </template>
        </div>
      </div>
    </Dialog>

    <!-- 并发冲突对话框 -->
    <Dialog v-model:visible="conflictDialog" header="保存冲突：对方已提交新版本" :style="{ width: '560px' }" modal>
      <div v-if="store.conflict" class="conflict-box">
        <Message severity="warn" :closable="false">
          拼版员刚保存了版本 R{{ store.conflict.serverRevision }}，你基于版本 R{{ store.serverRevision }} 的修改与对方修改了同一版位。后保存者不能覆盖对方刚排好的版位，请先查看当前版本与冲突清单。
        </Message>
        <div class="conflict-list">
          <article v-for="item in store.conflict.conflicts" :key="item.id">
            <strong>{{ item.id }} · P{{ item.pageNo }}</strong>
            <div class="conflict-fields">
              <span v-for="field in item.fields" :key="field" class="field">
                {{ conflictFields[field] }}：<em>你的 {{ (item.yours as Record<string, number>)[field] }}</em> → <b>对方 {{ (item.theirs as Record<string, number>)[field] }}</b>
              </span>
            </div>
          </article>
          <div v-if="!store.conflict.conflicts.length" class="muted">双方修改不重叠，可直接合并非冲突修改。</div>
        </div>
        <div class="dialog-actions">
          <Button label="刷新为当前版本（放弃本地修改）" icon="pi pi-refresh" severity="secondary" outlined @click="store.reloadServerVersion" />
          <Button label="合并非冲突修改并保存" icon="pi pi-check" @click="store.mergeAndSave" />
        </div>
      </div>
    </Dialog>
  </section>
</template>

<style scoped>
.actions { display: flex; gap: 8px; }
.mb-3 { margin-bottom: 12px; }
.queue-panel { margin-bottom: 12px; padding: 14px 16px; }
.queue-panel .shortfall { margin: 8px 0 0; color: #8a5a2b; font-size: 12px; line-height: 1.6; }
.queue-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; color: #7a5228; background: #fdf1e0; font-size: 11px; }
.chip strong { color: #b06a2c; }
.toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; padding: 12px; }
.paper-spec { margin-left: auto; color: #5d7077; font-size: 11px; }
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
.preset-row { display: flex; flex-wrap: wrap; gap: 8px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-grid label { display: grid; gap: 5px; color: #5f7076; font-size: 11px; font-weight: 700; }
.dialog-actions { display: flex; gap: 8px; }
.paper-result { display: grid; gap: 10px; }
.shortfall { margin: 0; color: #5d7077; font-size: 12px; line-height: 1.7; }
.capacity-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.capacity-grid > div { display: grid; gap: 4px; padding: 10px; border: 1px solid #e3e9ea; border-radius: 7px; background: #f7faf9; text-align: center; }
.capacity-grid span { color: #7c898e; font-size: 10px; }
.capacity-grid strong { color: #233e47; font-size: 14px; }
.adjusted-note { display: flex; gap: 7px; padding: 9px; color: #5f6a4a; background: #f2f6e9; font-size: 11px; line-height: 1.5; }
.conflict-box { display: grid; gap: 12px; }
.conflict-list { display: grid; gap: 8px; max-height: 260px; overflow: auto; }
.conflict-list article { display: grid; gap: 5px; padding: 10px 12px; border: 1px solid #f0d9b5; border-radius: 7px; background: #fffaf2; }
.conflict-list strong { font-size: 12px; }
.conflict-fields { display: flex; flex-wrap: wrap; gap: 6px 14px; }
.field { color: #7c898e; font-size: 11px; }
.field em { color: #9f4c38; font-style: normal; }
.field b { color: #2d735b; }
@media (max-width: 1200px) { .imposition-grid { grid-template-columns: 200px minmax(0,1fr); } .right-panel { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; } }
@media (max-width: 760px) { .imposition-grid { grid-template-columns: 1fr; } .right-panel { grid-template-columns: 1fr; } .pages-panel { max-height: 300px; } .capacity-grid { grid-template-columns: repeat(2, 1fr); } }
</style>

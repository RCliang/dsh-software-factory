/**
 * 软件工厂宿主插件。
 * 状态在 ctx.storageDomain，写入门禁在 tools/pre-execute 和 ctx.tools.guard。
 * 评审子会话只在能拿到父 Agent，且配置了不继承父上下文的 agentPreset 时才会派发。
 */
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import z from 'zod'
import { observeDirty } from './dirty.js'
import { bindFactoryGates } from '../src/factory/bind-gates.js'
import {
  accept,
  acknowledgeStart,
  addNote,
  allowOpenItems,
  approvePlan,
  approveSpec,
  cancel,
  chooseDirty,
  completeCurrentTask,
  completeInvestigation,
  confirmRelease,
  confirmSmallChange,
  createRun,
  extendBudget,
  openSpec,
  pause,
  project,
  raiseReworkCap,
  recordDirty,
  recordInvestigation,
  recordReviewResult,
  recordVerification,
  reportBlock,
  resolveBlock,
  restoreRun,
  resumePause,
  setBudget,
  setDeveloperSummary,
  setDiff,
  setGoal,
  setMaxRework,
  setQuestions,
  setRuntimeConfig,
  setWorkspaceRoot,
  startInvestigation,
  startNew,
  submitReview,
  updatePlan,
  updateSpec,
} from '../src/factory/index.js'
import { buildReviewPrompt, parseReviewOutput, reviewContentBlocks } from '../src/factory/review.js'

export const name = 'software-factory'
export const inject = ['tools']

const DOMAIN = defineDomain({
  name: 'software_factory',
  version: 1,
  tables: {
    runs: domainTable(z.object({
      body: z.string(),
      updatedAt: z.string(),
    })),
  },
})

const METHODS = [
  'snapshot', 'setGoal', 'setWorkspaceRoot', 'setMaxRework', 'setRuntimeConfig', 'setBudget',
  'acknowledgeStart', 'refreshDirty', 'declareDirty', 'chooseDirty', 'startInvestigation',
  'recordInvestigation', 'completeInvestigation', 'setQuestions', 'addNote', 'updateSpec', 'openSpec',
  'allowOpenItems', 'approveSpec', 'updatePlan', 'approvePlan', 'confirmSmallChange',
  'recordVerification', 'completeCurrentTask', 'setDiff', 'setDeveloperSummary', 'submitReview',
  'dispatchReview', 'accept', 'confirmRelease', 'pause', 'resumePause', 'reportBlock', 'resolveBlock',
  'raiseReworkCap', 'extendBudget', 'cancel', 'startNew',
]

function configOf(config) {
  const raw = config && typeof config === 'object' ? config : {}
  return {
    maxReworkRounds: Number.isInteger(raw.maxReworkRounds) ? raw.maxReworkRounds : 2,
    subagentProvider: typeof raw.subagentProvider === 'string' && raw.subagentProvider ? raw.subagentProvider : 'spawn',
    reviewAgentPreset: typeof raw.reviewAgentPreset === 'string' ? raw.reviewAgentPreset : '',
    workspaceRoot: typeof raw.workspaceRoot === 'string' ? raw.workspaceRoot : '',
  }
}

function textFromResult(result) {
  if (typeof result === 'string') return result
  if (!result || typeof result !== 'object') return ''
  if (typeof result.text === 'string') return result.text
  if (typeof result.output === 'string') return result.output
  if (Array.isArray(result.content)) return result.content.map((block) => block && block.text ? block.text : '').join('\n')
  return JSON.stringify(result)
}

function resolveParent(ctx, sessionId) {
  if (!sessionId) return { parent: null, reason: '没有填写父会话 id。' }
  const agents = ctx.get('agents')
  if (!agents || typeof agents.get !== 'function') {
    return { parent: null, reason: 'ctx.agents.get 不存在。文档没有给出别的已核实查找方法，因此没有派发子会话。' }
  }
  try {
    const parent = agents.get(sessionId)
    if (!parent) return { parent: null, reason: 'agents.get 没有返回这个会话的 Agent。' }
    return { parent, reason: '' }
  } catch (error) {
    return { parent: null, reason: '读取父 Agent 失败：' + String(error && error.message ? error.message : error) }
  }
}

class SoftwareFactoryService extends TypertRemoteService {
  constructor(ctx, config) {
    super(ctx, 'softwareFactory')
    this.defaults = configOf(config)
    this.overlay = {
      hydrating: true,
      durable: false,
      storageError: '',
      domain: null,
      gate: null,
      run: null,
    }
  }

  viewOf(run) {
    return {
      hydrating: this.overlay.hydrating,
      durable: this.overlay.durable,
      storageError: this.overlay.storageError,
      gateInstalled: Boolean(this.overlay.gate && this.overlay.gate.installed),
      gateReason: this.overlay.gate ? this.overlay.gate.reason : '',
      run,
      view: run ? project(run) : null,
    }
  }

  notReady() {
    if (this.overlay.hydrating) return { ok: false, error: '正在从存储恢复，请稍候。', ...this.viewOf(null) }
    if (!this.overlay.run) return { ok: false, error: '没有运行状态。', ...this.viewOf(null) }
    return null
  }

  async commit(result) {
    if (!result.ok) return { ok: false, error: result.error, effects: [], ...this.viewOf(this.overlay.run) }
    if (!this.overlay.durable || !this.overlay.domain) {
      return {
        ok: false,
        error: 'ctx.storageDomain 不可用或打开失败，这次操作没有保存。' + (this.overlay.storageError ? ' ' + this.overlay.storageError : ''),
        effects: [],
        ...this.viewOf(this.overlay.run),
      }
    }
    const previous = this.overlay.run
    this.overlay.run = result.state
    try {
      await this.overlay.domain.table('runs').put('active', {
        body: JSON.stringify(result.state),
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      this.overlay.run = previous
      return {
        ok: false,
        error: '写入存储失败，已保留上一次持久状态：' + String(error && error.message ? error.message : error),
        effects: [],
        ...this.viewOf(previous),
      }
    }
    return { ok: true, error: null, effects: result.effects, ...this.viewOf(result.state) }
  }

  async snapshot(request) {
    void request
    const pending = this.notReady()
    if (pending && this.overlay.hydrating) return pending
    return { ok: true, error: null, effects: [], ...this.viewOf(this.overlay.run) }
  }

  async setGoal(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(setGoal(this.overlay.run, request && request.goal))
  }

  async setWorkspaceRoot(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(setWorkspaceRoot(this.overlay.run, request && request.workspaceRoot))
  }

  async setMaxRework(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(setMaxRework(this.overlay.run, request && request.rounds))
  }

  async setRuntimeConfig(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(setRuntimeConfig(this.overlay.run, request || {}))
  }

  async setBudget(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(setBudget(this.overlay.run, request || {}))
  }

  async acknowledgeStart(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    return this.commit(acknowledgeStart(this.overlay.run))
  }

  async refreshDirty(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    const observed = await observeDirty(this.ctx.get('subprocess'))
    return this.commit(recordDirty(this.overlay.run, observed))
  }

  async declareDirty(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(recordDirty(this.overlay.run, {
      status: request && request.status,
      files: request && request.files,
      source: 'declared',
      detail: request && request.detail,
    }))
  }

  async chooseDirty(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(chooseDirty(this.overlay.run, request && request.choice))
  }

  async startInvestigation(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    if (!this.overlay.gate || !this.overlay.gate.installed) {
      return { ok: false, error: '写入门禁没有安装，拒绝开始。' + (this.overlay.gate ? this.overlay.gate.reason : ''), effects: [], ...this.viewOf(this.overlay.run) }
    }
    return this.commit(startInvestigation(this.overlay.run))
  }

  async recordInvestigation(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(recordInvestigation(this.overlay.run, request || {}))
  }

  async completeInvestigation(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    return this.commit(completeInvestigation(this.overlay.run))
  }

  async setQuestions(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(setQuestions(this.overlay.run, request && request.questions))
  }

  async addNote(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(addNote(this.overlay.run, request && request.text))
  }

  async updateSpec(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(updateSpec(this.overlay.run, request && request.fields))
  }

  async openSpec(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    return this.commit(openSpec(this.overlay.run))
  }

  async allowOpenItems(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    return this.commit(allowOpenItems(this.overlay.run))
  }

  async approveSpec(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    return this.commit(approveSpec(this.overlay.run))
  }

  async updatePlan(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(updatePlan(this.overlay.run, request && request.plan))
  }

  async approvePlan(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    return this.commit(approvePlan(this.overlay.run))
  }

  async confirmSmallChange(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    return this.commit(confirmSmallChange(this.overlay.run))
  }

  async recordVerification(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(recordVerification(this.overlay.run, request || {}))
  }

  async completeCurrentTask(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    return this.commit(completeCurrentTask(this.overlay.run))
  }

  async setDiff(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(setDiff(this.overlay.run, request && request.diff))
  }

  async setDeveloperSummary(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(setDeveloperSummary(this.overlay.run, request && request.summary))
  }

  async submitReview(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    return this.commit(submitReview(this.overlay.run))
  }

  /**
   * 派发不继承父上下文的本地评审。失败时不会把评审记为通过。
   * parent 只通过 agents.get(sessionId) 尝试；该方法未在本仓库对真实 DSH 验证。
   */
  async dispatchReview(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    const state = this.overlay.run
    const built = buildReviewPrompt(state)
    if (!built.ok) return { ok: false, error: built.error, effects: [], ...this.viewOf(state) }
    const preset = state.runtimeConfig.reviewAgentPreset
    if (!preset) {
      return { ok: false, error: '未填写 reviewAgentPreset。独立评审必须使用不继承父上下文的预设，工厂不会编造预设 id。', effects: [], ...this.viewOf(state) }
    }
    const subagents = this.ctx.get('subagents')
    if (!subagents || typeof subagents.startActivation !== 'function') {
      return { ok: false, error: 'ctx.subagents.startActivation 不可用，评审保持未通过。', effects: [], ...this.viewOf(state) }
    }
    const resolved = resolveParent(this.ctx, state.runtimeConfig.sessionId)
    if (!resolved.parent) return { ok: false, error: resolved.reason + ' 评审保持未通过。', effects: [], ...this.viewOf(state) }
    try {
      const signal = AbortSignal.timeout(120000)
      const activation = await subagents.startActivation({
        provider: state.runtimeConfig.subagentProvider || 'spawn',
        label: 'factory-review',
        name: 'sf-review',
        prompt: reviewContentBlocks(built.prompt),
        parent: resolved.parent,
        signal,
        delivery: 'caller',
        agentPreset: preset,
      })
      const output = textFromResult(await activation.result)
      const parsed = parseReviewOutput(output)
      if (!parsed.ok) return { ok: false, error: parsed.error + ' 评审保持未通过。', effects: [], ...this.viewOf(this.overlay.run) }
      return this.commit(recordReviewResult(this.overlay.run, {
        ...parsed.result,
        specVersion: this.overlay.run.spec.version,
        planVersion: this.overlay.run.plan.version,
      }))
    } catch (error) {
      return { ok: false, error: '评审子会话失败，没有记为通过：' + String(error && error.message ? error.message : error), effects: [], ...this.viewOf(this.overlay.run) }
    }
  }

  async accept(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    return this.commit(accept(this.overlay.run))
  }

  async confirmRelease(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(confirmRelease(this.overlay.run, request && request.step))
  }

  async pause(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    return this.commit(pause(this.overlay.run))
  }

  async resumePause(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    return this.commit(resumePause(this.overlay.run))
  }

  async reportBlock(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(reportBlock(this.overlay.run, request || {}))
  }

  async resolveBlock(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(resolveBlock(this.overlay.run, request && request.action))
  }

  async raiseReworkCap(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(raiseReworkCap(this.overlay.run, request && request.rounds))
  }

  async extendBudget(request) {
    const pending = this.notReady(); if (pending) return pending
    return this.commit(extendBudget(this.overlay.run, request && request.minutes))
  }

  async cancel(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    return this.commit(cancel(this.overlay.run))
  }

  async startNew(request) {
    void request
    const pending = this.notReady(); if (pending) return pending
    const created = startNew(this.overlay.run, this.defaults)
    if (!created.ok) return { ok: false, error: created.error, effects: [], ...this.viewOf(this.overlay.run) }
    if (this.overlay.domain && this.overlay.run) {
      try {
        await this.overlay.domain.table('runs').put('archive-' + this.overlay.run.id, {
          body: JSON.stringify(this.overlay.run),
          updatedAt: new Date().toISOString(),
        })
      } catch { /* 归档失败不清理工作区，下面的 commit 仍会拒绝不可持久的替换 */ }
    }
    return this.commit(created)
  }
}

const markerInitializers = []
for (const method of METHODS) {
  Remote(method)(SoftwareFactoryService.prototype, {
    name: method,
    private: false,
    static: false,
    addInitializer: (fn) => { markerInitializers.push(fn) },
  })
}

export function apply(ctx, config) {
  const service = new SoftwareFactoryService(ctx, config)
  for (const init of markerInitializers) init.call(service)
  service.overlay.gate = bindFactoryGates(ctx, () => ({
    hydrating: service.overlay.hydrating,
    run: service.overlay.run,
  }))
  let closed = false
  const opening = openDomain(ctx).then((opened) => {
    if (closed) {
      if (opened.domain) opened.domain.close().catch(() => {})
      return
    }
    service.overlay.domain = opened.domain
    service.overlay.durable = opened.durable
    service.overlay.storageError = opened.error
    if (opened.saved) service.overlay.run = restoreRun(opened.saved)
    else service.overlay.run = createRun(service.defaults)
    service.overlay.hydrating = false
  }).catch((error) => {
    service.overlay.durable = false
    service.overlay.storageError = String(error && error.message ? error.message : error)
    service.overlay.run = createRun(service.defaults)
    service.overlay.hydrating = false
  })
  ctx.effect(() => () => {
    closed = true
    if (service.overlay.gate) service.overlay.gate.dispose()
    opening.then(() => {
      if (service.overlay.domain) service.overlay.domain.close().catch(() => {})
    }).catch(() => {})
  })
}

async function openDomain(ctx) {
  const facility = ctx.get('storageDomain')
  if (!facility || typeof facility.open !== 'function') {
    return { domain: null, durable: false, saved: null, error: 'ctx.storageDomain 不存在。请确认 profile 挂载了存储域。' }
  }
  const domain = await facility.open(DOMAIN)
  const row = domain.table('runs').get('active')
  let saved = null
  if (row && typeof row.body === 'string') {
    try { saved = JSON.parse(row.body) } catch { saved = null }
  }
  return { domain, durable: true, saved, error: '' }
}

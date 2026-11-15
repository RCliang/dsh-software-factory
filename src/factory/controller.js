/**
 * 软件工厂流程控制器。
 * 纯函数：不读文件系统、不调用 git、不依赖 DSH。
 * 持久化、工具拦截和子会话由宿主适配器接到官方 API 上。
 */

const PHASES = [
  'start',
  'investigate',
  'clarify',
  'spec',
  'plan',
  'develop',
  'review',
  'accept',
  'commit',
  'push',
  'merge',
  'release',
  'done',
  'cancelled',
  'blocked',
]

const RELEASE_STEPS = ['commit', 'push', 'merge', 'release']

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function nowId() {
  return 'sf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

function fail(state, error) {
  return { ok: false, error, state, effects: [] }
}

function ok(state, effects = []) {
  return { ok: true, error: null, state, effects }
}

function pushEvent(state, type, detail, at) {
  const events = state.events.concat({ at, type, detail })
  return { ...state, events: events.slice(-200) }
}

export function emptySpecFields() {
  return {
    goal: '',
    currentBehavior: '',
    scenario: '',
    preserve: '',
    outOfScope: '',
    acceptance: [],
    openItems: [],
    touchesExistingBehavior: null,
    refactor: false,
  }
}

export function createRun(config = {}, at = Date.now()) {
  const maxReworkRounds = Number.isInteger(config.maxReworkRounds) && config.maxReworkRounds >= 0
    ? config.maxReworkRounds
    : 2
  return {
    id: nowId(),
    phase: 'start',
    engaged: false,
    paused: false,
    goal: '',
    workspaceRoot: typeof config.workspaceRoot === 'string' ? config.workspaceRoot : '',
    defaults: {
      maxReworkRounds,
      acknowledged: false,
    },
    runtimeConfig: {
      subagentProvider: typeof config.subagentProvider === 'string' && config.subagentProvider
        ? config.subagentProvider
        : 'spawn',
      reviewAgentPreset: typeof config.reviewAgentPreset === 'string' ? config.reviewAgentPreset : '',
      sessionId: '',
    },
    budget: {
      timeLimitMinutes: null,
      spendChoice: null,
      spendNote: '',
      confirmed: false,
      startedAt: null,
      deadlineAt: null,
    },
    dirty: {
      status: 'unknown',
      files: [],
      decision: null,
      source: null,
      detail: '',
    },
    investigation: {
      facts: [],
      inferences: [],
      locations: [],
      completed: false,
    },
    questions: [],
    notes: [],
    spec: {
      version: 1,
      status: 'draft',
      fields: emptySpecFields(),
      approvedAt: null,
    },
    allowOpenItems: false,
    plan: {
      version: 1,
      specVersion: null,
      status: 'draft',
      invalidReason: null,
      tasks: [],
      existingBehaviorImpact: '',
      approvedAt: null,
    },
    taskRuntime: {},
    currentTaskId: null,
    diff: '',
    developerSummary: '',
    review: {
      status: 'none',
      specVersion: null,
      planVersion: null,
      findings: '',
      inScope: null,
    },
    acceptance: { accepted: false, acceptedAt: null },
    release: { commit: false, push: false, merge: false, release: false },
    block: null,
    events: [{ at, type: 'created', detail: '新建运行。建议默认尚未被确认。' }],
    cancelledAt: null,
    finishedAt: null,
  }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeFields(fields, base = emptySpecFields()) {
  const src = fields && typeof fields === 'object' ? fields : {}
  const acceptance = Array.isArray(src.acceptance) ? src.acceptance : base.acceptance
  const openItems = Array.isArray(src.openItems) ? src.openItems : base.openItems
  let touches = src.touchesExistingBehavior
  if (touches === undefined) touches = base.touchesExistingBehavior
  if (touches !== true && touches !== false && touches !== null) touches = null
  return {
    goal: src.goal === undefined ? base.goal : String(src.goal),
    currentBehavior: src.currentBehavior === undefined ? base.currentBehavior : String(src.currentBehavior),
    scenario: src.scenario === undefined ? base.scenario : String(src.scenario),
    preserve: src.preserve === undefined ? base.preserve : String(src.preserve),
    outOfScope: src.outOfScope === undefined ? base.outOfScope : String(src.outOfScope),
    acceptance: acceptance.map((item) => ({
      id: text(item && item.id),
      statement: text(item && item.statement),
    })),
    openItems: openItems.map((item) => ({
      id: text(item && item.id),
      text: text(item && item.text),
    })),
    touchesExistingBehavior: touches,
    refactor: src.refactor === undefined ? Boolean(base.refactor) : Boolean(src.refactor),
  }
}

export function needsSeparateConfirmation(fields) {
  return fields.touchesExistingBehavior === true || fields.refactor === true
}

export function fingerprintTask(task) {
  return JSON.stringify({
    files: [...task.files].map((f) => f.trim()).sort(),
    verify: [...task.verifyCommands],
    acceptance: [...task.acceptanceIds],
  })
}

function unresolvedOpenItems(fields) {
  return fields.openItems.filter((item) => item.text !== '')
}

function specProblems(fields) {
  const problems = []
  if (!text(fields.goal)) problems.push('目标为空')
  if (!text(fields.currentBehavior)) problems.push('当前行为及依据为空')
  if (!text(fields.scenario)) problems.push('场景与边界为空')
  if (!text(fields.preserve)) problems.push('未说明须保留的既有行为')
  if (!text(fields.outOfScope)) problems.push('明确不做的内容为空')
  if (fields.touchesExistingBehavior !== true && fields.touchesExistingBehavior !== false) {
    problems.push('未说明是否改变既有行为')
  }
  if (!fields.acceptance.length) problems.push('没有编号验收项')
  const ids = new Set()
  for (const item of fields.acceptance) {
    if (!item.id || !item.statement) problems.push('验收项缺少编号或描述')
    else if (ids.has(item.id)) problems.push('验收编号重复：' + item.id)
    ids.add(item.id)
  }
  return problems
}

function normalizeTask(task) {
  const src = task && typeof task === 'object' ? task : {}
  return {
    id: text(src.id),
    title: text(src.title),
    intent: text(src.intent),
    files: Array.isArray(src.files) ? src.files.map((f) => text(f)).filter(Boolean) : [],
    dependsOn: Array.isArray(src.dependsOn) ? src.dependsOn.map((f) => text(f)).filter(Boolean) : [],
    acceptanceIds: Array.isArray(src.acceptanceIds) ? src.acceptanceIds.map((f) => text(f)).filter(Boolean) : [],
    verifyCommands: Array.isArray(src.verifyCommands) ? src.verifyCommands.map((f) => String(f).trim()).filter(Boolean) : [],
    notesToLoad: Array.isArray(src.notesToLoad) ? src.notesToLoad.map((f) => text(f)).filter(Boolean) : [],
  }
}

function planProblems(fields, tasks, impact) {
  const problems = []
  if (!tasks.length) problems.push('计划没有任何任务')
  const ids = new Set()
  for (const task of tasks) {
    if (!task.id || !task.title) problems.push('任务缺少编号或标题')
    if (ids.has(task.id)) problems.push('任务编号重复：' + task.id)
    ids.add(task.id)
    if (!task.files.length) problems.push((task.id || '任务') + ' 没有文件范围')
    if (!task.acceptanceIds.length) problems.push((task.id || '任务') + ' 没有验收映射')
  }
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!ids.has(dep)) problems.push(task.id + ' 依赖未知任务 ' + dep)
      if (dep === task.id) problems.push(task.id + ' 不能依赖自己')
    }
    for (const acc of task.acceptanceIds) {
      if (!fields.acceptance.some((item) => item.id === acc)) problems.push(task.id + ' 引用了未知验收项 ' + acc)
    }
  }
  for (const item of fields.acceptance) {
    if (item.id && !tasks.some((task) => task.acceptanceIds.includes(item.id))) {
      problems.push('验收项 ' + item.id + ' 没有映射到任务')
    }
  }
  if (needsSeparateConfirmation(fields) && !text(impact)) {
    problems.push('涉及重构或既有行为变化，计划必须单独说明对既有行为的影响')
  }
  const visiting = new Set()
  const done = new Set()
  function walk(id, stack) {
    if (stack.includes(id)) {
      problems.push('任务依赖有环')
      return
    }
    if (done.has(id)) return
    const task = tasks.find((item) => item.id === id)
    if (!task) return
    for (const dep of task.dependsOn) walk(dep, stack.concat(id))
    done.add(id)
  }
  for (const task of tasks) walk(task.id, [])
  void visiting
  return problems
}

function invalidatePlan(state, reason) {
  if (state.plan.status === 'draft' && state.plan.approvedAt === null && state.plan.tasks.length === 0) {
    return { ...state, plan: { ...state.plan, specVersion: state.spec.version, invalidReason: null } }
  }
  return {
    ...state,
    plan: {
      ...state.plan,
      status: 'invalid',
      invalidReason: reason,
      approvedAt: null,
    },
    review: { status: 'none', specVersion: null, planVersion: null, findings: '', inScope: null },
    acceptance: { accepted: false, acceptedAt: null },
    release: { commit: false, push: false, merge: false, release: false },
    currentTaskId: null,
  }
}

function clearDownstream(state) {
  return {
    ...state,
    review: { status: 'none', specVersion: null, planVersion: null, findings: '', inScope: null },
    acceptance: { accepted: false, acceptedAt: null },
    release: { commit: false, push: false, merge: false, release: false },
  }
}

function budgetBlocks(state, at) {
  return Boolean(state.budget.deadlineAt && at > state.budget.deadlineAt)
}

function activateTasks(state) {
  const runtime = {}
  for (const task of state.plan.tasks) {
    const fp = fingerprintTask(task)
    const prev = state.taskRuntime[task.id]
    if (prev && prev.status === 'done' && prev.scopeFingerprint === fp) {
      runtime[task.id] = prev
    } else {
      runtime[task.id] = {
        status: 'pending',
        reworkRounds: 0,
        scopeFingerprint: fp,
        evidence: [],
      }
    }
  }
  const current = nextTaskId({ ...state, taskRuntime: runtime, plan: state.plan })
  if (current) runtime[current] = { ...runtime[current], status: 'active' }
  return { taskRuntime: runtime, currentTaskId: current }
}

function nextTaskId(state) {
  const done = new Set(
    state.plan.tasks
      .filter((task) => state.taskRuntime[task.id] && state.taskRuntime[task.id].status === 'done')
      .map((task) => task.id),
  )
  for (const task of state.plan.tasks) {
    if (done.has(task.id)) continue
    if (task.dependsOn.every((dep) => done.has(dep))) return task.id
  }
  return null
}

function latestEvidence(runtime) {
  const map = new Map()
  for (const item of runtime.evidence) map.set(item.acceptanceId, item)
  return map
}

export function approvedSpec(state) {
  if (!state || state.spec.status !== 'approved') return null
  return state.spec
}

export function approvedPlan(state) {
  if (!state || state.plan.status !== 'approved') return null
  if (state.spec.status !== 'approved') return null
  if (state.plan.specVersion !== state.spec.version) return null
  return state.plan
}

export function setGoal(state, goal, at = Date.now()) {
  if (state.phase !== 'start' || state.engaged) return fail(state, '调查开始后不能在这里改目标；请回到澄清并修改需求。')
  const next = text(goal)
  if (!next) return fail(state, '请先写要做什么。')
  return ok(pushEvent({ ...state, goal: next }, 'goal', next, at))
}

export function setWorkspaceRoot(state, root, at = Date.now()) {
  if (state.engaged && !['start', 'investigate', 'clarify', 'spec', 'plan'].includes(state.phase)) {
    return fail(state, '开发开始后不能改工作区根。')
  }
  return ok(pushEvent({ ...state, workspaceRoot: text(root) }, 'workspace-root', text(root), at))
}

export function setMaxRework(state, rounds, at = Date.now()) {
  if (state.defaults.acknowledged && state.engaged) return fail(state, '运行开始后不能再改自动返修上限；如需放宽，在阻断里单独确认。')
  if (!Number.isInteger(rounds) || rounds < 0 || rounds > 10) return fail(state, '自动返修轮次必须是 0 到 10 的整数。')
  return ok({ ...state, defaults: { ...state.defaults, maxReworkRounds: rounds, acknowledged: false } })
}

export function setRuntimeConfig(state, patch, at = Date.now()) {
  const prev = state.runtimeConfig
  const next = { ...prev }
  if (patch.subagentProvider !== undefined) {
    const provider = text(patch.subagentProvider)
    if (!provider) return fail(state, '子会话 provider 不能为空。')
    next.subagentProvider = provider
  }
  if (patch.reviewAgentPreset !== undefined) next.reviewAgentPreset = String(patch.reviewAgentPreset).trim()
  if (patch.sessionId !== undefined) next.sessionId = String(patch.sessionId).trim()
  return ok(pushEvent({ ...state, runtimeConfig: next }, 'runtime-config', '更新子会话配置', at))
}

export function setBudget(state, input, at = Date.now()) {
  if (state.engaged && state.phase !== 'blocked') return fail(state, '运行开始后不能在这里改额度。')
  if (state.phase === 'blocked' && state.block && state.block.reason !== 'budget') {
    return fail(state, '当前阻断不是额度用尽。')
  }
  const minutes = input.timeLimitMinutes
  if (!Number.isFinite(minutes) || minutes <= 0) return fail(state, '请填写大于 0 的时间额度（分钟）。工厂不预设具体时长。')
  if (input.spendChoice !== 'no-cap' && input.spendChoice !== 'note') {
    return fail(state, '请明确花费额度：本次不设费用上限，或只记录一句说明。工厂不编造费用数字。')
  }
  const spendNote = text(input.spendNote)
  if (input.spendChoice === 'note' && !spendNote) return fail(state, '选择文字说明时，请写下花费约束。')
  return ok({
    ...state,
    budget: {
      ...state.budget,
      timeLimitMinutes: minutes,
      spendChoice: input.spendChoice,
      spendNote,
      confirmed: false,
    },
  })
}

export function acknowledgeStart(state, at = Date.now()) {
  if (state.phase !== 'start' || state.engaged) return fail(state, '开始条件只能在调查前确认。')
  if (!text(state.goal)) return fail(state, '请先写要做什么。')
  if (!state.budget.timeLimitMinutes || !state.budget.spendChoice) return fail(state, '请先填写时间额度，并明确花费额度。')
  return ok(pushEvent({
    ...state,
    defaults: { ...state.defaults, acknowledged: true },
    budget: { ...state.budget, confirmed: true },
  }, 'acknowledge-start', '已确认建议默认、时间额度和花费口径。', at))
}

export function recordDirty(state, observation, at = Date.now()) {
  const status = observation.status
  if (status !== 'unknown' && status !== 'clean' && status !== 'dirty') return fail(state, '工作区状态无法识别。')
  const files = Array.isArray(observation.files) ? observation.files.map((f) => text(f)).filter(Boolean) : []
  if (status === 'clean' && files.length) return fail(state, '干净的工作区不能同时列着未提交文件。')
  if (status === 'dirty' && !files.length) return fail(state, '有未提交改动时必须列出摘要，不能当作干净。')
  const sameFiles = JSON.stringify(files) === JSON.stringify(state.dirty.files)
  const decision = status === 'dirty' && sameFiles ? state.dirty.decision : null
  return ok(pushEvent({
    ...state,
    dirty: {
      status,
      files,
      decision: status === 'dirty' ? decision : null,
      source: observation.source === 'declared' ? 'declared' : 'observed',
      detail: text(observation.detail),
    },
  }, 'dirty', status + (files.length ? ' ' + files.length + ' 个文件' : ''), at))
}

export function chooseDirty(state, choice, at = Date.now()) {
  if (state.phase !== 'start' || state.engaged) return fail(state, '调查开始后不能重选脏工作区处理方式。')
  if (state.dirty.status !== 'dirty') return fail(state, '当前没有待处理的未提交改动。')
  if (choice === 'cancel') return cancel(state, at)
  if (choice === 'handle') {
    return ok(pushEvent({
      ...state,
      dirty: { ...state.dirty, decision: 'handle' },
    }, 'dirty-decision', '用户选择先自行处理未提交改动。工厂不会清理工作区。', at))
  }
  if (choice === 'allow') {
    return ok(pushEvent({
      ...state,
      dirty: { ...state.dirty, decision: 'allow' },
    }, 'dirty-decision', '用户允许在现有改动上继续。工厂不会清理这些改动。', at))
  }
  return fail(state, '请选择先处理、允许在现有改动上继续，或取消。')
}

function dirtyReady(state) {
  if (state.dirty.status === 'unknown') return '还不知道工作区是否干净。请读取或明确声明后再开始调查。'
  if (state.dirty.status === 'dirty' && state.dirty.decision !== 'allow') {
    return '有未提交改动。请先自行处理，或明确允许在现有改动上继续。工厂不会自动清理。'
  }
  return null
}

export function startInvestigation(state, at = Date.now()) {
  if (state.phase !== 'start' || state.engaged) return fail(state, '调查已经开始或当前不在开始阶段。')
  if (!state.defaults.acknowledged || !state.budget.confirmed) return fail(state, '请先确认时间额度、花费口径和建议默认。这些还不是已替你批准的政策。')
  const dirtyError = dirtyReady(state)
  if (dirtyError) return fail(state, dirtyError)
  const deadlineAt = at + state.budget.timeLimitMinutes * 60 * 1000
  let next = {
    ...state,
    phase: 'investigate',
    engaged: true,
    budget: { ...state.budget, startedAt: at, deadlineAt },
  }
  next = pushEvent(next, 'investigate-start', '开始只读调查。此阶段拒绝写入。', at)
  return ok(next, [{ type: 'phase', phase: 'investigate', writes: false }])
}

export function recordInvestigation(state, report, at = Date.now()) {
  if (state.phase !== 'investigate') return fail(state, '只有调查阶段可以写入现状。')
  const facts = Array.isArray(report.facts) ? report.facts.map((item) => text(item)).filter(Boolean) : []
  const inferences = Array.isArray(report.inferences) ? report.inferences.map((item) => text(item)).filter(Boolean) : []
  const locations = Array.isArray(report.locations) ? report.locations.map((item) => text(item)).filter(Boolean) : []
  if (!facts.length) return fail(state, '调查至少要有一条已查证事实。')
  return ok(pushEvent({
    ...state,
    investigation: { facts, inferences, locations, completed: false },
  }, 'investigation', facts.length + ' 条事实', at))
}

export function completeInvestigation(state, at = Date.now()) {
  if (state.phase !== 'investigate') return fail(state, '当前不是调查阶段。')
  if (!state.investigation.facts.length) return fail(state, '调查未完成，不能开始提问。')
  return ok(pushEvent({
    ...state,
    phase: 'clarify',
    investigation: { ...state.investigation, completed: true },
  }, 'investigation-done', '调查完成，进入澄清。', at))
}

export function setQuestions(state, questions, at = Date.now()) {
  if (state.phase !== 'clarify') return fail(state, '只有澄清阶段提出关键问题。')
  if (!state.investigation.completed) return fail(state, '调查未完成，不能开始提问。')
  const list = Array.isArray(questions) ? questions : []
  if (list.length > 2) return fail(state, '每次最多两个问题。')
  const normalized = []
  for (const item of list) {
    const prompt = text(item && item.text)
    const why = text(item && item.why)
    if (!prompt || !why) return fail(state, '每个问题都要写明内容，以及为什么不能从代码里直接查到。')
    normalized.push({ text: prompt, why })
  }
  return ok({ ...state, questions: normalized })
}

export function addNote(state, note, at = Date.now()) {
  const body = text(note)
  if (!body) return fail(state, '备注是空的。')
  if (state.phase === 'cancelled' || state.phase === 'done') return fail(state, '运行已经结束。')
  const notes = state.notes.concat({ at, text: body })
  return ok({ ...state, notes })
}

export function updateSpec(state, fields, at = Date.now()) {
  if (!['clarify', 'spec', 'plan', 'develop', 'review', 'accept', 'blocked'].includes(state.phase)) {
    return fail(state, '现在不能改需求。')
  }
  const nextFields = normalizeFields(fields, state.spec.fields)
  if (JSON.stringify(nextFields) === JSON.stringify(state.spec.fields)) return ok(state)
  const wasApproved = state.spec.status === 'approved'
  let next = {
    ...state,
    spec: {
      version: wasApproved ? state.spec.version + 1 : state.spec.version,
      status: 'draft',
      fields: nextFields,
      approvedAt: null,
    },
    allowOpenItems: JSON.stringify(nextFields.openItems) === JSON.stringify(state.spec.fields.openItems)
      ? state.allowOpenItems
      : false,
  }
  if (wasApproved || state.plan.status === 'approved') {
    next = invalidatePlan(next, 'spec-changed')
  }
  if (['plan', 'develop', 'review', 'accept', 'commit', 'push', 'merge', 'release', 'blocked'].includes(state.phase)) {
    next = { ...next, phase: 'spec', block: null, paused: false }
  }
  next = pushEvent(next, 'spec-edit', wasApproved ? '已批准的需求被修改，版本递增，旧计划失效。' : '更新需求草稿。', at)
  return ok(next, wasApproved ? [{ type: 'invalidate-plan', reason: 'spec-changed' }] : [])
}

export function openSpec(state, at = Date.now()) {
  if (state.phase !== 'clarify' && state.phase !== 'spec') return fail(state, '请先完成调查并进入澄清。')
  if (!state.investigation.completed) return fail(state, '调查未完成，不能形成待确认需求。')
  if (state.phase === 'spec') return ok(state)
  return ok(pushEvent({ ...state, phase: 'spec' }, 'spec-open', '进入需求确认。', at))
}

export function allowOpenItems(state, at = Date.now()) {
  if (state.phase !== 'spec') return fail(state, '只有需求确认阶段可以允许未决项。')
  if (!unresolvedOpenItems(state.spec.fields).length) return fail(state, '当前没有未决项。')
  return ok(pushEvent({ ...state, allowOpenItems: true }, 'allow-open-items', '用户明确允许带着未决项继续。', at))
}

function approveSpecState(state, at) {
  if (state.spec.status === 'approved') return ok(state)
  const problems = specProblems(state.spec.fields)
  if (problems.length) return fail(state, problems[0])
  const open = unresolvedOpenItems(state.spec.fields)
  if (open.length && !state.allowOpenItems) {
    return fail(state, '存在未决项。默认不能进入计划，除非明确允许带着未决项继续。')
  }
  const next = pushEvent({
    ...state,
    spec: { ...state.spec, status: 'approved', approvedAt: at },
  }, 'spec-approved', '批准需求版本 v' + state.spec.version, at)
  return ok(next, [{ type: 'approve-spec', version: state.spec.version }])
}

export function approveSpec(state, at = Date.now()) {
  if (state.phase !== 'spec') return fail(state, '当前不是需求确认。')
  const approved = approveSpecState(state, at)
  if (!approved.ok) return approved
  if (approved.state.spec.status !== 'approved') return approved
  const phase = approved.state.phase === 'spec' ? 'plan' : approved.state.phase
  return ok({ ...approved.state, phase }, approved.effects)
}

function normalizePlanInput(state, input) {
  const tasks = Array.isArray(input.tasks) ? input.tasks.map(normalizeTask) : []
  return {
    tasks,
    existingBehaviorImpact: text(input.existingBehaviorImpact),
  }
}

export function updatePlan(state, input, at = Date.now()) {
  if (!['plan', 'spec', 'develop', 'blocked'].includes(state.phase)) return fail(state, '现在不能改计划。')
  if (state.spec.status !== 'approved') return fail(state, '需求还没批准，不能写可执行计划。')
  const draft = normalizePlanInput(state, input || {})
  const version = state.plan.status === 'draft' ? state.plan.version : state.plan.version + 1
  let next = {
    ...state,
    phase: 'plan',
    block: null,
    plan: {
      version,
      specVersion: state.spec.version,
      status: 'draft',
      invalidReason: null,
      tasks: draft.tasks,
      existingBehaviorImpact: draft.existingBehaviorImpact,
      approvedAt: null,
    },
    currentTaskId: null,
  }
  next = clearDownstream(next)
  next = pushEvent(next, 'plan-edit', '更新计划草稿 v' + version + '，绑定需求 v' + state.spec.version, at)
  return ok(next)
}

function approvePlanState(state, at) {
  if (state.spec.status !== 'approved') return fail(state, '需求未批准，不能批准计划，也不能改代码。')
  if (state.plan.status === 'invalid') return fail(state, '旧计划已失效（' + (state.plan.invalidReason || '版本不再有效') + '）。请更新计划后重新确认。')
  if (state.plan.specVersion !== state.spec.version) return fail(state, '计划没有绑定当前已批准的需求版本。')
  const problems = planProblems(state.spec.fields, state.plan.tasks, state.plan.existingBehaviorImpact)
  if (problems.length) return fail(state, problems[0])
  const preserveError = text(state.spec.fields.preserve) ? null : '未说明须保留的既有行为，不能开工。'
  if (preserveError) return fail(state, preserveError)
  const activated = activateTasks({ ...state, plan: { ...state.plan, status: 'approved' } })
  let next = {
    ...state,
    phase: 'develop',
    paused: false,
    block: null,
    plan: { ...state.plan, status: 'approved', approvedAt: at, invalidReason: null },
    taskRuntime: activated.taskRuntime,
    currentTaskId: activated.currentTaskId,
  }
  next = pushEvent(next, 'plan-approved', '批准计划版本 v' + state.plan.version + '。此后只允许改当前任务范围内的文件。', at)
  return ok(next, [{ type: 'approve-plan', version: state.plan.version, specVersion: state.spec.version }])
}

export function approvePlan(state, at = Date.now()) {
  if (state.phase !== 'plan' && state.phase !== 'develop') return fail(state, '当前不能批准计划。')
  if (state.plan.status === 'approved' && state.phase === 'develop' && approvedPlan(state)) return ok(state)
  return approvePlanState(state, at)
}

export function confirmSmallChange(state, at = Date.now()) {
  if (needsSeparateConfirmation(state.spec.fields)) {
    return fail(state, '这次会改既有行为或包含重构，需求和计划必须分开确认。')
  }
  if (state.phase !== 'spec' && state.phase !== 'plan') return fail(state, '小改的一次确认只在需求或计划确认阶段可用。')
  const specResult = state.spec.status === 'approved' ? ok(state) : approveSpecState({ ...state, phase: 'spec' }, at)
  if (!specResult.ok) return specResult
  const withPlanPhase = { ...specResult.state, phase: 'plan' }
  const planResult = approvePlanState(withPlanPhase, at)
  if (!planResult.ok) return fail(state, planResult.error)
  return ok(planResult.state, specResult.effects.concat(planResult.effects, [{ type: 'combined-confirmation', separateBlocks: true }]))
}

export function recordVerification(state, input, at = Date.now()) {
  if (state.phase !== 'develop' || state.paused) return fail(state, '只有开发与自验进行中可以记录验证。')
  if (state.block) return fail(state, '运行已被阻断。')
  if (budgetBlocks(state, at)) return block(state, { reason: 'budget', detail: '时间额度已用尽。' }, at)
  const plan = approvedPlan(state)
  if (!plan) return fail(state, '没有已批准且未失效的计划，不能记录开发验证。')
  const taskId = text(input.taskId) || state.currentTaskId
  if (!taskId || taskId !== state.currentTaskId) return fail(state, '只能为当前任务记录验证。')
  const task = plan.tasks.find((item) => item.id === taskId)
  if (!task) return fail(state, '当前任务不在已批准计划里。')
  const acceptanceId = text(input.acceptanceId)
  if (!task.acceptanceIds.includes(acceptanceId)) return fail(state, '该验收项不属于当前任务。')
  const result = input.result
  if (result !== 'pass' && result !== 'fail' && result !== 'uncovered') return fail(state, '验证结果必须是通过、失败或尚未覆盖。')
  let klass = input.klass || null
  if (result === 'fail') {
    if (!['env', 'preexisting', 'introduced'].includes(klass)) return fail(state, '失败必须区分环境故障、开工前原有失败或本次引入。')
  } else if (result === 'uncovered') {
    klass = 'uncovered'
  } else klass = null
  const runtime = state.taskRuntime[taskId]
  if (!runtime || runtime.scopeFingerprint !== fingerprintTask(task)) {
    return fail(state, '任务范围与已批准计划不一致，拒绝沿用旧证据。')
  }
  const evidence = runtime.evidence.concat({
    at,
    acceptanceId,
    result,
    klass,
    command: text(input.command),
    output: typeof input.output === 'string' ? input.output.slice(0, 8000) : '',
  })
  let nextRuntime = { ...runtime, evidence, status: 'active' }
  let next = { ...state, taskRuntime: { ...state.taskRuntime, [taskId]: nextRuntime } }
  if (result === 'fail' && klass === 'introduced') {
    if (nextRuntime.reworkRounds < state.defaults.maxReworkRounds) {
      nextRuntime = { ...nextRuntime, reworkRounds: nextRuntime.reworkRounds + 1 }
      next = pushEvent({
        ...next,
        taskRuntime: { ...next.taskRuntime, [taskId]: nextRuntime },
      }, 'rework', taskId + ' 自动返修 ' + nextRuntime.reworkRounds + '/' + state.defaults.maxReworkRounds, at)
      return ok(next, [{ type: 'rework', taskId, round: nextRuntime.reworkRounds }])
    }
    next = {
      ...next,
      taskRuntime: { ...next.taskRuntime, [taskId]: nextRuntime },
    }
    return block(next, { reason: 'rework', detail: taskId + ' 已用完自动返修轮次，停在现场。' }, at)
  }
  next = pushEvent(next, 'verify', acceptanceId + ' ' + result, at)
  return ok(next)
}

export function completeCurrentTask(state, at = Date.now()) {
  if (state.phase !== 'develop' || state.paused) return fail(state, '当前不能完成任务。')
  const plan = approvedPlan(state)
  if (!plan) return fail(state, '计划未批准或已失效。')
  const taskId = state.currentTaskId
  const task = plan.tasks.find((item) => item.id === taskId)
  if (!task) return fail(state, '没有进行中的任务。')
  const runtime = state.taskRuntime[taskId]
  const latest = latestEvidence(runtime)
  for (const id of task.acceptanceIds) {
    const item = latest.get(id)
    if (!item) return fail(state, '验收项 ' + id + ' 还没有验证记录。')
    if (item.result === 'uncovered') return fail(state, '验收项 ' + id + ' 尚未覆盖，不能把任务标完成。')
    if (item.result === 'fail' && item.klass === 'introduced') return fail(state, '验收项 ' + id + ' 仍是本次引入的失败。')
    if (item.result === 'fail' && item.klass === 'env') return fail(state, '验收项 ' + id + ' 是环境故障，不能当成完成。')
  }
  const doneRuntime = { ...runtime, status: 'done' }
  const taskRuntime = { ...state.taskRuntime, [taskId]: doneRuntime }
  const currentTaskId = nextTaskId({ ...state, taskRuntime })
  if (currentTaskId) {
    taskRuntime[currentTaskId] = { ...taskRuntime[currentTaskId], status: 'active' }
  }
  return ok(pushEvent({ ...state, taskRuntime, currentTaskId }, 'task-done', taskId, at))
}

export function setDiff(state, diff, at = Date.now()) {
  if (!state.engaged || state.phase === 'cancelled') return fail(state, '没有进行中的运行。')
  return ok({ ...state, diff: typeof diff === 'string' ? diff : '' })
}

export function setDeveloperSummary(state, summary) {
  if (!state.engaged) return fail(state, '没有进行中的运行。')
  return ok({ ...state, developerSummary: typeof summary === 'string' ? summary : '' })
}

export function submitReview(state, at = Date.now()) {
  if (state.phase !== 'develop') return fail(state, '请先完成开发与自验，再送审。')
  const plan = approvedPlan(state)
  if (!plan) return fail(state, '没有已批准且未失效的计划，不能送审。')
  if (state.currentTaskId) return fail(state, '还有未完成的任务，不能送审。')
  if (!text(state.diff)) return fail(state, '缺少真实 diff，不能送审。评审不采信开发总结来代替 diff。')
  for (const task of plan.tasks) {
    const runtime = state.taskRuntime[task.id]
    if (!runtime || runtime.status !== 'done') return fail(state, '任务 ' + task.id + ' 尚未完成。')
    if (runtime.scopeFingerprint !== fingerprintTask(task)) return fail(state, '任务 ' + task.id + ' 的范围已经变化，旧证据不能送审。')
  }
  const next = pushEvent({
    ...state,
    phase: 'review',
    review: {
      status: 'pending',
      specVersion: state.spec.version,
      planVersion: plan.version,
      findings: '',
      inScope: null,
    },
  }, 'review-submit', '送独立评审。开发总结不作为依据。', at)
  return ok(next)
}

export function recordReviewResult(state, input, at = Date.now()) {
  if (state.phase !== 'review') return fail(state, '当前不是独立评审。')
  const plan = approvedPlan(state)
  if (!plan) return fail(state, '计划已失效，不能采用评审结论。')
  if (input.specVersion !== state.spec.version || input.planVersion !== plan.version) {
    return fail(state, '评审结论绑定的版本不是当前已批准版本。')
  }
  if (input.evidenceUsed !== true) return fail(state, '评审结论没有声明已核对 diff 与验证证据。')
  const findings = text(input.findings)
  if (!findings) return fail(state, '评审结论不能为空。')
  if (input.passed === true) {
    const next = pushEvent({
      ...state,
      phase: 'accept',
      review: {
        status: 'passed',
        specVersion: state.spec.version,
        planVersion: plan.version,
        findings,
        inScope: true,
      },
    }, 'review-passed', findings, at)
    return ok(next, [{ type: 'review', passed: true }])
  }
  if (input.passed !== false) return fail(state, '评审必须明确通过或不通过。')
  const inScope = input.inScope !== false
  if (!inScope) {
    let next = invalidatePlan({
      ...state,
      phase: 'spec',
      spec: { ...state.spec, status: 'draft', approvedAt: null, version: state.spec.version + 1 },
    }, 'review-ambiguity')
    next = {
      ...next,
      review: { status: 'failed', specVersion: state.spec.version, planVersion: plan.version, findings, inScope: false },
    }
    next = pushEvent(next, 'review-failed', '需求歧义，已回到需求确认，旧计划失效。不能进入验收。', at)
    return ok(next, [{ type: 'review', passed: false, to: 'spec' }])
  }
  const taskId = text(input.taskId) || state.plan.tasks[state.plan.tasks.length - 1].id
  const runtime = state.taskRuntime[taskId]
  if (!runtime) return fail(state, '打回的任务不在计划中。')
  if (runtime.reworkRounds >= state.defaults.maxReworkRounds) {
    return block({
      ...state,
      review: { status: 'failed', specVersion: state.spec.version, planVersion: plan.version, findings, inScope: true },
    }, { reason: 'rework', detail: '评审未通过，且自动返修轮次已用尽。不能进入验收。' }, at)
  }
  const taskRuntime = {
    ...state.taskRuntime,
    [taskId]: { ...runtime, status: 'active', reworkRounds: runtime.reworkRounds + 1 },
  }
  const next = pushEvent({
    ...state,
    phase: 'develop',
    currentTaskId: taskId,
    taskRuntime,
    review: { status: 'failed', specVersion: state.spec.version, planVersion: plan.version, findings, inScope: true },
  }, 'review-failed', '范围内问题打回 ' + taskId + '。未进入验收。', at)
  return ok(next, [{ type: 'review', passed: false, to: 'develop' }])
}

export function accept(state, at = Date.now()) {
  if (state.review.status !== 'passed') return fail(state, '评审未通过，不能进入或完成用户验收。')
  if (state.phase !== 'accept') return fail(state, '评审未通过时不能进入用户验收。')
  const plan = approvedPlan(state)
  if (!plan) return fail(state, '已批准计划已失效，不能验收。')
  if (state.review.specVersion !== state.spec.version || state.review.planVersion !== plan.version) {
    return fail(state, '评审绑定的版本已失效，不能验收。')
  }
  if (state.acceptance.accepted) return ok(state)
  return ok(pushEvent({
    ...state,
    phase: 'commit',
    acceptance: { accepted: true, acceptedAt: at },
  }, 'accepted', '用户验收通过。提交、推送、合并、发布仍需分别确认。测试通过不能替代这次验收。', at), [
    { type: 'acceptance', accepted: true },
  ])
}

export function confirmRelease(state, step, at = Date.now()) {
  if (!RELEASE_STEPS.includes(step)) return fail(state, '未知的发布步骤。')
  const index = RELEASE_STEPS.indexOf(step)
  if (state.phase !== step) return fail(state, '现在不能确认「' + step + '」。四次确认互不替代。')
  if (!state.acceptance.accepted) return fail(state, '用户还没有验收，不能提交、推送、合并或发布。')
  for (let i = 0; i < index; i++) {
    if (!state.release[RELEASE_STEPS[i]]) return fail(state, '上一步还没有单独确认。')
  }
  const release = { ...state.release, [step]: true }
  const phase = index === RELEASE_STEPS.length - 1 ? 'done' : RELEASE_STEPS[index + 1]
  const effects = [{ type: 'confirmation-recorded', step, executesGit: false, rollback: false, cleanWorktree: false }]
  let next = pushEvent({
    ...state,
    release,
    phase,
    finishedAt: phase === 'done' ? at : null,
  }, 'confirm-' + step, '只记录这一步的人工确认。工厂不执行 git，也不代替其他三步。', at)
  return ok(next, effects)
}

export function pause(state, at = Date.now()) {
  if (!state.engaged || state.phase === 'cancelled' || state.phase === 'done') return fail(state, '没有可暂停的运行。')
  if (state.paused) return ok(state)
  return ok(pushEvent({ ...state, paused: true }, 'pause', '已暂停。现场、批准版本和证据都保留。', at), [
    { type: 'pause', rollback: false, cleanWorktree: false },
  ])
}

export function resumePause(state, at = Date.now()) {
  if (!state.paused) return fail(state, '运行没有暂停。')
  return ok(pushEvent({ ...state, paused: false }, 'resume-pause', '继续。', at))
}

export function reportBlock(state, input, at = Date.now()) {
  const reason = input && input.reason
  if (!['scope', 'behavior', 'acceptance', 'budget', 'rework'].includes(reason)) {
    return fail(state, '未知的阻断原因。')
  }
  if (!['develop', 'review', 'investigate', 'clarify'].includes(state.phase)) return fail(state, '当前阶段不能这样阻断。')
  return block(state, { reason, detail: text(input.detail) || '等待用户决定。' }, at)
}

function block(state, info, at) {
  const next = pushEvent({
    ...state,
    phase: 'blocked',
    paused: false,
    block: {
      reason: info.reason,
      detail: info.detail,
      resumePhase: state.phase === 'blocked' && state.block ? state.block.resumePhase : state.phase,
      reworkCap: state.defaults.maxReworkRounds,
    },
  }, 'blocked', info.reason + ' ' + info.detail, at)
  return ok(next, [{ type: 'block', reason: info.reason, rollback: false, cleanWorktree: false }])
}

export function resolveBlock(state, action, at = Date.now()) {
  if (state.phase !== 'blocked' || !state.block) return fail(state, '当前没有阻断。')
  if (action === 'cancel') return cancel(state, at)
  if (action === 'revise') {
    const next = pushEvent({ ...state, phase: 'spec', block: null }, 'block-revise', '回到需求确认。已做改动保留。', at)
    return ok(next, [{ type: 'revise', rollback: false, cleanWorktree: false }])
  }
  if (action !== 'continue') return fail(state, '请选择按原范围继续、改需求，或取消。')
  if (state.block.reason === 'budget' && budgetBlocks(state, at)) {
    return fail(state, '额度用尽后必须先明确新的时间额度，不能直接继续。')
  }
  if (state.block.reason === 'rework' && state.defaults.maxReworkRounds <= state.block.reworkCap) {
    return fail(state, '返修轮次用尽后不能直接继续。请改需求，或明确提高返修上限。')
  }
  const resumePhase = state.block.resumePhase === 'blocked' ? 'develop' : state.block.resumePhase
  const phase = ['develop', 'review', 'investigate', 'clarify'].includes(resumePhase) ? resumePhase : 'develop'
  return ok(pushEvent({ ...state, phase, block: null }, 'block-continue', '按原范围继续。没有扩大范围。', at), [
    { type: 'continue', rollback: false, cleanWorktree: false },
  ])
}

export function raiseReworkCap(state, rounds, at = Date.now()) {
  if (state.phase !== 'blocked' || !state.block || state.block.reason !== 'rework') {
    return fail(state, '只有返修次数用尽的阻断里可以明确提高上限。')
  }
  if (!Number.isInteger(rounds) || rounds <= state.defaults.maxReworkRounds || rounds > 10) {
    return fail(state, '新的上限必须高于当前值，且不超过 10。')
  }
  return ok(pushEvent({
    ...state,
    defaults: { ...state.defaults, maxReworkRounds: rounds },
  }, 'raise-rework', '用户明确把自动返修上限改为 ' + rounds, at))
}

export function extendBudget(state, minutes, at = Date.now()) {
  if (state.phase !== 'blocked' || !state.block || state.block.reason !== 'budget') {
    return fail(state, '只有额度阻断里可以延长时间。')
  }
  if (!Number.isFinite(minutes) || minutes <= 0) return fail(state, '请填写追加的分钟数。')
  const deadlineAt = at + minutes * 60 * 1000
  return ok(pushEvent({
    ...state,
    budget: { ...state.budget, timeLimitMinutes: state.budget.timeLimitMinutes + minutes, deadlineAt },
  }, 'extend-budget', '用户追加 ' + minutes + ' 分钟。', at))
}

export function cancel(state, at = Date.now()) {
  if (state.phase === 'cancelled') return ok(state, [])
  if (state.phase === 'done') return fail(state, '已完成的运行不能取消。')
  const next = pushEvent({
    ...state,
    phase: 'cancelled',
    paused: false,
    engaged: false,
    block: null,
    cancelledAt: at,
    dirty: state.dirty,
  }, 'cancel', '已取消。这不是回滚，工作区改动保留，工厂不会清理脏目录。', at)
  return ok(next, [{ type: 'cancel', rollback: false, cleanWorktree: false }])
}

export function startNew(previous, config = {}, at = Date.now()) {
  if (previous && previous.phase !== 'cancelled' && previous.phase !== 'done' && previous.engaged) {
    return fail(previous, '请先取消或完成当前运行。取消不会清理工作区。')
  }
  const created = createRun(config, at)
  return ok(created, [{ type: 'new-run', rollback: false, cleanWorktree: false }])
}

export function restoreRun(saved, at = Date.now()) {
  if (!saved || typeof saved !== 'object') return createRun({}, at)
  const state = clone(saved)
  if (!PHASES.includes(state.phase)) state.phase = 'start'
  if (state.phase === 'cancelled' || state.phase === 'done' || !state.engaged) return state
  if (state.spec.status !== 'approved') {
    if (['plan', 'develop', 'review', 'accept', 'commit', 'push', 'merge', 'release'].includes(state.phase)) {
      state.phase = state.investigation.completed ? 'spec' : state.phase
      state.review = { status: 'none', specVersion: null, planVersion: null, findings: '', inScope: null }
      state.acceptance = { accepted: false, acceptedAt: null }
    }
  }
  const planOk = state.spec.status === 'approved'
    && state.plan.status === 'approved'
    && state.plan.specVersion === state.spec.version
  if (!planOk && ['develop', 'review', 'accept', 'commit', 'push', 'merge', 'release'].includes(state.phase)) {
    state.phase = 'plan'
    state.plan = { ...state.plan, status: state.plan.status === 'approved' ? 'invalid' : state.plan.status, invalidReason: state.plan.invalidReason || 'restored-unapproved' }
    state.currentTaskId = null
    state.review = { status: 'none', specVersion: null, planVersion: null, findings: '', inScope: null }
    state.acceptance = { accepted: false, acceptedAt: null }
    state.release = { commit: false, push: false, merge: false, release: false }
  }
  if (planOk) {
    for (const task of state.plan.tasks) {
      const fp = fingerprintTask(task)
      const runtime = state.taskRuntime[task.id]
      if (!runtime) continue
      if (runtime.status === 'done' && runtime.scopeFingerprint !== fp) {
        state.taskRuntime[task.id] = { status: 'pending', reworkRounds: 0, scopeFingerprint: fp, evidence: [] }
      }
    }
    if (state.phase === 'develop') {
      const current = nextTaskId(state)
      state.currentTaskId = current
      if (current && state.taskRuntime[current].status !== 'done') {
        state.taskRuntime[current] = { ...state.taskRuntime[current], status: 'active' }
      }
    }
  }
  if (['accept', 'commit', 'push', 'merge', 'release', 'done'].includes(state.phase)) {
    const reviewOk = state.review.status === 'passed'
      && state.review.specVersion === state.spec.version
      && state.review.planVersion === state.plan.version
    if (!reviewOk) {
      state.phase = 'review'
      state.review = { ...state.review, status: state.review.status === 'passed' ? 'none' : state.review.status }
      state.acceptance = { accepted: false, acceptedAt: null }
      state.release = { commit: false, push: false, merge: false, release: false }
    }
  }
  state.events = (state.events || []).concat({ at, type: 'restore', detail: '按已批准且未失效的版本恢复。' }).slice(-200)
  return state
}

const STEP_DEFS = [
  { id: 'start', name: '开始', meta: '确认目标与额度' },
  { id: 'investigate', name: '调查', meta: '暂不改代码' },
  { id: 'clarify', name: '澄清', meta: '每次 1–2 个问题' },
  { id: 'spec', name: '需求确认', meta: '批准 Spec 版本' },
  { id: 'plan', name: '计划确认', meta: '批准 Plan 版本' },
  { id: 'develop', name: '开发与自验', meta: '按范围串行执行' },
  { id: 'review', name: '独立评审', meta: '对照需求与证据' },
  { id: 'accept', name: '用户验收', meta: '证据与未验证项' },
  { id: 'release', name: '提交 / 推送 / 合并 / 发布', meta: '四次分别确认' },
]

function stepIndexForPhase(phase) {
  if (phase === 'start') return 0
  if (phase === 'investigate') return 1
  if (phase === 'clarify') return 2
  if (phase === 'spec') return 3
  if (phase === 'plan') return 4
  if (phase === 'develop' || phase === 'blocked') return 5
  if (phase === 'review') return 6
  if (phase === 'accept') return 7
  return 8
}

export function project(state, at = Date.now()) {
  const waiting = ['start', 'clarify', 'spec', 'plan', 'accept', 'commit', 'push', 'merge', 'release', 'blocked', 'cancelled'].includes(state.phase)
    || state.paused
    || (state.phase === 'review' && state.review.status !== 'pending')
  const tone = state.phase === 'done' ? 'ok' : (state.phase === 'cancelled' ? 'wait' : (waiting ? 'wait' : 'run'))
  const current = stepIndexForPhase(state.phase)
  const steps = STEP_DEFS.map((step, index) => ({
    ...step,
    status: state.phase === 'cancelled' ? (index < current ? 'done' : 'locked') : (index < current ? 'done' : (index === current ? 'current' : 'locked')),
  }))
  const plan = approvedPlan(state)
  const task = plan && state.currentTaskId ? plan.tasks.find((item) => item.id === state.currentTaskId) : null
  const runtime = task ? state.taskRuntime[task.id] : null
  return {
    phase: state.phase,
    phaseLabel: labelPhase(state),
    tone,
    waitingOnUser: waiting,
    specLabel: state.spec.status === 'approved' ? '需求 v' + state.spec.version : '需求未批准',
    planLabel: plan ? '计划 v' + plan.version : (state.plan.status === 'invalid' ? '计划已失效' : '计划未批准'),
    budgetLabel: state.budget.confirmed
      ? ('时间 ' + state.budget.timeLimitMinutes + ' 分钟 · ' + (state.budget.spendChoice === 'no-cap' ? '未设费用上限' : state.budget.spendNote))
      : '额度未确认',
    steps,
    currentTask: task ? { ...task, runtime } : null,
    separateConfirmation: needsSeparateConfirmation(state.spec.fields),
    can: {
      acknowledge: state.phase === 'start' && !state.engaged && Boolean(state.goal) && Boolean(state.budget.timeLimitMinutes) && Boolean(state.budget.spendChoice),
      start: state.phase === 'start' && !state.engaged && state.defaults.acknowledged && !dirtyReady(state),
      completeInvestigation: state.phase === 'investigate' && state.investigation.facts.length > 0,
      openSpec: state.phase === 'clarify' && state.investigation.completed,
      allowOpen: state.phase === 'spec' && unresolvedOpenItems(state.spec.fields).length > 0,
      approveSpec: state.phase === 'spec' && specProblems(state.spec.fields).length === 0,
      approvePlan: state.phase === 'plan' && state.spec.status === 'approved' && state.plan.status === 'draft',
      confirmSmall: (state.phase === 'spec' || state.phase === 'plan') && !needsSeparateConfirmation(state.spec.fields),
      submitReview: state.phase === 'develop' && !state.currentTaskId && Boolean(text(state.diff)),
      accept: state.phase === 'accept' && state.review.status === 'passed',
      confirmCommit: state.phase === 'commit',
      confirmPush: state.phase === 'push',
      confirmMerge: state.phase === 'merge',
      confirmRelease: state.phase === 'release',
    },
    budgetExpired: budgetBlocks(state, at),
    shellPolicy: !state.engaged || state.phase === 'cancelled' || state.phase === 'done'
      ? 'idle'
      : (state.phase === 'develop' && !state.paused && !state.block ? 'exact-verify' : 'hard-deny'),
  }
}

function labelPhase(state) {
  const map = {
    start: '开始',
    investigate: '调查',
    clarify: '澄清',
    spec: '需求确认',
    plan: '计划确认',
    develop: '开发与自验',
    review: '独立评审',
    accept: '用户验收',
    commit: '待确认提交',
    push: '待确认推送',
    merge: '待确认合并',
    release: '待确认发布',
    done: '已完成',
    cancelled: '已取消',
    blocked: '等你决定',
  }
  return map[state.phase] || state.phase
}

export function currentVerifyCommands(state) {
  const plan = approvedPlan(state)
  if (!plan || state.phase !== 'develop' || state.paused || state.block) return []
  const task = plan.tasks.find((item) => item.id === state.currentTaskId)
  return task ? task.verifyCommands : []
}

export { PHASES, RELEASE_STEPS }

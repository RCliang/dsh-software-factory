import assert from 'node:assert/strict'
import test from 'node:test'
import * as factory from '../src/factory/index.js'
import {
  accept,
  acknowledgeStart,
  approvePlan,
  approveSpec,
  cancel,
  chooseDirty,
  completeCurrentTask,
  completeInvestigation,
  confirmRelease,
  confirmSmallChange,
  createRun,
  decideToolCall,
  openSpec,
  recordDirty,
  recordInvestigation,
  recordReviewResult,
  recordVerification,
  restoreRun,
  setBudget,
  setDeveloperSummary,
  setDiff,
  setGoal,
  setQuestions,
  startInvestigation,
  submitReview,
  updatePlan,
  updateSpec,
} from '../src/factory/index.js'
import { bindFactoryGates } from '../src/factory/bind-gates.js'
import { buildReviewPrompt, parseReviewOutput } from '../src/factory/review.js'

const at = 1_700_000_000_000

function fields(extra = {}) {
  return {
    goal: '为已有应用增加 CSV 导出',
    currentBehavior: '现有导出只有 JSON，入口在设置页。',
    scenario: '把当前筛选结果导出成 CSV。',
    preserve: '原有 JSON 导出的入口、格式和权限保持不变。',
    outOfScope: '不做定时导出，也不做全量后台任务。',
    acceptance: [
      { id: 'A1', statement: '当前列表可导出为 CSV' },
      { id: 'A2', statement: '原有 JSON 导出行为保持不变' },
    ],
    openItems: [],
    touchesExistingBehavior: false,
    refactor: false,
    ...extra,
  }
}

function planInput(extra = {}) {
  return {
    existingBehaviorImpact: '',
    tasks: [
      {
        id: 'T1',
        title: '增加 CSV 序列化',
        intent: '只改 CSV 路径',
        files: ['src/export/csv.ts'],
        dependsOn: [],
        acceptanceIds: ['A1'],
        verifyCommands: ['npm test -- csv'],
        notesToLoad: ['导出说明'],
      },
      {
        id: 'T2',
        title: '设置页入口',
        intent: '保留 JSON 按钮',
        files: ['src/settings/ExportButton.tsx'],
        dependsOn: ['T1'],
        acceptanceIds: ['A2'],
        verifyCommands: ['npm test -- export-button'],
        notesToLoad: [],
      },
    ],
    ...extra,
  }
}

function must(result) {
  assert.equal(result.ok, true, result.error || 'expected ok')
  return result.state
}

function ready(state) {
  let next = must(setGoal(state, '给已有应用增加 CSV 导出', at))
  next = must(setBudget(next, { timeLimitMinutes: 120, spendChoice: 'no-cap', spendNote: '' }, at))
  next = must(acknowledgeStart(next, at))
  next = must(recordDirty(next, { status: 'clean', files: [], source: 'observed' }, at))
  return next
}

function investigated(state) {
  let next = must(startInvestigation(state, at))
  next = must(recordInvestigation(next, {
    facts: ['现有导出只有 JSON'],
    inferences: ['CSV 列名可能要和界面一致'],
    locations: ['src/export/json.ts'],
  }, at))
  next = must(completeInvestigation(next, at))
  next = must(openSpec(next, at))
  next = must(updateSpec(next, fields(), at))
  return next
}

function developed() {
  let next = investigated(ready(createRun({}, at)))
  next = must(approveSpec(next, at))
  next = must(updatePlan(next, planInput(), at))
  next = must(approvePlan(next, at))
  return next
}

function verify(state, taskId, acceptanceId, command) {
  return must(recordVerification(state, {
    taskId,
    acceptanceId,
    result: 'pass',
    command,
    output: 'pass',
  }, at))
}

function finishTasks(state) {
  let next = verify(state, 'T1', 'A1', 'npm test -- csv')
  next = must(completeCurrentTask(next, at))
  next = verify(next, 'T2', 'A2', 'npm test -- export-button')
  next = must(completeCurrentTask(next, at))
  next = must(setDiff(next, 'diff --git a/src/export/csv.ts b/src/export/csv.ts\n+export csv\n', at))
  return next
}

test('不清楚不动代码：需求或计划未批准时写入被拒绝', () => {
  const idle = ready(createRun({}, at))
  assert.equal(decideToolCall(idle, { name: 'write', arguments: { file_path: 'src/export/csv.ts', content: 'x' } }, at).action, 'allow')

  const investigating = must(startInvestigation(idle, at))
  const denied = decideToolCall(investigating, {
    name: 'write',
    arguments: { file_path: 'src/export/csv.ts', content: 'export {}' },
  }, at)
  assert.equal(denied.action, 'deny')
  assert.equal(denied.hardness, 'hard')
  assert.equal(denied.code, 'unapproved')

  let spec = investigated(idle)
  const beforePlan = decideToolCall(spec, {
    name: 'edit',
    arguments: { file_path: 'src/export/csv.ts', old_string: 'a', new_string: 'b' },
  }, at)
  assert.equal(beforePlan.action, 'deny')
  spec = must(approveSpec(spec, at))
  assert.equal(spec.phase, 'plan')
  const planned = decideToolCall(spec, {
    name: 'apply_patch',
    arguments: { input: '*** Begin Patch\n*** Add File: src/export/csv.ts\n+x\n*** End Patch\n' },
  }, at)
  assert.equal(planned.action, 'deny')
  assert.match(planned.reason, /尚未批准/)
})

test('越界被拒：当前任务范围外的文件工具被硬拒绝', () => {
  const state = developed()
  assert.equal(state.currentTaskId, 'T1')
  const outside = decideToolCall(state, {
    name: 'write',
    arguments: { file_path: 'src/api/export.ts', content: 'changed' },
  }, at)
  assert.equal(outside.action, 'deny')
  assert.equal(outside.code, 'out-of-scope')
  assert.equal(outside.hardness, 'hard')

  const inside = decideToolCall(state, {
    name: 'edit',
    arguments: { file_path: 'src/export/csv.ts', old_string: 'a', new_string: 'b' },
  }, at)
  assert.equal(inside.action, 'allow')
  assert.equal(inside.code, 'in-scope')

  const patch = decideToolCall(state, {
    name: 'apply_patch',
    arguments: { input: '*** Begin Patch\n*** Update File: src/settings/ExportButton.tsx\n@@\n-old\n+new\n*** End Patch\n' },
  }, at)
  assert.equal(patch.action, 'deny')
  assert.equal(patch.code, 'out-of-scope')

  const sneaky = decideToolCall(state, {
    name: 'bash',
    arguments: { command: 'printf x > src/export/csv.ts', description: 'write csv' },
  }, at)
  assert.equal(sneaky.action, 'deny')
  assert.equal(sneaky.code, 'shell-exact')
  assert.equal(sneaky.shellPathConfinement, false)

  const exact = decideToolCall(state, {
    name: 'bash',
    arguments: { command: 'npm test -- csv', description: 'run csv tests' },
  }, at)
  assert.equal(exact.action, 'allow')
  assert.equal(exact.code, 'shell-exact')
  assert.equal(exact.shellPathConfinement, false)

  const terminal = decideToolCall(state, {
    name: 'terminal_send',
    arguments: { sessionId: '1', text: 'npm test -- csv' },
  }, at)
  assert.equal(terminal.action, 'deny')
  assert.equal(terminal.code, 'channel')
})

test('需求变更失效：Spec 修改后旧 Plan 失效，重确认前不能写', () => {
  let state = developed()
  state = must(updateSpec(state, { goal: '改为导出全部数据' }, at))
  assert.equal(state.spec.status, 'draft')
  assert.equal(state.spec.version, 2)
  assert.equal(state.plan.status, 'invalid')
  assert.equal(state.plan.invalidReason, 'spec-changed')
  assert.equal(state.phase, 'spec')
  const denied = decideToolCall(state, {
    name: 'write',
    arguments: { file_path: 'src/export/csv.ts', content: 'x' },
  }, at)
  assert.equal(denied.action, 'deny')
  assert.equal(approvePlan(state, at).ok, false)

  state = must(approveSpec(state, at))
  state = must(updatePlan(state, planInput(), at))
  state = must(approvePlan(state, at))
  assert.equal(state.plan.status, 'approved')
  assert.equal(state.plan.specVersion, 2)
  assert.equal(decideToolCall(state, {
    name: 'write',
    arguments: { file_path: 'src/export/csv.ts', content: 'export const csv = 1\n' },
  }, at).action, 'allow')
})

test('重构保留行为：未说明须保留的既有行为就不能开工', () => {
  let state = investigated(ready(createRun({}, at)))
  state = must(updateSpec(state, fields({
    preserve: '   ',
    touchesExistingBehavior: true,
    refactor: true,
  }), at))
  const rejected = approveSpec(state, at)
  assert.equal(rejected.ok, false)
  assert.match(rejected.error, /须保留的既有行为/)
  assert.notEqual(state.phase, 'develop')

  state = must(updateSpec(state, fields({
    touchesExistingBehavior: true,
    refactor: true,
  }), at))
  const combined = confirmSmallChange(state, at)
  assert.equal(combined.ok, false)
  assert.match(combined.error, /分开确认/)

  state = must(approveSpec(state, at))
  state = must(updatePlan(state, planInput(), at))
  const missingImpact = approvePlan(state, at)
  assert.equal(missingImpact.ok, false)
  assert.match(missingImpact.error, /既有行为/)

  state = must(updatePlan(state, planInput({
    existingBehaviorImpact: 'JSON 导出的入口、格式和权限保持不变，只增加 CSV。',
  }), at))
  state = must(approvePlan(state, at))
  assert.equal(state.phase, 'develop')
  assert.equal(state.plan.status, 'approved')
})

test('恢复不重复：范围未变的已完成任务不会被重做', () => {
  let state = developed()
  state = verify(state, 'T1', 'A1', 'npm test -- csv')
  state = must(completeCurrentTask(state, at))
  assert.equal(state.taskRuntime.T1.status, 'done')
  assert.equal(state.currentTaskId, 'T2')

  const restored = restoreRun(JSON.parse(JSON.stringify(state)), at + 50)
  assert.equal(restored.phase, 'develop')
  assert.equal(restored.taskRuntime.T1.status, 'done')
  assert.equal(restored.currentTaskId, 'T2')
  assert.equal(restored.taskRuntime.T1.evidence.length, 1)
  assert.equal(restored.spec.version, state.spec.version)
  assert.equal(restored.plan.version, state.plan.version)

  const changed = JSON.parse(JSON.stringify(state))
  changed.plan.tasks[0].files = ['src/export/csv-v2.ts']
  const redone = restoreRun(changed, at + 80)
  assert.notEqual(redone.taskRuntime.T1.status, 'done')
  assert.equal(redone.taskRuntime.T1.evidence.length, 0)
  assert.equal(redone.currentTaskId, 'T1')

  const stale = JSON.parse(JSON.stringify(state))
  stale.plan.status = 'invalid'
  stale.plan.invalidReason = 'spec-changed'
  stale.spec.status = 'draft'
  const pulled = restoreRun(stale, at + 90)
  assert.equal(pulled.phase, 'spec')
  assert.notEqual(pulled.phase, 'develop')

  const invalidPlan = JSON.parse(JSON.stringify(state))
  invalidPlan.plan.status = 'invalid'
  invalidPlan.plan.invalidReason = 'spec-changed'
  const backToPlan = restoreRun(invalidPlan, at + 100)
  assert.equal(backToPlan.phase, 'plan')
  assert.equal(backToPlan.currentTaskId, null)
})

test('评审不过不能交付：未通过时不能进入用户验收', () => {
  let state = finishTasks(developed())
  state = must(submitReview(state, at))
  assert.equal(state.phase, 'review')
  const tooSoon = accept(state, at)
  assert.equal(tooSoon.ok, false)
  assert.match(tooSoon.error, /评审未通过/)

  state = must(recordReviewResult(state, {
    passed: false,
    findings: 'A2 的 diff 改了 JSON 路径。',
    inScope: true,
    taskId: 'T2',
    specVersion: state.spec.version,
    planVersion: state.plan.version,
    evidenceUsed: true,
  }, at))
  assert.equal(state.phase, 'develop')
  assert.notEqual(state.phase, 'accept')
  const rejected = accept(state, at)
  assert.equal(rejected.ok, false)

  state = verify(state, 'T2', 'A2', 'npm test -- export-button')
  state = must(completeCurrentTask(state, at))
  state = must(submitReview(state, at))
  state = must(recordReviewResult(state, {
    passed: true,
    findings: 'diff 在范围内，证据对应 A1 和 A2。',
    inScope: true,
    specVersion: state.spec.version,
    planVersion: state.plan.version,
    evidenceUsed: true,
  }, at))
  assert.equal(state.phase, 'accept')
  state = must(accept(state, at))
  assert.equal(state.acceptance.accepted, true)
  assert.equal(state.phase, 'commit')
})

test('既有脏目录保护：不自动清理，取消也不回滚', () => {
  assert.equal(factory.cleanWorktree, undefined)
  assert.equal(factory.rollback, undefined)
  let state = ready(createRun({}, at))
  state = must(setGoal(createRun({}, at), '修一个导出空值', at))
  state = must(setBudget(state, { timeLimitMinutes: 30, spendChoice: 'note', spendNote: '只记时间，不设金额' }, at))
  state = must(acknowledgeStart(state, at))
  state = must(recordDirty(state, {
    status: 'dirty',
    files: ['src/settings/ExportButton.tsx', 'README.md'],
    source: 'observed',
  }, at))
  const blocked = startInvestigation(state, at)
  assert.equal(blocked.ok, false)
  assert.match(blocked.error, /不会自动清理/)
  state = must(chooseDirty(state, 'handle', at))
  assert.equal(startInvestigation(state, at).ok, false)
  state = must(chooseDirty(state, 'allow', at))
  state = must(startInvestigation(state, at))
  const cancelled = cancel(state, at)
  assert.equal(cancelled.ok, true)
  assert.deepEqual(cancelled.effects, [{ type: 'cancel', rollback: false, cleanWorktree: false }])
  assert.deepEqual(cancelled.state.dirty.files, ['src/settings/ExportButton.tsx', 'README.md'])
  assert.equal(cancelled.state.phase, 'cancelled')
  assert.equal(JSON.stringify(cancelled.effects).includes('git clean'), false)
})

test('四次发布确认互不替代，且控制器不执行 git', () => {
  let state = finishTasks(developed())
  state = must(submitReview(state, at))
  state = must(recordReviewResult(state, {
    passed: true,
    findings: '核对了已批准版本、diff 和证据。',
    inScope: true,
    specVersion: state.spec.version,
    planVersion: state.plan.version,
    evidenceUsed: true,
  }, at))
  state = must(accept(state, at))
  assert.equal(confirmRelease(state, 'push', at).ok, false)
  state = must(confirmRelease(state, 'commit', at))
  assert.equal(state.release.commit, true)
  assert.equal(state.release.push, false)
  assert.equal(confirmRelease(state, 'merge', at).ok, false)
  state = must(confirmRelease(state, 'push', at))
  state = must(confirmRelease(state, 'merge', at))
  const released = confirmRelease(state, 'release', at)
  assert.equal(released.ok, true)
  assert.equal(released.state.phase, 'done')
  for (const effect of released.effects) {
    assert.equal(effect.executesGit, false)
    assert.equal(effect.cleanWorktree, false)
  }
})

test('评审提示词只包含已批准版本、diff 和证据', () => {
  let state = finishTasks(developed())
  state = must(setDeveloperSummary(state, 'DEV_SUMMARY_SENTINEL 我认为已经做完了', at))
  const built = buildReviewPrompt(state)
  assert.equal(built.ok, true)
  assert.equal(built.prompt.includes('DEV_SUMMARY_SENTINEL'), false)
  assert.equal(built.prompt.includes('原有 JSON 导出'), true)
  assert.equal(built.prompt.includes('src/export/csv.ts'), true)
  assert.equal(built.prompt.includes('diff --git'), true)
  assert.equal(built.prompt.includes('developer-summary'), true)
  const parsed = parseReviewOutput('结论如下 {"passed":false,"findings":"缺证据","inScope":true,"taskId":"T2","evidenceUsed":true}')
  assert.equal(parsed.ok, true)
  assert.equal(parsed.result.passed, false)
  assert.equal(parseReviewOutput('{"passed":true,"findings":"好","evidenceUsed":false}').ok, false)
})

test('工具门禁同时挂上 pre-execute 和单调 guard', () => {
  let guarded = null
  let pre = null
  const ctx = {
    tools: {
      guard(fn) {
        guarded = fn
        return () => { guarded = null }
      },
    },
    on(name, fn) {
      assert.equal(name, 'tools/pre-execute')
      pre = fn
      return () => { pre = null }
    },
  }
  const run = developed()
  run.budget.deadlineAt = Date.now() + 60_000
  const state = { hydrating: false, run }
  const bound = bindFactoryGates(ctx, () => state)
  assert.equal(bound.installed, true)
  assert.equal(guarded({ name: 'write', arguments: { file_path: 'README.md', content: 'x' } }), '拒绝修改任务范围外的文件：README.md')
  assert.equal(guarded({ name: 'read', arguments: { file_path: 'README.md' } }), undefined)
  let nextCalled = false
  const decision = pre({ name: 'write', arguments: { file_path: 'nope.ts', content: 'x' } }, () => {
    nextCalled = true
    return { kind: 'allow' }
  })
  assert.equal(nextCalled, false)
  assert.deepEqual(decision, { kind: 'deny', reason: '拒绝修改任务范围外的文件：nope.ts' })
})

test('未决项默认不能进入计划，调查未完成不能提问', () => {
  const started = must(startInvestigation(ready(createRun({}, at)), at))
  const tooEarly = setQuestions(started, [{ text: '导出全部吗？', why: '代码里看不出范围。' }], at)
  assert.equal(tooEarly.ok, false)
  let state = investigated(ready(createRun({}, at)))
  state = must(updateSpec(state, fields({
    openItems: [{ id: 'Q1', text: '导出权限是否只给管理员' }],
  }), at))
  const blocked = approveSpec(state, at)
  assert.equal(blocked.ok, false)
  assert.match(blocked.error, /未决项/)
  assert.equal(state.phase, 'spec')
})

test('删除或削弱测试会被文件门禁拒绝', () => {
  const state = developed()
  const widened = {
    ...state,
    plan: {
      ...state.plan,
      tasks: state.plan.tasks.map((task) => task.id === 'T1'
        ? { ...task, files: ['src/export/csv.ts', 'tests/export/csv.test.ts'] }
        : task),
    },
    taskRuntime: {
      ...state.taskRuntime,
      T1: {
        ...state.taskRuntime.T1,
        scopeFingerprint: JSON.stringify({
          files: ['src/export/csv.ts', 'tests/export/csv.test.ts'].sort(),
          verify: ['npm test -- csv'],
          acceptance: ['A1'],
        }),
      },
    },
  }
  const removed = decideToolCall(widened, {
    name: 'apply_patch',
    arguments: { input: '*** Begin Patch\n*** Delete File: tests/export/csv.test.ts\n*** End Patch\n' },
  }, at)
  assert.equal(removed.action, 'deny')
  assert.equal(removed.code, 'weaken-test')
  const weakened = decideToolCall(widened, {
    name: 'edit',
    arguments: {
      file_path: 'tests/export/csv.test.ts',
      old_string: 'it("exports", () => expect(1).toBe(1))',
      new_string: 'it("exports", () => {})',
    },
  }, at)
  assert.equal(weakened.code, 'weaken-test')
})

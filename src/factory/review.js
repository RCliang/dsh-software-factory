/**
 * 独立评审只注入已批准且未失效的 Spec / Plan、真实 diff 和验证证据。
 * 开发总结即使存在于状态里，也不会进入提示词。
 */

import { approvedPlan, approvedSpec } from './controller.js'

export function buildReviewPrompt(state) {
  const spec = approvedSpec(state)
  const plan = approvedPlan(state)
  if (!spec || !plan) return { ok: false, error: '没有已批准且未失效的需求或计划，不能组织评审。', prompt: '' }
  if (!state.diff || !state.diff.trim()) return { ok: false, error: '没有真实 diff，不能组织评审。', prompt: '' }
  const evidence = []
  for (const task of plan.tasks) {
    const runtime = state.taskRuntime[task.id]
    evidence.push({
      taskId: task.id,
      files: task.files,
      status: runtime ? runtime.status : 'missing',
      reworkRounds: runtime ? runtime.reworkRounds : 0,
      evidence: runtime ? runtime.evidence : [],
    })
  }
  const body = {
    role: 'independent-review',
    inheritsParentContext: false,
    authority: ['approved-spec', 'approved-plan', 'diff', 'verification-evidence'],
    notAuthority: ['developer-summary'],
    spec: { version: spec.version, fields: spec.fields },
    plan: {
      version: plan.version,
      specVersion: plan.specVersion,
      existingBehaviorImpact: plan.existingBehaviorImpact,
      tasks: plan.tasks,
    },
    diff: state.diff,
    evidence,
    requiredResult: {
      passed: 'boolean',
      findings: 'string',
      inScope: 'boolean，需求歧义时为 false',
      taskId: '范围内打回时的任务编号，可空',
      evidenceUsed: true,
    },
  }
  const prompt = [
    '你是软件工厂的独立评审。不要继承、复述或采信开发者的自我总结。',
    '只根据下面这份 JSON 里的已批准需求、已批准计划、真实 diff 和验证证据作结论。',
    '若证据不足、diff 超出文件范围、验收被削弱，或和需求不一致，passed 必须为 false。',
    '只回答一个 JSON 对象，包含 passed、findings、inScope、taskId、evidenceUsed。',
    JSON.stringify(body),
  ].join('\n')
  return { ok: true, error: null, prompt }
}

export function parseReviewOutput(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '评审没有返回文本。' }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return { ok: false, error: '评审返回里没有 JSON。' }
  let parsed
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return { ok: false, error: '评审 JSON 无法解析。' }
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: '评审 JSON 不是对象。' }
  if (parsed.evidenceUsed !== true) return { ok: false, error: '评审没有声明已核对证据。' }
  if (typeof parsed.passed !== 'boolean') return { ok: false, error: '评审没有给出 passed。' }
  if (typeof parsed.findings !== 'string' || !parsed.findings.trim()) return { ok: false, error: '评审 findings 为空。' }
  return {
    ok: true,
    error: null,
    result: {
      passed: parsed.passed,
      findings: parsed.findings.trim(),
      inScope: parsed.inScope !== false,
      taskId: typeof parsed.taskId === 'string' ? parsed.taskId.trim() : '',
      evidenceUsed: true,
    },
  }
}

export function reviewContentBlocks(prompt) {
  return [{ type: 'text', text: prompt }]
}

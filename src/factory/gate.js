/**
 * 写入门禁。
 * 文件工具（write / edit / apply_patch / str_replace_editor 的写入命令）按路径硬拒绝。
 * bash / pwsh 只在开发阶段放行与当前任务验证命令完全一致的调用，不做路径解析。
 * 其余可写通道在运行期间直接拒绝。这不是沙箱，也不能称为按路径拦住了 shell。
 */

const FILE_TOOLS = new Set(['write', 'edit', 'apply_patch', 'str_replace_editor'])
const EXACT_SHELL_TOOLS = new Set(['bash', 'pwsh'])
const DENIED_CHANNELS = new Set([
  'terminal_open',
  'terminal_send',
  'run_code',
  'create_worktree',
  'office_convert',
  'office_recalculate',
  'office_render',
])

function overlayOf(input) {
  if (input && Object.prototype.hasOwnProperty.call(input, 'hydrating')) {
    return { hydrating: Boolean(input.hydrating), run: input.run || null }
  }
  return { hydrating: false, run: input || null }
}

function deny(reason, code) {
  return {
    action: 'deny',
    reason,
    hardness: 'hard',
    code,
    shellPathConfinement: false,
  }
}

function allow(code) {
  return { action: 'allow', reason: '', hardness: 'none', code, shellPathConfinement: false }
}

export function isMutationTool(name, args) {
  if (DENIED_CHANNELS.has(name) || EXACT_SHELL_TOOLS.has(name)) return true
  if (name === 'write' || name === 'edit' || name === 'apply_patch') return true
  if (name === 'str_replace_editor') return args.command !== 'view'
  return false
}

function normalize(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '')
}

function hasDotDot(filePath) {
  return normalize(filePath).split('/').filter(Boolean).includes('..')
}

function relativeToRoot(filePath, root) {
  if (typeof filePath !== 'string' || !filePath.trim()) return { ok: false, reason: '缺少文件路径，拒绝写入。' }
  if (hasDotDot(filePath)) return { ok: false, reason: '路径包含 ..，拒绝写入。' }
  const path = normalize(filePath)
  if (path.startsWith('/')) {
    const base = normalize(root)
    if (!base) return { ok: false, reason: '绝对路径在未设置工作区根时无法证明落在任务范围内，拒绝写入。' }
    if (path !== base && !path.startsWith(base.endsWith('/') ? base : base + '/')) {
      return { ok: false, reason: '路径超出工作区，拒绝写入。' }
    }
    const rel = path === base ? '' : path.slice(base.endsWith('/') ? base.length : base.length + 1)
    return { ok: true, rel }
  }
  return { ok: true, rel: path }
}

function inAllowlist(rel, allow) {
  for (const raw of allow) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const directory = raw.endsWith('/') || raw.endsWith('\\')
    const entry = normalize(raw).replace(/\/$/, '')
    if (!entry) continue
    if (directory) {
      if (rel === entry || rel.startsWith(entry + '/')) return true
    } else if (rel === entry) return true
  }
  return false
}

const TEST_PATH = /(^|\/)(tests?|__tests__)\//i
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/i
const ASSERTION = /\b(it|test|describe|expect|assert)\s*\(/g

export function isTestPath(filePath) {
  const rel = normalize(filePath)
  return TEST_PATH.test(rel) || TEST_FILE.test(rel)
}

function assertionCount(text) {
  if (typeof text !== 'string' || !text) return 0
  return text.match(ASSERTION)?.length || 0
}

function patchPaths(input) {
  if (typeof input !== 'string') return []
  const paths = []
  for (const line of input.split(/\r?\n/)) {
    const file = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+?)\s*$/)
    const move = line.match(/^\*\*\* Move to: (.+?)\s*$/)
    if (file) paths.push(file[1].trim())
    if (move) paths.push(move[1].trim())
  }
  return paths
}

function weakensTests(name, args, rels) {
  if (!rels.some((rel) => isTestPath(rel))) return null
  if (name === 'apply_patch') {
    const input = String(args.input || '')
    for (const line of input.split(/\r?\n/)) {
      const deleted = line.match(/^\*\*\* Delete File: (.+?)\s*$/)
      if (deleted && isTestPath(deleted[1])) return '拒绝删除测试文件。'
    }
    const removed = assertionCount(input.split(/\r?\n/).filter((line) => line.startsWith('-')).join('\n'))
    const added = assertionCount(input.split(/\r?\n/).filter((line) => line.startsWith('+')).join('\n'))
    if (removed > added) return '拒绝用补丁减少测试文件里的断言、用例或 describe。'
  }
  if (name === 'edit' || (name === 'str_replace_editor' && args.command === 'str_replace')) {
    const before = assertionCount(args.old_string || args.old_str || '')
    const after = assertionCount(args.new_string || args.new_str || '')
    if (before > after) return '拒绝用编辑减少测试中的断言或用例。'
  }
  if (name === 'write' || (name === 'str_replace_editor' && args.command === 'create')) {
    const content = args.content || args.file_text || ''
    if (assertionCount(content) === 0) return '拒绝把测试文件写成没有任何测试声明的内容。'
  }
  return null
}

function filePathsOf(name, args) {
  if (name === 'write' || name === 'edit') return [args.file_path]
  if (name === 'str_replace_editor') return [args.path]
  if (name === 'apply_patch') return patchPaths(args.input)
  return []
}

function shellCommand(args) {
  return typeof args.command === 'string' ? args.command.replace(/\r\n/g, '\n').trim() : ''
}

export function decideToolCall(input, call, now = Date.now()) {
  const overlay = overlayOf(input)
  const name = call && typeof call.name === 'string' ? call.name : ''
  const args = call && call.arguments && typeof call.arguments === 'object' ? call.arguments : {}
  const mutating = isMutationTool(name, args)
  if (overlay.hydrating) {
    if (mutating || FILE_TOOLS.has(name)) return deny('软件工厂正在从持久存储恢复，暂时拒绝写入。', 'hydrating')
    return allow('hydrating-read')
  }
  const state = overlay.run
  if (!state || !state.engaged || state.phase === 'cancelled' || state.phase === 'done') return allow('idle')
  if (!mutating && !(name === 'str_replace_editor' && args.command === 'view')) return allow('read')
  if (name === 'str_replace_editor' && args.command === 'view') return allow('read')

  if (state.paused) return deny('运行已暂停，拒绝写入。', 'paused')
  if (state.phase === 'blocked' || state.block) return deny('运行被阻断，等你决定之前拒绝写入。', 'blocked')
  if (state.budget && state.budget.deadlineAt && now > state.budget.deadlineAt) {
    return deny('时间额度已用尽，拒绝继续改代码。', 'budget')
  }

  const writablePhase = state.phase === 'develop' && state.plan && state.plan.status === 'approved'
    && state.spec && state.spec.status === 'approved' && state.plan.specVersion === state.spec.version
  if (!writablePhase) {
    return deny('需求或计划尚未批准，或当前阶段不允许改代码。', 'unapproved')
  }

  if (DENIED_CHANNELS.has(name)) {
    return deny('这个写入通道不在工厂允许的范围内。bash/pwsh 也只接受当前任务里逐字写出的验证命令，不能靠它绕过文件范围。', 'channel')
  }

  if (EXACT_SHELL_TOOLS.has(name)) {
    if (args.run_in_background === true) {
      return deny('拒绝把验证命令放到后台。后台 shell 不能当作范围门禁。', 'shell-background')
    }
    if (args.workdir && args.workdir !== '.' && args.workdir !== '') {
      return deny('验证命令不能改工作目录。', 'shell-workdir')
    }
    const command = shellCommand(args)
    const task = (state.plan.tasks || []).find((item) => item.id === state.currentTaskId)
    const allowed = task ? task.verifyCommands : []
    if (!command || !allowed.includes(command)) {
      return deny('shell 不是按路径放行的。只有与当前任务验证命令完全一致的 bash/pwsh 可以执行，其他命令拒绝。', 'shell-exact')
    }
    return {
      action: 'allow',
      reason: '',
      hardness: 'hard-exact-command',
      code: 'shell-exact',
      shellPathConfinement: false,
    }
  }

  if (!FILE_TOOLS.has(name)) return deny('未识别的写入工具，拒绝。', 'unknown-write')
  const paths = filePathsOf(name, args)
  if (!paths.length) return deny('无法确定要改的文件，拒绝写入。', 'no-path')
  const task = (state.plan.tasks || []).find((item) => item.id === state.currentTaskId)
  if (!task) return deny('没有进行中的任务，拒绝写入。', 'no-task')
  const rels = []
  for (const filePath of paths) {
    const resolved = relativeToRoot(filePath, state.workspaceRoot)
    if (!resolved.ok) return deny(resolved.reason, 'path')
    if (!inAllowlist(resolved.rel, task.files)) {
      return deny('拒绝修改任务范围外的文件：' + resolved.rel, 'out-of-scope')
    }
    rels.push(resolved.rel)
  }
  const weakened = weakensTests(name, args, rels)
  if (weakened) return deny(weakened + ' 不能靠删除或弱化测试求得通过。', 'weaken-test')
  return allow('in-scope')
}

export { FILE_TOOLS, EXACT_SHELL_TOOLS, DENIED_CHANNELS }

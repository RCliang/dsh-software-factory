/**
 * 只读查看 git status。
 * spawn 的参数形状来自现有插件对 ctx.subprocess 的用法，本仓库没有在真实 DSH 里跑过。
 * 这里没有任何 clean / reset / checkout / stash。
 */

export function parsePorcelain(text) {
  const files = []
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const body = line.length > 3 ? line.slice(3).trim() : line.trim()
    const path = body.includes(' -> ') ? body.split(' -> ').pop().trim() : body
    if (path) files.push(path)
  }
  return files
}

function stdoutOf(outcome) {
  if (!outcome || typeof outcome !== 'object') return ''
  if (typeof outcome.stdout === 'string') return outcome.stdout
  if (outcome.stdio && typeof outcome.stdio.stdout === 'string') return outcome.stdio.stdout
  return ''
}

export async function observeDirty(subprocess) {
  if (!subprocess || typeof subprocess.spawn !== 'function') {
    return {
      status: 'unknown',
      files: [],
      source: 'observed',
      detail: '没有可用的 subprocess.spawn，不能代读工作区。请在工作台明确声明干净或列出未提交文件。',
    }
  }
  try {
    const handle = subprocess.spawn({
      argv: ['git', 'status', '--porcelain=v1'],
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 200000, spill: { maxBytes: 200000 } },
        stderr: { maxBytes: 8000, spill: { maxBytes: 8000 } },
      },
      graceMs: 5000,
    })
    const outcome = await handle.done
    if (!outcome || outcome.exitCode !== 0) {
      return {
        status: 'unknown',
        files: [],
        source: 'observed',
        detail: 'git status 没有成功返回，不能把工作区当成干净的。',
      }
    }
    const files = parsePorcelain(stdoutOf(outcome))
    if (!files.length) return { status: 'clean', files: [], source: 'observed', detail: '' }
    return { status: 'dirty', files, source: 'observed', detail: '' }
  } catch (error) {
    return {
      status: 'unknown',
      files: [],
      source: 'observed',
      detail: '读取工作区失败：' + String(error && error.message ? error.message : error),
    }
  }
}

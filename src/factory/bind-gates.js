/**
 * 把纯门禁接到 ctx.tools.guard 和 tools/pre-execute。
 * guard 是单调拒绝，后注册的监听器不能把它改回允许。
 */

import { decideToolCall } from './gate.js'

export function readToolCall(execution) {
  const name = execution && typeof execution.name === 'string' ? execution.name : ''
  const args = execution && execution.arguments && typeof execution.arguments === 'object'
    ? execution.arguments
    : {}
  return { name, arguments: args }
}

export function bindFactoryGates(ctx, getOverlay) {
  const tools = ctx && (ctx.tools || (typeof ctx.get === 'function' ? ctx.get('tools') : undefined))
  if (!tools || typeof tools.guard !== 'function') {
    return { installed: false, reason: 'ctx.tools.guard 不可用，文件写入硬门禁没有安装。', dispose() {} }
  }
  if (!ctx || typeof ctx.on !== 'function') {
    return { installed: false, reason: 'ctx.on 不可用，tools/pre-execute 没有安装。', dispose() {} }
  }
  const disposeGuard = tools.guard((execution) => {
    const decision = decideToolCall(getOverlay(), readToolCall(execution))
    if (decision.action === 'deny') return decision.reason
    return undefined
  })
  const disposePre = ctx.on('tools/pre-execute', (execution, next) => {
    const decision = decideToolCall(getOverlay(), readToolCall(execution))
    if (decision.action === 'deny') return { kind: 'deny', reason: decision.reason }
    return next()
  })
  return {
    installed: true,
    reason: '',
    dispose() {
      if (typeof disposeGuard === 'function') disposeGuard()
      if (typeof disposePre === 'function') disposePre()
    },
  }
}

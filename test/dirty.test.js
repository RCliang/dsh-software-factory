import assert from 'node:assert/strict'
import test from 'node:test'
import { observeDirty, parsePorcelain } from '../lib/dirty.js'

test('porcelain 解析列出文件，空输出是干净的', () => {
  assert.deepEqual(parsePorcelain(' M src/a.ts\n?? README.md\nR  old.ts -> src/new.ts\n'), ['src/a.ts', 'README.md', 'src/new.ts'])
  assert.deepEqual(parsePorcelain(''), [])
})

test('读取工作区只用 git status，失败时不把目录当成干净', async () => {
  const missing = await observeDirty(undefined)
  assert.equal(missing.status, 'unknown')

  let argv = null
  const clean = await observeDirty({
    spawn(options) {
      argv = options.argv
      return { done: Promise.resolve({ exitCode: 0, stdout: '' }) }
    },
  })
  assert.deepEqual(argv, ['git', 'status', '--porcelain=v1'])
  assert.equal(clean.status, 'clean')
  assert.equal(JSON.stringify(argv).includes('clean'), false)

  const dirty = await observeDirty({
    spawn() {
      return { done: Promise.resolve({ exitCode: 0, stdout: ' M src/app.ts\n' }) }
    },
  })
  assert.equal(dirty.status, 'dirty')
  assert.deepEqual(dirty.files, ['src/app.ts'])

  const failed = await observeDirty({
    spawn() {
      return { done: Promise.resolve({ exitCode: 1, stdout: '' }) }
    },
  })
  assert.equal(failed.status, 'unknown')
})

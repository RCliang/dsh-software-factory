import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('包清单符合可安装的 DSH bundle', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.name, 'dsh-software-factory')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.main, './lib/index.js')
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /name: dsh-software-factory/)
  const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(client, /window\.__ModuleLoader__\.load/)
  assert.match(client, /id: 'dsh-software-factory'/)
  assert.match(client, /key: 'software-factory'/)
  assert.match(client, /name: 'sidebar.panellist'/)
})

test('宿主和客户端是可解析的脚本，并且没有自动清理工作区的命令', () => {
  for (const file of ['lib/index.js', 'lib/client.js', 'lib/dirty.js', 'src/factory/controller.js', 'src/factory/gate.js']) {
    const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    assert.equal(checked.status, 0, file + '\n' + checked.stderr)
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8')
    assert.equal(source.includes('git clean'), false, file)
    assert.equal(source.includes('git reset'), false, file)
    assert.equal(source.includes('reset --hard'), false, file)
  }
})

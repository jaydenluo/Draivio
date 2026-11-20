import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readdir, readFile, rm, mkdir, copyFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const cleaner = join(root, 'scripts/clear-dev-port.mjs')

async function occupyPort(t) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import net from 'node:net'
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => console.log(server.address().port))
  `], { stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(() => child.kill())
  return await new Promise((resolve, reject) => {
    child.stdout.once('data', chunk => resolve(Number(String(chunk).trim())))
    child.once('error', reject)
    child.once('exit', code => reject(new Error('Listener exited: ' + code)))
  })
}

test('dev.sh clears an occupied port on macOS Bash and saves command output', { skip: process.platform === 'win32' }, async t => {
  const port = await occupyPort(t)
  const logs = await mkdtemp(join(tmpdir(), 'draivio-dev-test-'))
  t.after(() => rm(logs, { recursive: true, force: true }))
  const result = await run('/bin/bash', [join(root, 'dev.sh')], {
    cwd: root,
    env: { ...process.env, DRAIVIO_DEV_PORT: String(port), DRAIVIO_LOG_DIR: logs, DRAIVIO_DEV_COMMAND: 'echo DEV_START_OK' },
    timeout: 15000,
  })
  assert.match(result.stdout, /DEV_START_OK/)
  assert.match(result.stdout, /清理端口/)
  const files = await readdir(logs)
  assert.equal(files.length, 1)
  assert.match(await readFile(join(logs, files[0]), 'utf8'), /DEV_START_OK/)
})

test('shared cleaner releases a real occupied port and can run again', async t => {
  const port = await occupyPort(t)
  const first = await run(process.execPath, [cleaner, String(port)], { timeout: 15000 })
  assert.match(first.stdout, /清理端口/)
  const second = await run(process.execPath, [cleaner, String(port)], { timeout: 15000 })
  assert.match(second.stdout, /没有占用/)
})

test('dev.sh preserves the development command exit status', { skip: process.platform === 'win32' }, async t => {
  const port = await occupyPort(t)
  const logs = await mkdtemp(join(tmpdir(), 'draivio-dev-test-'))
  t.after(() => rm(logs, { recursive: true, force: true }))
  await assert.rejects(run('/bin/bash', [join(root, 'dev.sh')], {
    cwd: root,
    env: { ...process.env, DRAIVIO_DEV_PORT: String(port), DRAIVIO_LOG_DIR: logs, DRAIVIO_DEV_COMMAND: 'exit 7' },
    timeout: 15000,
  }), error => error.code === 7)
})

test('cleaner rejects invalid ports before attempting process cleanup', async () => {
  await assert.rejects(run(process.execPath, [cleaner, '0']), error => {
    assert.equal(error.code, 1)
    assert.match(error.stderr, /开发端口必须是/)
    return true
  })
})


test('running dev.sh finishes normally even when its on-disk source is rewritten', { skip: process.platform === 'win32', timeout: 15000 }, async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'draivio-live-script-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  await mkdir(join(fixture, 'scripts'))
  await copyFile(cleaner, join(fixture, 'scripts/clear-dev-port.mjs'))
  const script = join(fixture, 'dev.sh')
  await copyFile(join(root, 'dev.sh'), script)
  const port = await occupyPort(t)
  const release = join(fixture, 'release')
  const child = spawn('/bin/bash', [script], { env: {
    ...process.env, DRAIVIO_DEV_PORT: String(port), DRAIVIO_LOG_DIR: join(fixture, 'logs'),
    DRAIVIO_TEST_RELEASE: release,
    DRAIVIO_DEV_COMMAND: 'echo READY_FOR_REWRITE; while [ ! -f "$DRAIVIO_TEST_RELEASE" ]; do sleep 0.05; done; echo FINISHED',
  }, stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(() => child.kill())
  let output = '', errors = ''
  child.stderr.on('data', chunk => { errors += chunk })
  const ended = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => resolve(code))
  })
  await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk
      if (output.includes('READY_FOR_REWRITE\n')) resolve()
    })
    child.once('exit', code => reject(new Error(`Exited before ready: ${code}: ${errors}`)))
    child.once('error', reject)
  })
  // Reproduce an editor replacing a long-running script at its original path.
  await writeFile(script, '#'.repeat(4000) + '\n"\n')
  await writeFile(release, '')
  assert.equal(await ended, 0, errors)
  assert.match(output, /FINISHED/)
  assert.doesNotMatch(errors, /unexpected EOF|syntax error/)
})

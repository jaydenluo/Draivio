import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

const run = promisify(execFile)
const port = Number(process.argv[2] ?? 5173)

async function listeners() {
  let stdout
  if (process.platform === 'win32') {
    ;({ stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; exit 0`,
    ], { timeout: 10000 }))
  } else {
    try {
      ;({ stdout } = await run('lsof', ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN'], { timeout: 10000 }))
    } catch (error) {
      if (error.code === 1 && !error.stderr?.trim()) return []
      throw error
    }
  }
  return [...new Set(stdout.trim().split(/\s+/).map(Number))].filter(pid => Number.isInteger(pid) && pid > 0)
}

function stop(pid, signal) {
  if (pid === process.pid || pid === process.ppid) throw new Error('端口被启动器自身占用，无法清理')
  try { process.kill(pid, signal) }
  catch (error) { if (error.code !== 'ESRCH') throw error }
}

async function clearPort() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('开发端口必须是 1–65535 的整数')
  const pids = await listeners()
  if (!pids.length) {
    console.log(`[Draivio] 端口 ${port} 没有占用`)
    return
  }
  console.log(`[Draivio] 清理端口 ${port}，占用进程：${pids.join(' ')}`)
  pids.forEach(pid => stop(pid, 'SIGTERM'))
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!(await listeners()).length) return
    await delay(100)
  }
  const remaining = await listeners()
  if (remaining.some(pid => !pids.includes(pid))) throw new Error(`端口 ${port} 被其他进程重新占用，请稍后重试`)
  remaining.forEach(pid => stop(pid, 'SIGKILL'))
  for (let attempt = 0; attempt < 10; attempt++) {
    if (!(await listeners()).length) return
    await delay(100)
  }
  throw new Error(`无法释放端口 ${port}，请检查进程权限`)
}

try { await clearPort() }
catch (error) {
  console.error(`[Draivio] 端口清理失败：${error.message}`)
  process.exitCode = 1
}

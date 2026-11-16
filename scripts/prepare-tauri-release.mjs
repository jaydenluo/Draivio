import { writeFileSync } from 'node:fs'

const repository = process.env.GITHUB_REPOSITORY
if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
  throw new Error('GITHUB_REPOSITORY must be in owner/repository form')
}

const config = {
  plugins: {
    updater: {
      endpoints: [`https://github.com/${repository}/releases/latest/download/latest.json`],
    },
  },
}
writeFileSync('src-tauri/tauri.release.conf.json', `${JSON.stringify(config, null, 2)}\n`)

/**
 * Fail if ios/ has (a) untracked files that are not gitignored, or (b) uncommitted
 * changes to tracked files. Run before `git push` so native additions are not missed.
 *
 * Capacitor still generates ignored paths (e.g. ios/App/App/public); those are
 * recreated by `npm run cap:sync` / `cap sync` and are intentionally absent from Git.
 */
const { execSync } = require('child_process')

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', cwd: require('path').join(__dirname, '..') }).trimEnd()
}

const untracked = run('git ls-files --others --exclude-standard -- ios/')
if (untracked) {
  console.error(
    'verify-ios-git: untracked files under ios/ (not covered by .gitignore). Add and commit them:\n',
  )
  console.error(untracked + '\n')
  process.exit(1)
}

const status = run('git status --porcelain ios/')
const lines = status ? status.split(/\r?\n/) : []
const dirty = lines.filter((line) => line.length > 2 && !line.startsWith('??'))
if (dirty.length) {
  console.error('verify-ios-git: uncommitted changes under ios/. Commit or stash before push:\n')
  console.error(dirty.join('\n') + '\n')
  process.exit(1)
}

console.log('verify-ios-git: ok (no stray untracked ios/ files, no uncommitted ios/ changes).')

/**
 * Copy `dist/` into native Capacitor asset folders without invoking `npx cap`
 * (workaround when @capacitor/cli fails under OneDrive sync).
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const dist = path.join(root, 'dist')

const config = {
  appId: 'com.videocanvass.app',
  appName: 'VideoCanvass',
  webDir: 'dist',
}

function rmrf(dir) {
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) rmrf(p)
    else fs.unlinkSync(p)
  }
  fs.rmdirSync(dir)
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name)
    const to = path.join(dest, name)
    const st = fs.statSync(from)
    if (st.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

function escapeXmlText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Cordova-style file expected by the Xcode target (not committed; gitignored under ios/). */
function writeIosConfigXml(destPath, cfg) {
  const name = escapeXmlText(cfg.appName)
  const id = escapeXmlText(cfg.appId)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<widget id="${id}" version="1.0.0" xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0">
  <name>${name}</name>
  <description>${name}</description>
  <content src="index.html" />
</widget>
`
  fs.writeFileSync(destPath, xml, 'utf8')
}

if (!fs.existsSync(dist)) {
  console.error('Missing dist/. Run: npm run build')
  process.exit(1)
}

const androidPublic = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public')
const androidAssets = path.join(root, 'android', 'app', 'src', 'main', 'assets')
const iosPublic = path.join(root, 'ios', 'App', 'App', 'public')
const iosApp = path.join(root, 'ios', 'App', 'App')

if (fs.existsSync(androidPublic)) {
  rmrf(androidPublic)
}
copyDir(dist, androidPublic)
fs.writeFileSync(
  path.join(androidAssets, 'capacitor.config.json'),
  JSON.stringify(config, null, '\t') + '\n',
)
fs.writeFileSync(path.join(androidAssets, 'capacitor.plugins.json'), '[]\n')
console.log('Wrote', androidPublic)

if (fs.existsSync(iosPublic)) {
  rmrf(iosPublic)
}
copyDir(dist, iosPublic)
fs.writeFileSync(
  path.join(iosApp, 'capacitor.config.json'),
  JSON.stringify(config, null, '\t') + '\n',
)
writeIosConfigXml(path.join(iosApp, 'config.xml'), config)
console.log('Wrote', iosPublic, 'and', path.join(iosApp, 'config.xml'))

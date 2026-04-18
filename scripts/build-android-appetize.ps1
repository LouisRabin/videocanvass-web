# Build a debug APK on Windows for https://appetize.io/upload (Android)
# Requires: JDK 17+, Android SDK (install Android Studio), ANDROID_HOME set.
# Docs: https://docs.appetize.io/platform/app-management/uploading-apps/android
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not $env:ANDROID_HOME) {
  $studioSdk = "$env:LOCALAPPDATA\Android\Sdk"
  if (Test-Path $studioSdk) {
    $env:ANDROID_HOME = $studioSdk
    Write-Host "Using ANDROID_HOME=$env:ANDROID_HOME"
  } else {
    Write-Host "Set ANDROID_HOME to your Android SDK path (e.g. after installing Android Studio)." -ForegroundColor Yellow
    exit 1
  }
}

if (-not $env:JAVA_HOME) {
  $candidates = @(
    "$env:ProgramFiles\Android\Android Studio\jbr",
    "$env:ProgramFiles\Android\Android Studio\jre",
    "$env:LOCALAPPDATA\Programs\Android\Android Studio\jbr"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) {
      $env:JAVA_HOME = $p
      Write-Host "Using JAVA_HOME=$env:JAVA_HOME"
      break
    }
  }
}
if (-not $env:JAVA_HOME) {
  Write-Host "Set JAVA_HOME to JDK 17+ (Android Studio bundles one under its install folder, often ...\Android Studio\jbr)." -ForegroundColor Yellow
  exit 1
}

Write-Host "==> npm run build && copy web assets into android/"
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node "$Root\scripts\cap-copy-web.cjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$Gradle = Join-Path $Root 'android\gradlew.bat'
if (-not (Test-Path $Gradle)) {
  Write-Host "Missing android\ — sync this repo from OneDrive or run npx cap add android on a machine where Capacitor CLI works." -ForegroundColor Red
  exit 1
}

Write-Host "==> assembleDebug"
Push-Location (Join-Path $Root 'android')
& .\gradlew.bat assembleDebug
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { exit $code }

$Apk = Join-Path $Root 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $Apk)) {
  Write-Host "error: APK not found at $Apk" -ForegroundColor Red
  exit 1
}

$OutDir = Join-Path $Root 'dist-appetize'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Out = Join-Path $OutDir 'VideoCanvass-android-debug.apk'
Copy-Item -Force $Apk $Out

Write-Host ""
Write-Host "Upload this file at https://appetize.io/upload :" -ForegroundColor Green
Write-Host "  $Out"
Write-Host ""

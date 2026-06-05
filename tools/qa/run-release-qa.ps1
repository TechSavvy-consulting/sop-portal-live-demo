param(
  [string]$SourceRoot = (Resolve-Path ".").Path,
  [int]$Port = 0,
  [switch]$KeepSandbox,
  [switch]$IncludeScreenshotRecapture
)

$ErrorActionPreference = "Stop"

function Resolve-Node {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Node.js was not found on PATH."
  }
  return $cmd.Source
}

function Wait-ForPortal {
  param([string]$BaseUrl, [int]$Seconds = 25)
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $res = Invoke-WebRequest -Uri "$BaseUrl/api/me" -UseBasicParsing -TimeoutSec 2
      if ($res.StatusCode -eq 200) { return }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "Portal did not become ready at $BaseUrl within $Seconds seconds."
}

$SourceRoot = (Resolve-Path -LiteralPath $SourceRoot).Path
$node = Resolve-Node
if ($Port -le 0) {
  $Port = 18000 + (Get-Random -Minimum 0 -Maximum 3000)
}

$sandboxRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("sop-portal-release-qa-{0}" -f ([DateTime]::UtcNow.ToString("yyyyMMddHHmmssfff")))
$excludeNames = @(".git", "node_modules", ".qa-sandbox", "runtime-data")

Write-Host "Creating QA sandbox: $sandboxRoot"
New-Item -ItemType Directory -Path $sandboxRoot | Out-Null

Get-ChildItem -LiteralPath $SourceRoot -Force | Where-Object {
  $excludeNames -notcontains $_.Name
} | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $sandboxRoot -Recurse -Force
}

& $node (Join-Path $sandboxRoot "tools\qa\release-qa.js") --prepare $sandboxRoot --port $Port
if ($LASTEXITCODE -ne 0) {
  throw "QA sandbox preparation failed."
}

$baseUrl = "http://127.0.0.1:$Port"
$env:QA_BASE_URL = $baseUrl
$env:QA_SANDBOX_ROOT = $sandboxRoot
$env:QA_ADMIN_USER = "qa_admin"
$env:QA_ADMIN_PASS = "QaPass123!"
$env:QA_MANAGER_USER = "qa_manager"
$env:QA_MANAGER_PASS = "QaPass123!"
$env:QA_EDITOR_USER = "qa_editor"
$env:QA_EDITOR_PASS = "QaPass123!"
$env:QA_STAFF_USER = "qa_staff"
$env:QA_STAFF_PASS = "QaPass123!"
$env:QA_VIEWER_USER = "qa_viewer"
$env:QA_VIEWER_PASS = "QaPass123!"
if ($IncludeScreenshotRecapture) {
  $env:QA_INCLUDE_SCREENSHOT_RECAPTURE = "1"
} else {
  Remove-Item Env:\QA_INCLUDE_SCREENSHOT_RECAPTURE -ErrorAction SilentlyContinue
}

$proc = $null
try {
  Write-Host "Starting sandbox portal: $baseUrl"
  $proc = Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory $sandboxRoot -PassThru -WindowStyle Hidden
  Wait-ForPortal -BaseUrl $baseUrl
  & $node (Join-Path $sandboxRoot "tools\qa\release-qa.js")
  if ($LASTEXITCODE -ne 0) {
    throw "Release QA failed."
  }
  Write-Host "Release QA passed against sandbox: $sandboxRoot"
} finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force
    $proc.WaitForExit()
  }
  if (-not $KeepSandbox) {
    $resolvedSandbox = (Resolve-Path -LiteralPath $sandboxRoot).Path
    $tempRoot = [System.IO.Path]::GetTempPath()
    if (-not $resolvedSandbox.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove sandbox outside temp directory: $resolvedSandbox"
    }
    Remove-Item -LiteralPath $resolvedSandbox -Recurse -Force
    Write-Host "Removed QA sandbox."
  } else {
    Write-Host "Kept QA sandbox: $sandboxRoot"
  }
}

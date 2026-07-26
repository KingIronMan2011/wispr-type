<#
Creates a complete Windows release from main.

Usage:
  .\scripts\release.ps1 -Version 0.1.1
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidatePattern("^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$")]
  [string]$Version
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$tag = "v$Version"

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments)] [string[]]$Arguments)

  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed."
  }
}

function Set-VersionInFile {
  param(
    [string]$Path,
    [string]$Pattern,
    [string]$Replacement
  )

  $fullPath = (Resolve-Path -LiteralPath $Path).Path
  $content = [System.IO.File]::ReadAllText($fullPath)
  $updated = [regex]::Replace($content, $Pattern, $Replacement, 1)
  if ($updated -eq $content) {
    throw "Couldn't find the version field in $Path."
  }
  [System.IO.File]::WriteAllText(
    $fullPath,
    $updated,
    [System.Text.UTF8Encoding]::new($false)
  )
}

if ((git branch --show-current).Trim() -ne "main") {
  throw "Release from the main branch only."
}
if (git status --porcelain) {
  throw "Commit or stash your current changes before making a release."
}

Invoke-Git pull --ff-only origin main

if (git rev-parse --verify --quiet "refs/tags/$tag") {
  throw "The local tag $tag already exists."
}
& git ls-remote --exit-code --tags origin "refs/tags/$tag" *> $null
if ($LASTEXITCODE -eq 0) {
  throw "The remote tag $tag already exists."
}

Set-VersionInFile "package.json" '(?m)^(\s*"version"\s*:\s*")[^"]+(")' "`$1$Version`$2"
Set-VersionInFile "src-tauri\Cargo.toml" '(?m)^(version\s*=\s*")[^"]+(")' "`$1$Version`$2"
Set-VersionInFile "src-tauri\Cargo.lock" '(?ms)(name = "wispr-type"\s+version = ")[^"]+(")' "`$1$Version`$2"
Set-VersionInFile "src-tauri\tauri.conf.json" '(?m)^(\s*"version"\s*:\s*")[^"]+(")' "`$1$Version`$2"
Set-VersionInFile "src\App.tsx" '(?s)(WISPR TYPE\s*<span>)[^<]+(</span>)' "`$1$Version`$2"

pnpm types
cargo check --manifest-path src-tauri\Cargo.toml

Invoke-Git add -- .
Invoke-Git commit -m "release: $tag"
Invoke-Git push origin main
Invoke-Git tag -a $tag -m "Release $tag"
Invoke-Git push origin $tag

Write-Host "Published $tag. GitHub Actions will now build and publish the release." -ForegroundColor Green

@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; $t=[IO.File]::ReadAllText($f); $p=($t -split ':{3}DC_PS:{3}')[1]; if($p){Invoke-Expression $p}"
exit /b 0
:::DC_PS:::
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "DarknessClient Uninstaller"
Write-Host "=========================="

$roots = @(
    @{ Name = "Discord Stable";     Root = Join-Path $env:LOCALAPPDATA "discord" },
    @{ Name = "Discord Canary";     Root = Join-Path $env:LOCALAPPDATA "discordcanary" },
    @{ Name = "Discord PTB";        Root = Join-Path $env:LOCALAPPDATA "discordptb" },
    @{ Name = "Discord Development"; Root = Join-Path $env:LOCALAPPDATA "discorddevelopment" }
)

$installs = @()
foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root.Root)) { continue }
    $appDirs = Get-ChildItem -LiteralPath $root.Root -Directory -Filter "app-*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending
    foreach ($appDir in $appDirs) {
        $backup = Join-Path $appDir.FullName "resources\_app.asar"
        if (Test-Path -LiteralPath $backup) {
            $installs += [pscustomobject]@{
                Label  = ("{0}  [{1}]" -f $root.Name, $appDir.Name)
                App    = Join-Path $appDir.FullName "resources\app.asar"
                Backup = $backup
                Dir    = $appDir.FullName
            }
        }
    }
}

if ($installs.Count -eq 0) {
    Write-Host "No patched Discord install found under %LOCALAPPDATA%." -ForegroundColor Red
    Read-Host "Press Enter to exit" | Out-Null
    exit 1
}

Write-Host ""
Write-Host "Select the Discord install to unpatch:"
for ($i = 0; $i -lt $installs.Count; $i++) {
    Write-Host ("  [{0}] {1}" -f ($i + 1), $installs[$i].Label)
}
Write-Host ""

$answer = Read-Host "Enter number (Q to quit)"
if ($answer -match "^(?i:q)$") { exit 0 }
$index = 0
if (-not [int]::TryParse($answer, [ref]$index) -or $index -lt 1 -or $index -gt $installs.Count) {
    Write-Host "Invalid selection." -ForegroundColor Red
    Read-Host "Press Enter to exit" | Out-Null
    exit 1
}
$target = $installs[$index - 1]

$processNames = @("Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment")
$running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $processNames -contains $_.ProcessName })
if ($running.Count -gt 0) {
    Write-Host "Discord is currently running." -ForegroundColor Yellow
    $close = Read-Host "Close all Discord processes now? [Y/n]"
    if ($close -eq "" -or $close -match "^(?i:y)$") {
        $running | Stop-Process -Force
        Start-Sleep -Milliseconds 800
    } else {
        Write-Host "Aborted. Close Discord and run the uninstaller again." -ForegroundColor Red
        exit 1
    }
}

$resources = Split-Path -Parent $target.App
foreach ($file in @($target.App, $target.Backup)) {
    if (Test-Path -LiteralPath $file) {
        (Get-Item -LiteralPath $file).IsReadOnly = $false
    }
}
if ((Get-Item -LiteralPath $target.Backup).Length -lt 1MB) {
    Write-Host "Warning: _app.asar looks unusually small; the install may be broken." -ForegroundColor Yellow
}

Copy-Item -LiteralPath $target.Backup -Destination $target.App -Force
Remove-Item -LiteralPath $target.Backup -Force
Write-Host ""
Write-Host "DarknessClient patch removed." -ForegroundColor Green

$settings = Join-Path $env:APPDATA "DarknessClient"
if (Test-Path -LiteralPath $settings) {
    $remove = Read-Host "Delete DarknessClient settings too? [y/N]"
    if ($remove -match "^(?i:y)$") {
        Remove-Item -LiteralPath $settings -Recurse -Force
        Write-Host "Removed $settings"
    }
}

$launch = Read-Host "Launch Discord now? [Y/n]"
if ($launch -eq "" -or $launch -match "^(?i:y)$") {
    $exe = Get-ChildItem -LiteralPath $target.Dir -File -Filter "*.exe" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match "Discord" } | Select-Object -First 1
    if ($exe) {
        Start-Process -FilePath $exe.FullName
    } else {
        Write-Host "Could not find the Discord executable; launch it manually." -ForegroundColor Yellow
    }
}

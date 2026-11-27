/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 DarknessClient contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { createPackage } from "@electron/asar";

const SOURCE = "dist/desktop";
const OUTPUT = "install-darknessclient.cmd";

if (!existsSync(SOURCE)) {
    throw new Error(`Missing ${SOURCE}. Run \`pnpm buildStandalone\` first.`);
}

const staging = mkdtempSync(join(tmpdir(), "darknessclient-installer-"));
try {
    const folder = join(staging, "desktop");
    cpSync(SOURCE, folder, {
        recursive: true,
        filter: file => !file.endsWith(".map")
    });
    await createPackage(folder, join(staging, "desktop.asar"));

    const asar = readFileSync(join(staging, "desktop.asar"));
    const payload = gzipSync(asar, { level: 9 }).toString("base64");
    const lines = payload.match(/.{1,120}/g) ?? [];

    const ps = String.raw`$ErrorActionPreference = "Stop"
$payloadPart = ($t -split ":{3}DC_PAYLOAD:{3}")[1]
if (-not $payloadPart) { throw "Installer payload is missing." }
$base64 = $payloadPart -replace "\s", ""
$compressed = [Convert]::FromBase64String($base64)

$inputStream = New-Object System.IO.MemoryStream(, $compressed)
$gzip = New-Object System.IO.Compression.GZipStream($inputStream, [System.IO.Compression.CompressionMode]::Decompress)
$outputStream = New-Object System.IO.MemoryStream
$gzip.CopyTo($outputStream)
$gzip.Dispose()
$inputStream.Dispose()
$asarBytes = $outputStream.ToArray()
$outputStream.Dispose()

Write-Host ""
Write-Host "DarknessClient Installer" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# Locate every Discord desktop install under %LOCALAPPDATA%.
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
        if (Test-Path -LiteralPath (Join-Path $appDir.FullName "resources\app.asar")) {
            $installs += [pscustomobject]@{
                Label = ("{0}  [{1}]" -f $root.Name, $appDir.Name)
                Dir   = $appDir.FullName
            }
        }
    }
}

if ($installs.Count -eq 0) {
    Write-Host "No Discord install found under %LOCALAPPDATA%." -ForegroundColor Red
    Read-Host "Press Enter to exit" | Out-Null
    exit 1
}

Write-Host ""
Write-Host "Select the Discord install to patch:"
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

# Discord holds app.asar open while running, so it must be closed.
$processNames = @("Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment")
$running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $processNames -contains $_.ProcessName })
if ($running.Count -gt 0) {
    Write-Host "Discord is currently running." -ForegroundColor Yellow
    $close = Read-Host "Close all Discord processes now? [Y/n]"
    if ($close -eq "" -or $close -match "^(?i:y)$") {
        $running | Stop-Process -Force
        Start-Sleep -Milliseconds 800
    } else {
        Write-Host "Aborted. Close Discord and run the installer again." -ForegroundColor Red
        exit 1
    }
}

$resources = Join-Path $target.Dir "resources"
$appAsar = Join-Path $resources "app.asar"
$backupAsar = Join-Path $resources "_app.asar"

if (Test-Path -LiteralPath $appAsar) {
    (Get-Item -LiteralPath $appAsar).IsReadOnly = $false
}
if (Test-Path -LiteralPath $backupAsar) {
    (Get-Item -LiteralPath $backupAsar).IsReadOnly = $false
}

if (Test-Path -LiteralPath $backupAsar) {
    Write-Host "An existing patch was found. Replacing it with DarknessClient..."
    if ((Get-Item -LiteralPath $backupAsar).Length -lt 1MB) {
        Write-Host "Warning: _app.asar looks unusually small; the install may be broken." -ForegroundColor Yellow
    }
} else {
    Rename-Item -LiteralPath $appAsar -NewName "_app.asar"
    Write-Host "Backed up original app.asar to _app.asar"
}

[IO.File]::WriteAllBytes($appAsar, $asarBytes)
Write-Host ""
Write-Host "DarknessClient installed successfully." -ForegroundColor Green
Write-Host "Settings are stored in %APPDATA%\DarknessClient"

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
`;

    // Keep the PowerShell body free of JS interpolation: String.raw above plus
    // explicit concatenation here.
    const cmd = [
        "@echo off",
        "chcp 65001 >nul",
        "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$f='%~f0'; $t=[IO.File]::ReadAllText($f); $p=($t -split ':{3}DC_PS:{3}')[1]; if($p -match '(?s)^(.*?):{3}DC_PAYLOAD:{3}'){Invoke-Expression $Matches[1]}\"",
        "exit /b 0",
        ":::DC_PS:::",
        ps.trimEnd(),
        ":::DC_PAYLOAD:::",
        ...lines,
        ""
    ].join("\r\n");

    writeFileSync(OUTPUT, cmd);
    console.log(`Wrote ${OUTPUT} (${(Buffer.byteLength(cmd) / 1024 / 1024).toFixed(2)} MiB, asar ${(asar.length / 1024 / 1024).toFixed(2)} MiB)`);
} finally {
    rmSync(staging, { recursive: true, force: true });
}

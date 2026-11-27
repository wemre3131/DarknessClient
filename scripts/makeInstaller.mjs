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
const OUTPUT_CMD = "install-darknessclient.cmd";
const OUTPUT_SH = "install-darknessclient.sh";
const UNINSTALL_CMD = "uninstall-darknessclient.cmd";
const UNINSTALL_SH = "uninstall-darknessclient.sh";

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

    const sh = String.raw`#!/bin/sh
set -eu

self=$0
payload=$(awk 'seen { print } /^:::DC_PAYLOAD:::$/ { seen = 1 }' "$self")
if [ -z "$payload" ]; then
    echo "Installer payload is missing." >&2
    exit 1
fi

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT HUP INT TERM

if printf '%s\n' "$payload" | base64 -d > "$tmpdir/payload.gz" 2>/dev/null; then
    :
else
    printf '%s\n' "$payload" | base64 -D > "$tmpdir/payload.gz"
fi
gzip -dc "$tmpdir/payload.gz" > "$tmpdir/app.asar"

die() {
    echo "$1" >&2
    exit 1
}

echo ""
echo "DarknessClient Installer"
echo "========================"

installs=""

add_install() {
    label=$1
    app=$2
    if [ -f "$app" ]; then
        installs="$installs$label|$app
"
    fi
}

# macOS app bundles
for bundle in \
    "/Applications/Discord.app" \
    "/Applications/Discord Canary.app" \
    "/Applications/Discord PTB.app" \
    "/Applications/Discord Development.app" \
    "$HOME/Applications/Discord.app" \
    "$HOME/Applications/Discord Canary.app" \
    "$HOME/Applications/Discord PTB.app" \
    "$HOME/Applications/Discord Development.app"
do
    add_install "$(basename "$bundle") (macOS)" "$bundle/Contents/Resources/app.asar"
done

# Linux user-level updater installs
for dir in \
    "$HOME/.config"/discord*/app-* \
    "$HOME/.config"/discordcanary*/app-* \
    "$HOME/.config"/discordptb*/app-* \
    "$HOME/.config"/discorddevelopment*/app-*
do
    [ -f "$dir/resources/app.asar" ] || continue
    parent=$(basename "$(dirname "$dir")")
    version=$(basename "$dir")
    add_install "$parent [$version] (Linux)" "$dir/resources/app.asar"
done

# Linux system, Flatpak and Snap installs
for dir in \
    /usr/share/discord \
    /usr/share/discord-canary \
    /usr/share/discord-ptb \
    /opt/discord \
    /opt/discordcanary \
    /opt/discord-ptb
do
    add_install "$(basename "$dir") (Linux)" "$dir/resources/app.asar"
done

for dir in \
    "$HOME/.var/app"/com.discordapp.Discord*/files/Discord \
    /var/lib/flatpak/app/com.discordapp.Discord*/current/active/files/Discord
do
    [ -f "$dir/resources/app.asar" ] || continue
    add_install "Discord Flatpak [$(basename "$dir")]" "$dir/resources/app.asar"
done

for dir in /snap/discord/current /snap/discord-canary/current
do
    add_install "Discord Snap" "$dir/resources/app.asar"
    add_install "Discord Snap" "$dir/usr/share/discord/resources/app.asar"
done

count=$(printf '%s\n' "$installs" | awk 'NF { n++ } END { print n + 0 }')
if [ "$count" -eq 0 ]; then
    echo "No Discord install found." >&2
    exit 1
fi

echo ""
echo "Select the Discord install to patch:"
printf '%s\n' "$installs" | awk -F'|' 'NF { printf "  [%d] %s\n", ++n, $1 }'
echo ""

printf 'Enter number (q to quit): '
IFS= read -r answer || exit 0
case "$answer" in
    q|Q) exit 0 ;;
esac
case "$answer" in
    ''|*[!0-9]*) die "Invalid selection." ;;
esac
if [ "$answer" -lt 1 ] || [ "$answer" -gt "$count" ]; then
    die "Invalid selection."
fi

app=$(printf '%s\n' "$installs" | awk -F'|' -v n="$answer" 'NF && ++i == n { print $2 }')
[ -n "$app" ] || die "Could not resolve that install."

if command -v pgrep >/dev/null 2>&1; then
    running=$(pgrep -f 'Discord(Canary|PTB|Development)?' || true)
    if [ -n "$running" ]; then
        echo "Discord is currently running."
        printf 'Close all Discord processes now? [Y/n] '
        IFS= read -r close || close=n
        case "$close" in
            ''|y|Y|yes|YES)
                for pid in $running; do kill "$pid" 2>/dev/null || true; done
                sleep 1
                for pid in $running; do kill -9 "$pid" 2>/dev/null || true; done
                ;;
            *)
                die "Aborted. Close Discord and run the installer again."
                ;;
        esac
    fi
fi

resources=$(dirname "$app")
backup="$resources/_app.asar"
sudo_cmd=""
if [ ! -w "$resources" ]; then
    if command -v sudo >/dev/null 2>&1; then
        echo "This install needs administrator rights. You may be prompted for your password."
        sudo_cmd=sudo
    else
        die "Cannot write to $resources and sudo is unavailable."
    fi
fi

if [ -f "$backup" ]; then
    echo "An existing patch was found. Replacing it with DarknessClient..."
    backup_size=$(wc -c < "$backup" | tr -d ' ')
    if [ "$backup_size" -lt 1048576 ]; then
        echo "Warning: _app.asar looks unusually small; the install may be broken."
    fi
else
    $sudo_cmd cp -p "$app" "$backup"
    echo "Backed up original app.asar to _app.asar"
fi

$sudo_cmd chmod u+w "$app" "$backup" 2>/dev/null || true
$sudo_cmd cp "$tmpdir/app.asar" "$app"

echo ""
echo "DarknessClient installed successfully."
case "$(uname -s)" in
    Darwin) echo "Settings are stored in $HOME/Library/Application Support/DarknessClient" ;;
    *) echo "Settings are stored in $HOME/.config/DarknessClient" ;;
esac

printf 'Launch Discord now? [Y/n] '
IFS= read -r launch || launch=n
case "$launch" in
    ''|y|Y|yes|YES)
        case "$app" in
            *.app/Contents/Resources/app.asar)
                bundle=$(printf '%s' "$app" | sed 's#/Contents/Resources/app\.asar$##')
                if command -v open >/dev/null 2>&1; then
                    open "$bundle" >/dev/null 2>&1 &
                fi
                ;;
            *)
                root=$(dirname "$resources")
                for exe in \
                    "$root/Discord" \
                    "$root/discord" \
                    "$root/DiscordCanary" \
                    "$root/discord-canary" \
                    /usr/bin/discord \
                    /usr/bin/discord-canary \
                    /usr/bin/discord-ptb
                do
                    if [ -x "$exe" ]; then
                        "$exe" >/dev/null 2>&1 &
                        break
                    fi
                done
                ;;
        esac
        ;;
esac

exit 0
`;

    const psUninstall = String.raw`$ErrorActionPreference = "Stop"

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
`;

    const shUninstall = String.raw`#!/bin/sh
set -eu

die() {
    echo "$1" >&2
    exit 1
}

echo ""
echo "DarknessClient Uninstaller"
echo "=========================="

installs=""

add_install() {
    label=$1
    backup=$2
    if [ -f "$backup" ]; then
        app=$(dirname "$backup")/app.asar
        installs="$installs$label|$app|$backup
"
    fi
}

for bundle in \
    "/Applications/Discord.app" \
    "/Applications/Discord Canary.app" \
    "/Applications/Discord PTB.app" \
    "/Applications/Discord Development.app" \
    "$HOME/Applications/Discord.app" \
    "$HOME/Applications/Discord Canary.app" \
    "$HOME/Applications/Discord PTB.app" \
    "$HOME/Applications/Discord Development.app"
do
    add_install "$(basename "$bundle") (macOS)" "$bundle/Contents/Resources/_app.asar"
done

for dir in \
    "$HOME/.config"/discord*/app-* \
    "$HOME/.config"/discordcanary*/app-* \
    "$HOME/.config"/discordptb*/app-* \
    "$HOME/.config"/discorddevelopment*/app-*
do
    [ -f "$dir/resources/_app.asar" ] || continue
    parent=$(basename "$(dirname "$dir")")
    version=$(basename "$dir")
    add_install "$parent [$version] (Linux)" "$dir/resources/_app.asar"
done

for dir in \
    /usr/share/discord \
    /usr/share/discord-canary \
    /usr/share/discord-ptb \
    /opt/discord \
    /opt/discordcanary \
    /opt/discord-ptb
do
    add_install "$(basename "$dir") (Linux)" "$dir/resources/_app.asar"
done

for dir in \
    "$HOME/.var/app"/com.discordapp.Discord*/files/Discord \
    /var/lib/flatpak/app/com.discordapp.Discord*/current/active/files/Discord
do
    [ -f "$dir/resources/_app.asar" ] || continue
    add_install "Discord Flatpak [$(basename "$dir")]" "$dir/resources/_app.asar"
done

for dir in /snap/discord/current /snap/discord-canary/current
do
    add_install "Discord Snap" "$dir/resources/_app.asar"
    add_install "Discord Snap" "$dir/usr/share/discord/resources/_app.asar"
done

count=$(printf '%s\n' "$installs" | awk 'NF { n++ } END { print n + 0 }')
if [ "$count" -eq 0 ]; then
    echo "No patched Discord install found." >&2
    exit 1
fi

echo ""
echo "Select the Discord install to unpatch:"
printf '%s\n' "$installs" | awk -F'|' 'NF { printf "  [%d] %s\n", ++n, $1 }'
echo ""

printf 'Enter number (q to quit): '
IFS= read -r answer || exit 0
case "$answer" in
    q|Q) exit 0 ;;
esac
case "$answer" in
    ''|*[!0-9]*) die "Invalid selection." ;;
esac
if [ "$answer" -lt 1 ] || [ "$answer" -gt "$count" ]; then
    die "Invalid selection."
fi

app=$(printf '%s\n' "$installs" | awk -F'|' -v n="$answer" 'NF && ++i == n { print $2 }')
backup=$(printf '%s\n' "$installs" | awk -F'|' -v n="$answer" 'NF && ++i == n { print $3 }')
[ -n "$app" ] && [ -n "$backup" ] || die "Could not resolve that install."

if command -v pgrep >/dev/null 2>&1; then
    running=$(pgrep -f 'Discord(Canary|PTB|Development)?' || true)
    if [ -n "$running" ]; then
        echo "Discord is currently running."
        printf 'Close all Discord processes now? [Y/n] '
        IFS= read -r close || close=n
        case "$close" in
            ''|y|Y|yes|YES)
                for pid in $running; do kill "$pid" 2>/dev/null || true; done
                sleep 1
                for pid in $running; do kill -9 "$pid" 2>/dev/null || true; done
                ;;
            *)
                die "Aborted. Close Discord and run the uninstaller again."
                ;;
        esac
    fi
fi

resources=$(dirname "$app")
sudo_cmd=""
if [ ! -w "$resources" ]; then
    if command -v sudo >/dev/null 2>&1; then
        echo "This install needs administrator rights. You may be prompted for your password."
        sudo_cmd=sudo
    else
        die "Cannot write to $resources and sudo is unavailable."
    fi
fi

backup_size=$(wc -c < "$backup" | tr -d ' ')
if [ "$backup_size" -lt 1048576 ]; then
    echo "Warning: _app.asar looks unusually small; the install may be broken."
fi

$sudo_cmd chmod u+w "$app" "$backup" 2>/dev/null || true
$sudo_cmd cp -f "$backup" "$app"
$sudo_cmd rm -f "$backup"

echo ""
echo "DarknessClient patch removed."

case "$(uname -s)" in
    Darwin) settings="$HOME/Library/Application Support/DarknessClient" ;;
    *) settings="$HOME/.config/DarknessClient" ;;
esac
if [ -d "$settings" ]; then
    printf 'Delete DarknessClient settings too? [y/N] '
    IFS= read -r remove || remove=n
    case "$remove" in
        y|Y|yes|YES)
            rm -rf "$settings"
            echo "Removed $settings"
            ;;
    esac
fi

printf 'Launch Discord now? [Y/n] '
IFS= read -r launch || launch=n
case "$launch" in
    ''|y|Y|yes|YES)
        case "$app" in
            *.app/Contents/Resources/app.asar)
                bundle=$(printf '%s' "$app" | sed 's#/Contents/Resources/app\.asar$##')
                if command -v open >/dev/null 2>&1; then
                    open "$bundle" >/dev/null 2>&1 &
                fi
                ;;
            *)
                root=$(dirname "$resources")
                for exe in \
                    "$root/Discord" \
                    "$root/discord" \
                    "$root/DiscordCanary" \
                    "$root/discord-canary" \
                    /usr/bin/discord \
                    /usr/bin/discord-canary \
                    /usr/bin/discord-ptb
                do
                    if [ -x "$exe" ]; then
                        "$exe" >/dev/null 2>&1 &
                        break
                    fi
                done
                ;;
        esac
        ;;
esac

exit 0
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

    const shell = [sh.trimEnd(), ":::DC_PAYLOAD:::", ...lines, ""].join("\n");
    const uninstallCmd = [
        "@echo off",
        "chcp 65001 >nul",
        "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$f='%~f0'; $t=[IO.File]::ReadAllText($f); $p=($t -split ':{3}DC_PS:{3}')[1]; if($p){Invoke-Expression $p}\"",
        "exit /b 0",
        ":::DC_PS:::",
        psUninstall.trimEnd(),
        ""
    ].join("\r\n");

    writeFileSync(OUTPUT_CMD, cmd);
    writeFileSync(OUTPUT_SH, shell);
    writeFileSync(UNINSTALL_CMD, uninstallCmd);
    writeFileSync(UNINSTALL_SH, shUninstall.trimEnd() + "\n");
    console.log(`Wrote ${OUTPUT_CMD} (${(Buffer.byteLength(cmd) / 1024 / 1024).toFixed(2)} MiB)`);
    console.log(`Wrote ${OUTPUT_SH} (${(Buffer.byteLength(shell) / 1024 / 1024).toFixed(2)} MiB, asar ${(asar.length / 1024 / 1024).toFixed(2)} MiB)`);
    console.log(`Wrote ${UNINSTALL_CMD} and ${UNINSTALL_SH}`);
} finally {
    rmSync(staging, { recursive: true, force: true });
}

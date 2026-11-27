# DarknessClient

A Discord client mod that ships with **every plugin from both [Vencord](https://github.com/Vendicated/Vencord) and [Equicord](https://github.com/Equicord/Equicord)** enabled in one build.

DarknessClient is a downstream fork of Equicord (itself a Vencord fork). It keeps Equicord's plugin set and adds back the four Vencord plugins Equicord does not carry: `EditUsers`, `oneko`, `SpotifyControls`, and `VencordToolbox`. The result is a single client with **380 plugins** available out of the box.

## What is included

| Source | Plugins |
| --- | --- |
| `src/plugins/` | 170 directories (Vencord base + 4 ported plugins + core plugins) |
| `src/equicordplugins/` | 207 directories (Equicord exclusives) |
| **Total registered plugins** | **380** (verified with `pnpm generatePluginJson`) |

All 380 plugins are compiled into the bundles and selectable in the Plugins settings tab. They are **not all switched on at once** — upstream marks most plugins `enabledByDefault: false`, and enabling conflicting plugins together can break the client. Enable what you need in settings.

Build targets:

- **Desktop / standalone patcher** — built into `dist/desktop/`
- **Equibop** — built into `dist/equibop/`
- **Browser extension and userscript** — built into `dist/browser/`, `dist/*.user.js`

## Requirements

- Node.js **22 or newer** (tested with Node 26)
- pnpm **12.18.0** (`corepack` is not required; install it with `npm i -g pnpm@12.18.0` or via a local prefix)
- A git checkout with at least one commit and an `origin` remote — the build embeds `git rev-parse HEAD` and `git remote get-url origin`

## Build

```bash
pnpm install --frozen-lockfile
pnpm buildStandalone    # desktop + equibop + patcher
pnpm buildWebStandalone # browser extension + userscript
```

Outputs land in `dist/`.

## Install

DarknessClient is a **client mod**, not a standalone Discord app. Pick one of these targets.

### Desktop Discord / Equibop (Linux, macOS, Windows)

With Discord installed and the project built:

```bash
pnpm inject      # patch the installed Discord with dist/desktop
pnpm uninject    # remove the patch
pnpm repair      # re-apply after Discord updates itself
```

`pnpm inject` downloads the Equilotl CLI into `dist/Installer/` and points it at this repo's `dist/desktop` build. If Discord is installed in a root-owned location (for example `/usr/share/discord` on Linux), the CLI will ask for `sudo`/`doas`. Launch Discord normally afterwards; the settings panel and logs should say **DarknessClient**.

### Windows one-file installer

`install-darknessclient.cmd` is a self-contained Windows installer: it embeds the built mod, so no Node.js, pnpm, or separate downloads are needed. Give that single file to the end user and have them double-click it. It:

1. Detects Discord Stable, Canary, PTB and Development installs under `%LOCALAPPDATA%`.
2. Asks which install to patch.
3. Closes Discord if it is running.
4. Backs up `resources/app.asar` as `resources/_app.asar` and installs the mod.
5. Offers to relaunch Discord.

Settings then live in `%APPDATA%\DarknessClient`. Re-run the same file after a Discord update to re-apply the patch. To regenerate it after changing the client:

```bash
pnpm buildStandalone
pnpm makeInstaller
```

Because it embeds a compressed payload and launches PowerShell, some antivirus tools may flag the `.cmd`; verify the file hash before distributing it.

### Browser extension

- **Chromium:** open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/browser/chromium-unpacked/`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/browser/firefox-unpacked/manifest.json`. This load is temporary and disappears on restart.
- Ready-made archives are also produced: `dist/extension-chrome.zip` and `dist/extension-firefox.zip`.

### Userscript

Install Tampermonkey (or Violentmonkey on Chromium), then drag `dist/DarknessClient.user.js` into the userscript dashboard. The matching `dist/DarknessClient.user.css` is appended into the script at build time. Upstream notes that this userscript does not work with Violentmonkey/Greasemonkey on Firefox.

If `pnpm` is not on your `PATH`, either install it globally (`sudo npm i -g pnpm@12.18.0`) or prefix the commands with `export PATH="/home/kavasaki/.local/bin:$PATH"`.

## Verification

```bash
pnpm testTsc                                   # typecheck
pnpm lint                                      # oxlint
pnpm buildStandalone                           # desktop build
pnpm buildWebStandalone                        # web build
pnpm generatePluginJson /tmp/plugins.json      # enumerate all registered plugins
node -e "console.log(require('/tmp/plugins.json').length)"  # -> 380
```

## Rebranding notes

The client identity is DarknessClient: package metadata, browser manifests, userscript metadata, logger prefix, user agent, tray menu, settings section, update messages, about page, and the native data directory (`DarknessClientData`).

Deliberately left unchanged:

- Upstream code identifiers and module aliases (`@equicordplugins`, `EquicordDevs`, `equicord_section`, etc.) — changing these would break plugin imports.
- Author credits in every plugin — Vencord and Equicord contributors keep their attribution.
- External service integrations (Equicord Cloud, badges, donor perks, support server) — these still point at the real upstream services, so renaming them would misrepresent who provides them.
- `.github/` workflows — they reference upstream repositories, release artifacts, and CI secrets.
- `CONTRIBUTING.md` and `PRIVACY_POLICY.md` — inherited upstream governance documents, left untouched rather than inventing new policy.

The git `origin` remote points at `https://github.com/wemre3131/DarknessClient.git`, which is also the repository linked from the built client. Support goes to `https://paypal.me/kkavaski`. The build also accepts `DARKNESSCLIENT_REMOTE` (or legacy `EQUICORD_REMOTE`) to override the embedded remote at build time.

## License

GPL-3.0-or-later. DarknessClient is a fork of Equicord and Vencord; their licenses and contributor credits are preserved in `LICENSE`, source headers, and plugin metadata.

Client modifications can violate Discord's Terms of Service. Use at your own risk.

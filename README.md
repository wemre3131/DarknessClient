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

The git `origin` remote currently points at `https://github.com/DarknessClient/DarknessClient.git`. Change it to your own fork before relying on the in-client updater. The build also accepts `DARKNESSCLIENT_REMOTE` (or legacy `EQUICORD_REMOTE`) to override the embedded remote at build time.

## License

GPL-3.0-or-later. DarknessClient is a fork of Equicord and Vencord; their licenses and contributor credits are preserved in `LICENSE`, source headers, and plugin metadata.

Client modifications can violate Discord's Terms of Service. Use at your own risk.

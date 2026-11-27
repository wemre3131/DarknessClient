// ==UserScript==
// @name            DarknessClient
// @description     A Discord client mod - Web version
// @version         %version%
// @author          DarknessClient (https://github.com/DarknessClient)
// @namespace       https://github.com/DarknessClient/DarknessClient
// @supportURL      https://github.com/DarknessClient/DarknessClient
// @icon            https://raw.githubusercontent.com/DarknessClient/DarknessClient/refs/heads/main/browser/icon.png
// @license         GPL-3.0
// @match           *://*.discord.com/*
// @grant           GM_xmlhttpRequest
// @grant           unsafeWindow
// @run-at          document-start
// @compatible      chrome Chrome + Tampermonkey or Violentmonkey
// @compatible      firefox Firefox Tampermonkey
// @compatible      opera Opera + Tampermonkey or Violentmonkey
// @compatible      edge Edge + Tampermonkey or Violentmonkey
// @compatible      safari Safari + Tampermonkey or Violentmonkey
// ==/UserScript==


// this UserScript DOES NOT work on Firefox with Violentmonkey or Greasemonkey due to a bug that makes it impossible
// to overwrite stuff on the window on sites that use CSP. Use Tampermonkey or use a chromium based browser
// https://github.com/violentmonkey/violentmonkey/issues/997

// this is a compiled and minified version of DarknessClient. For the source code, visit the GitHub repo

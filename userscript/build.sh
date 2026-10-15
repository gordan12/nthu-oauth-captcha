#!/bin/sh
# Wraps content.js as a userscript for the Userscripts app on iPad and Mac Safari.
# The model loads from jsDelivr instead of the extension bundle.
# Run again after changing content.js.

set -e
cd "$(dirname "$0")/.."

VERSION=$(plutil -extract version raw manifest.json 2>/dev/null || sed -n 's/.*"version": "\(.*\)".*/\1/p' manifest.json)
# The model loads from the release tag of this version, which the release workflow requires to exist.
MODEL=https://cdn.jsdelivr.net/gh/gordan12/nthu-oauth-captcha@v$VERSION/

{
  cat <<EOF
// ==UserScript==
// @name         清大 OAuth 驗證碼自動填入
// @description  在清大校務資訊系統 OAuth 登入頁辨識並填入驗證碼。只作用於 oauth.ccxp.nthu.edu.tw，不會讀取或送出帳號密碼。
// @version      $VERSION
// @match        https://oauth.ccxp.nthu.edu.tw/v1.1/authorize.php*
// @run-at       document-start
// @inject-into  content
// @downloadURL  https://cdn.jsdelivr.net/gh/gordan12/nthu-oauth-captcha@latest/userscript/nthu-oauth-captcha.user.js
// @updateURL    https://cdn.jsdelivr.net/gh/gordan12/nthu-oauth-captcha@latest/userscript/nthu-oauth-captcha.user.js
// ==/UserScript==

// Generated from content.js by userscript/build.sh. Edit content.js instead.

(() => {
const chrome = { runtime: { getURL: (path) => "$MODEL" + path } };

EOF
  cat content.js
  printf '})();\n'
} > userscript/nthu-oauth-captcha.user.js

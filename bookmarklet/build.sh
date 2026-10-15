#!/bin/sh
# Wraps content.js as a script a bookmark can load, for Chrome on Android.
# The model loads from jsDelivr instead of the extension bundle.
# Run again after changing content.js.

set -e
cd "$(dirname "$0")/.."

VERSION=$(plutil -extract version raw manifest.json 2>/dev/null || sed -n 's/.*"version": "\(.*\)".*/\1/p' manifest.json)
# The model loads from the release tag of this version, which the release workflow requires to exist.
MODEL=https://cdn.jsdelivr.net/gh/gordan12/nthu-oauth-captcha@v$VERSION/

{
  cat <<EOF
// Generated from content.js by bookmarklet/build.sh. Edit content.js instead.
// The bookmark in README.md loads the copy at the newest tag on the NTHU OAuth login page.

(() => {
if (window.__nthuOauthCaptcha) return;
if (!location.href.startsWith("https://oauth.ccxp.nthu.edu.tw/v1.1/authorize.php")) {
  alert("請在清大 OAuth 登入頁點這個書籤。");
  return;
}
window.__nthuOauthCaptcha = true;

const chrome = { runtime: { getURL: (path) => "$MODEL" + path } };

EOF
  cat content.js
  printf '})();\n'
} > bookmarklet/nthu-oauth-captcha.js

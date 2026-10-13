#!/bin/sh
# Wraps content.js as a script a bookmark can load, for Chrome on Android.
# TensorFlow.js and the model load from jsDelivr instead of the extension bundle.
# Run again after changing content.js.

set -e
cd "$(dirname "$0")/.."

TFJS=4.2.0
MODEL=https://cdn.jsdelivr.net/gh/gordan12/nthu-oauth-captcha@e94dec5e11529ef4c1a42fa3ccea6e7356152b4c/

{
  cat <<EOF
// Generated from content.js by bookmarklet/build.sh. Edit content.js instead.
// The bookmark in README.md loads this file on the NTHU OAuth login page.

(() => {
if (window.__nthuOauthCaptcha) return;
if (!location.href.startsWith("https://oauth.ccxp.nthu.edu.tw/v1.1/authorize.php")) {
  alert("請在清大 OAuth 登入頁點這個書籤。");
  return;
}
window.__nthuOauthCaptcha = true;

const chrome = { runtime: { getURL: (path) => "$MODEL" + path } };

// content.js reuses this element, so the loading message turns into its status.
const status = document.createElement("div");
status.id = "nthu-captcha-status";
status.style.cssText = "margin-top:4px;font-size:12px;line-height:1.4;color:#0a7a32;";
status.textContent = "正在載入辨識程式…";
(document.getElementById("captcha_block") || document.getElementById("captcha_code"))
  ?.insertAdjacentElement("afterend", status);

const load = (path) =>
  new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@tensorflow/" + path;
    script.onload = resolve;
    script.onerror = () => reject(new Error(path));
    document.head.appendChild(script);
  });

const libraries = typeof tf === "undefined"
  ? load("tfjs-core@$TFJS/dist/tf-core.min.js")
      .then(() => load("tfjs-backend-webgl@$TFJS/dist/tf-backend-webgl.min.js"))
      .then(() => load("tfjs-layers@$TFJS/dist/tf-layers.min.js"))
  : Promise.resolve();

libraries.then(
  () => {
EOF
  cat content.js
  cat <<'EOF'
  },
  (error) => {
    console.warn("[nthu-oauth-captcha]", error);
    window.__nthuOauthCaptcha = false;
    status.style.color = "#a15c00";
    status.textContent = "辨識程式載入失敗，請確認網路後再點一次書籤。";
  }
);
})();
EOF
} > bookmarklet/nthu-oauth-captcha.js

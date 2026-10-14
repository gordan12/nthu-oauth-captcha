// ==UserScript==
// @name         清大 OAuth 驗證碼自動填入
// @description  在清大校務資訊系統 OAuth 登入頁辨識並填入驗證碼。只作用於 oauth.ccxp.nthu.edu.tw，不會讀取或送出帳號密碼。
// @version      1.0.3
// @match        https://oauth.ccxp.nthu.edu.tw/v1.1/authorize.php*
// @run-at       document-start
// @inject-into  content
// @require      https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@4.2.0/dist/tf-core.min.js
// @require      https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@4.2.0/dist/tf-backend-webgl.min.js
// @require      https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-cpu@4.2.0/dist/tf-backend-cpu.min.js
// @require      https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-layers@4.2.0/dist/tf-layers.min.js
// @downloadURL  https://cdn.jsdelivr.net/gh/gordan12/nthu-oauth-captcha@latest/userscript/nthu-oauth-captcha.user.js
// @updateURL    https://cdn.jsdelivr.net/gh/gordan12/nthu-oauth-captcha@latest/userscript/nthu-oauth-captcha.user.js
// ==/UserScript==

// Generated from content.js by userscript/build.sh. Edit content.js instead.

(() => {
const chrome = { runtime: { getURL: (path) => "https://cdn.jsdelivr.net/gh/gordan12/nthu-oauth-captcha@e94dec5e11529ef4c1a42fa3ccea6e7356152b4c/" + path } };

// Fills only the captcha field on a listed NTHU login page.
// Account and password fields are left to the browser's password manager.

const TARGETS = [
  {
    id: "oauth",
    imageId: "captcha_image",
    inputId: "captcha_code",
    width: 150,
    height: 80,
    digits: 4,
    model: "model/model.json",
  },
];

const models = new Map();
const imageReady = new Set();
let requestId = 0;
let inferenceChain = Promise.resolve();

function enqueue(task) {
  const run = inferenceChain.then(task, task);
  inferenceChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

function loadModel(modelPath) {
  const url = chrome.runtime.getURL(modelPath);
  if (!models.has(url)) {
    const pending = tf
      .ready()
      .then(() => tf.loadLayersModel(url))
      .catch((error) => {
        models.delete(url);
        throw error;
      });
    models.set(url, pending);
  }
  return models.get(url);
}

function waitForImage(img, src) {
  if (img.src !== src) return Promise.resolve(false);
  if (img.complete && img.naturalWidth > 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (ok) => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
      resolve(ok && img.src === src);
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);
    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
    if (img.complete) finish(img.naturalWidth > 0);
  });
}

function argmax(scores) {
  let best = 0;
  for (let i = 1; i < scores.length; i += 1) {
    if (scores[i] > scores[best]) best = i;
  }
  return best;
}

async function readCode(source, target) {
  const model = await loadModel(target.model);
  let pixels = tf.browser.fromPixels(source);
  if (pixels.shape[0] !== target.height || pixels.shape[1] !== target.width) {
    const resized = tf.image.resizeBilinear(pixels, [target.height, target.width]);
    pixels.dispose();
    pixels = resized;
  }
  const normalized = tf.div(tf.cast(pixels, "float32"), 255);
  pixels.dispose();
  const batch = tf.expandDims(normalized, 0);
  normalized.dispose();

  const outputs = model.predict(batch);
  batch.dispose();
  const heads = Array.isArray(outputs) ? outputs : [outputs];
  const digits = heads.map((head) => {
    const scores = head.dataSync();
    const digit = argmax(scores);
    head.dispose();
    return String(digit);
  });
  return digits.join("");
}

function blankCanvas(target) {
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, target.width, target.height);
  return canvas;
}

async function warmup(target) {
  const started = performance.now();
  await loadModel(target.model);
  if (imageReady.has(target.id)) {
    console.info(`[nthu-oauth-captcha] warmup skipped after ${Math.round(performance.now() - started)}ms`);
    return;
  }
  await readCode(blankCanvas(target), target);
  console.info(`[nthu-oauth-captcha] warmup ${Math.round(performance.now() - started)}ms`);
}

function setStatus(message, ok, anchor) {
  let status = document.getElementById("nthu-captcha-status");
  if (!status) {
    status = document.createElement("div");
    status.id = "nthu-captcha-status";
    status.style.cssText = "margin-top:4px;font-size:12px;line-height:1.4;";
    anchor?.insertAdjacentElement("afterend", status);
  }
  status.style.color = ok ? "#0a7a32" : "#a15c00";
  status.textContent = message;
}

function fillCaptcha(input, code) {
  // type=number drops leading zeros such as 0123. The server compares the code as text.
  if (input.type === "number") input.type = "text";
  input.setAttribute("inputmode", "numeric");
  input.setAttribute("autocomplete", "off");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, code);
  else input.value = code;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function solve(img, input, target) {
  const src = img.src;
  if (!src) return;
  const ticket = ++requestId;
  const anchor = document.getElementById("captcha_block") || input;
  setStatus("正在辨識驗證碼…", true, anchor);
  const ready = await waitForImage(img, src);
  if (!ready || ticket !== requestId || img.src !== src) return;
  imageReady.add(target.id);

  try {
    const queuedAt = performance.now();
    const code = await enqueue(async () => {
      const started = performance.now();
      const value = await readCode(img, target);
      console.info(`[nthu-oauth-captcha] inference ${Math.round(performance.now() - started)}ms`);
      return value;
    });
    console.info(`[nthu-oauth-captcha] waited ${Math.round(performance.now() - queuedAt)}ms`);
    if (ticket !== requestId || img.src !== src) return;
    if (!new RegExp(`^\\d{${target.digits}}$`).test(code)) {
      setStatus("沒辨識成功，請按驗證碼旁的重新整理。", false, anchor);
      return;
    }
    fillCaptcha(input, code);
    setStatus("驗證碼已填入。確認帳號密碼後按登入。", true, anchor);
  } catch (error) {
    if (ticket !== requestId) return;
    console.warn("[nthu-oauth-captcha]", error);
    setStatus("辨識失敗，請按驗證碼旁的重新整理再試一次。", false, anchor);
  }
}

function watch(target) {
  const img = document.getElementById(target.imageId);
  const input = document.getElementById(target.inputId);
  if (!img || !input) return false;

  const observer = new MutationObserver(() => {
    solve(img, input, target);
  });
  observer.observe(img, { attributes: true, attributeFilter: ["src"] });
  solve(img, input, target);
  return true;
}

function start() {
  for (const target of TARGETS) enqueue(() => warmup(target));

  const boot = () => {
    const pending = TARGETS.filter((target) => !watch(target));
    if (pending.length === 0) return;
    const observer = new MutationObserver(() => {
      for (let i = pending.length - 1; i >= 0; i -= 1) {
        if (watch(pending[i])) pending.splice(i, 1);
      }
      if (pending.length === 0) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.documentElement) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });
}

start();
})();

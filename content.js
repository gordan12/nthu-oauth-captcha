// Fills only #captcha_code on the NTHU OAuth login page.
// Account and password fields are left to the browser's password manager.

const MODEL_URL = chrome.runtime.getURL("model/model.json");
const INPUT_HEIGHT = 80;
const INPUT_WIDTH = 150;

let modelPromise = null;
let requestId = 0;

function loadModel() {
  if (!modelPromise) {
    modelPromise = tf.ready().then(() => tf.loadLayersModel(MODEL_URL));
  }
  return modelPromise;
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

async function recognize(img) {
  const model = await loadModel();
  let pixels = tf.browser.fromPixels(img);
  if (pixels.shape[0] !== INPUT_HEIGHT || pixels.shape[1] !== INPUT_WIDTH) {
    const resized = tf.image.resizeBilinear(pixels, [INPUT_HEIGHT, INPUT_WIDTH]);
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

function setStatus(message, ok) {
  let status = document.getElementById("nthu-captcha-status");
  if (!status) {
    status = document.createElement("div");
    status.id = "nthu-captcha-status";
    status.style.cssText = "margin-top:4px;font-size:12px;line-height:1.4;";
    const anchor = document.getElementById("captcha_block") || document.getElementById("captcha_code");
    anchor?.insertAdjacentElement("afterend", status);
  }
  status.style.color = ok ? "#0a7a32" : "#a15c00";
  status.textContent = message;
}

function fillCaptcha(code) {
  const input = document.getElementById("captcha_code");
  if (!input) return;
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

async function solve(img) {
  const src = img.src;
  if (!src) return;
  const ticket = ++requestId;
  setStatus("正在辨識驗證碼…", true);
  const ready = await waitForImage(img, src);
  if (!ready || ticket !== requestId || img.src !== src) return;

  try {
    const code = await recognize(img);
    if (ticket !== requestId || img.src !== src) return;
    if (!/^\d{4}$/.test(code)) {
      setStatus("沒辨識成功，請按驗證碼旁的重新整理。", false);
      return;
    }
    fillCaptcha(code);
    setStatus("驗證碼已填入。確認帳號密碼後按登入。", true);
  } catch (error) {
    if (ticket !== requestId) return;
    console.warn("[nthu-oauth-captcha]", error);
    setStatus("辨識失敗，請按驗證碼旁的重新整理再試一次。", false);
  }
}

function watch() {
  const img = document.getElementById("captcha_image");
  const input = document.getElementById("captcha_code");
  if (!img || !input) return false;

  const observer = new MutationObserver(() => {
    solve(img);
  });
  observer.observe(img, { attributes: true, attributeFilter: ["src"] });
  solve(img);
  return true;
}

function start() {
  if (watch()) return;
  const observer = new MutationObserver(() => {
    if (watch()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

start();

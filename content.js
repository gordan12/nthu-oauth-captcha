// Fills only the captcha field on a listed NTHU login page.
// Account and password fields are left to the browser's password manager.

const TARGETS = [
  {
    id: "oauth",
    page: /^https:\/\/oauth\.ccxp\.nthu\.edu\.tw\/v1\.1\/authorize\.php/,
    image: "#captcha_image",
    input: "#captcha_code",
    status: "#captcha_block",
    retry: "請按驗證碼旁的重新整理",
    filled: "驗證碼已填入。確認帳號密碼後按登入。",
    network: oauthNetwork,
    width: 150,
    height: 80,
    digits: 4,
    model: "model/oauth.json",
  },
  {
    id: "inquire",
    page: /^https:\/\/www\.ccxp\.nthu\.edu\.tw\/ccxp\/INQUIRE\/(index\.php)?([?#]|$)/,
    image: 'img[src^="auth_img.php"]',
    input: 'input[name="passwd2"]',
    status: 'a[href^="auth_wav/"]',
    retry: "請重新整理頁面",
    filled: "驗證碼已填入。",
    network: inquireNetwork,
    width: 113,
    height: 36,
    digits: 6,
    model: "model/inquire.json",
  },
].filter((target) => target.page.test(location.href));

const models = new Map();
let requestId = 0;

async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}

// Weights sit in a .bin next to the .json, as float32 in the order the .json lists them.
async function fetchModel(url) {
  const meta = await (await fetchOk(url)).json();
  const buffer = await (await fetchOk(url.replace(/\.json$/, ".bin"))).arrayBuffer();
  const weights = {};
  let offset = 0;
  for (const { name, shape } of meta.weights) {
    const size = shape.reduce((a, b) => a * b, 1);
    weights[name] = { shape, data: new Float32Array(buffer, offset * 4, size) };
    offset += size;
  }
  if (offset * 4 !== buffer.byteLength) throw new Error(`weights do not match ${url}`);
  return { ...meta, weights };
}

function loadModel(target) {
  const url = chrome.runtime.getURL(target.model);
  if (!models.has(url)) {
    const pending = fetchModel(url).catch((error) => {
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

// The networks below are ported from ccxpLite (MIT, Hsi). Tensors are
// { shape: [channels, height, width], data } in channel-major order.

function conv2d(input, weight, stride, padding, groups) {
  const [, inH, inW] = input.shape;
  const [outC, perGroup, kH, kW] = weight.shape;
  const outH = Math.floor((inH + 2 * padding - kH) / stride) + 1;
  const outW = Math.floor((inW + 2 * padding - kW) / stride) + 1;
  const outPerGroup = outC / groups;
  const out = new Float32Array(outC * outH * outW);
  let o = 0;
  for (let oc = 0; oc < outC; oc += 1) {
    const icBase = Math.floor(oc / outPerGroup) * perGroup;
    for (let oy = 0; oy < outH; oy += 1) {
      for (let ox = 0; ox < outW; ox += 1) {
        let acc = 0;
        for (let c = 0; c < perGroup; c += 1) {
          for (let ky = 0; ky < kH; ky += 1) {
            const iy = oy * stride - padding + ky;
            if (iy < 0 || iy >= inH) continue;
            for (let kx = 0; kx < kW; kx += 1) {
              const ix = ox * stride - padding + kx;
              if (ix < 0 || ix >= inW) continue;
              acc +=
                input.data[((icBase + c) * inH + iy) * inW + ix] *
                weight.data[((oc * perGroup + c) * kH + ky) * kW + kx];
            }
          }
        }
        out[o] = acc;
        o += 1;
      }
    }
  }
  return { shape: [outC, outH, outW], data: out };
}

function batchNorm(input, model, prefix, relu) {
  const [channels, h, w] = input.shape;
  const gamma = model.weights[`${prefix}.weight`].data;
  const beta = model.weights[`${prefix}.bias`].data;
  const mean = model.weights[`${prefix}.running_mean`].data;
  const variance = model.weights[`${prefix}.running_var`].data;
  const out = new Float32Array(input.data.length);
  for (let c = 0; c < channels; c += 1) {
    const scale = gamma[c] / Math.sqrt(variance[c] + model.eps);
    for (let i = c * h * w; i < (c + 1) * h * w; i += 1) {
      const value = (input.data[i] - mean[c]) * scale + beta[c];
      out[i] = relu ? Math.max(value, 0) : value;
    }
  }
  return { shape: input.shape, data: out };
}

// Depthwise 3x3 convolution, then pointwise 1x1 convolution, each with batch norm and ReLU.
// names lists the weight prefixes: depthwise, its norm, pointwise, its norm.
function separableBlock(input, model, names, stride) {
  let x = conv2d(input, model.weights[`${names[0]}.weight`], stride, 1, input.shape[0]);
  x = batchNorm(x, model, names[1], true);
  x = conv2d(x, model.weights[`${names[2]}.weight`], 1, 0, 1);
  return batchNorm(x, model, names[3], true);
}

function toPlanes(rgba, width, height, cropRight) {
  const used = width - cropRight;
  const data = new Float32Array(3 * height * used);
  let k = 0;
  for (let c = 0; c < 3; c += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < used; x += 1) {
        data[k] = rgba[(y * width + x) * 4 + c] / 255;
        k += 1;
      }
    }
  }
  return { shape: [3, height, used], data };
}

// Each digit reads the average of its own vertical band of the feature map.
function inquireNetwork(model, rgba, width, height) {
  const block = (x, prefix, stride) =>
    separableBlock(x, model, [`${prefix}.0`, `${prefix}.1`, `${prefix}.3`, `${prefix}.4`], stride);
  let x = conv2d(toPlanes(rgba, width, height, model.cropRight), model.weights["features.0.weight"], 2, 1, 1);
  x = batchNorm(x, model, "features.1", true);
  x = block(x, "features.3.block", 1);
  x = block(x, "features.4.block", 2);
  x = block(x, "features.5.block", 1);

  const [channels, h, w] = x.shape;
  let code = "";
  for (let d = 0; d < model.digits; d += 1) {
    const x0 = Math.floor((d * w) / model.digits);
    const x1 = Math.ceil(((d + 1) * w) / model.digits);
    const head = model.weights[`heads.${d}.weight`].data;
    const scores = Float32Array.from(model.weights[`heads.${d}.bias`].data);
    for (let c = 0; c < channels; c += 1) {
      let total = 0;
      for (let y = 0; y < h; y += 1) {
        for (let xx = x0; xx < x1; xx += 1) total += x.data[(c * h + y) * w + xx];
      }
      const mean = total / (h * (x1 - x0));
      for (let digit = 0; digit < scores.length; digit += 1) scores[digit] += head[digit * channels + c] * mean;
    }
    code += String(argmax(scores));
  }
  return code;
}

// Residual blocks, then each digit attends over every position of the feature map.
function oauthNetwork(model, rgba, width, height) {
  const residual = (input, prefix, stride) => {
    const names = (i) => ["depthwise", "depthwise_bn", "pointwise", "pointwise_bn"].map((n) => `${prefix}.block.${i}.${n}`);
    let x = separableBlock(input, model, names(0), stride);
    x = separableBlock(x, model, names(1), 1);
    let shortcut = input;
    if (model.weights[`${prefix}.shortcut.0.weight`]) {
      shortcut = conv2d(input, model.weights[`${prefix}.shortcut.0.weight`], stride, 0, 1);
      shortcut = batchNorm(shortcut, model, `${prefix}.shortcut.1`, false);
    }
    for (let i = 0; i < x.data.length; i += 1) x.data[i] = Math.max(x.data[i] + shortcut.data[i], 0);
    return x;
  };
  let x = conv2d(toPlanes(rgba, width, height, 0), model.weights["stem.0.weight"], 2, 1, 1);
  x = batchNorm(x, model, "stem.1", true);
  x = residual(x, "backbone.0", 1);
  x = residual(x, "backbone.1", 2);
  x = residual(x, "backbone.2", 2);
  x = residual(x, "backbone.3", 2);

  const [channels, h, w] = x.shape;
  const position = model.weights.position.data;
  const tokens = [];
  for (let t = 0; t < h * w; t += 1) {
    const token = new Float32Array(channels);
    for (let c = 0; c < channels; c += 1) token[c] = x.data[c * h * w + t] + position[t * channels + c];
    tokens.push(token);
  }
  const proj = model.weights["attention_head.feature_proj.weight"];
  const projected = tokens.map((token) => {
    const out = new Float32Array(proj.shape[0]);
    for (let i = 0; i < out.length; i += 1) {
      let acc = 0;
      for (let c = 0; c < channels; c += 1) acc += proj.data[i * channels + c] * token[c];
      out[i] = acc;
    }
    return out;
  });
  const query = model.weights["attention_head.query"];
  const queryWidth = query.shape[1];
  let code = "";
  for (let d = 0; d < model.digits; d += 1) {
    const scores = projected.map((p) => {
      let score = 0;
      for (let c = 0; c < queryWidth; c += 1) score += p[c] * query.data[d * queryWidth + c];
      return score;
    });
    const top = Math.max(...scores);
    const weights = scores.map((score) => Math.exp(score - top));
    const total = weights.reduce((a, b) => a + b, 0);
    const pooled = new Float32Array(channels);
    tokens.forEach((token, t) => {
      for (let c = 0; c < channels; c += 1) pooled[c] += token[c] * (weights[t] / total);
    });
    const head = model.weights[`attention_head.classifiers.${d}.weight`].data;
    const logits = Float32Array.from(model.weights[`attention_head.classifiers.${d}.bias`].data);
    for (let digit = 0; digit < logits.length; digit += 1) {
      let acc = logits[digit];
      for (let c = 0; c < channels; c += 1) acc += head[digit * channels + c] * pooled[c];
      logits[digit] = acc;
    }
    code += String(argmax(logits));
  }
  return code;
}

async function readCode(source, target) {
  const model = await loadModel(target);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0, target.width, target.height);
  const { data } = context.getImageData(0, 0, target.width, target.height);
  return target.network(model, data, target.width, target.height);
}

function setStatus(message, ok, anchor) {
  let status = document.getElementById("nthu-captcha-status");
  if (!status) {
    status = document.createElement("div");
    status.id = "nthu-captcha-status";
    status.style.cssText = "margin-top:4px;font-size:12px;line-height:1.4;";
  }
  // The preferred anchor may be parsed after the first message, so move the status once it exists.
  if (anchor && status.previousElementSibling !== anchor) anchor.insertAdjacentElement("afterend", status);
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
  const anchorFor = () => document.querySelector(target.status) || input;
  setStatus("正在辨識驗證碼…", true, anchorFor());
  const ready = await waitForImage(img, src);
  if (!ready || ticket !== requestId || img.src !== src) return;

  try {
    const started = performance.now();
    const code = await readCode(img, target);
    console.info(`[nthu-oauth-captcha] recognized in ${Math.round(performance.now() - started)}ms`);
    if (ticket !== requestId || img.src !== src) return;
    if (!new RegExp(`^\\d{${target.digits}}$`).test(code)) {
      setStatus(`沒辨識成功，${target.retry}。`, false, anchorFor());
      return;
    }
    fillCaptcha(input, code);
    setStatus(target.filled, true, anchorFor());
  } catch (error) {
    if (ticket !== requestId) return;
    console.warn("[nthu-oauth-captcha]", error);
    setStatus(`辨識失敗，${target.retry}再試一次。`, false, anchorFor());
  }
}

function watch(target) {
  const img = document.querySelector(target.image);
  const input = document.querySelector(target.input);
  if (!img || !input) return false;

  const observer = new MutationObserver(() => {
    solve(img, input, target);
  });
  observer.observe(img, { attributes: true, attributeFilter: ["src"] });
  solve(img, input, target);
  return true;
}

function start() {
  // Start downloading the model while the page is still loading. Errors show up when solving.
  for (const target of TARGETS) loadModel(target).catch(() => {});

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

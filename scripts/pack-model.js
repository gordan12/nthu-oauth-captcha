// Converts a ccxpLite model file (src/oauth/decaptcha.model.ts or
// src/login/auth/decaptcha.model.ts, or the built .js) into the files content.js loads:
// <prefix>.json with the settings and each weight's name and shape, and
// <prefix>.bin with the weights as little-endian float32 in the same order.
//
// Usage: node scripts/pack-model.js <decaptcha.model.ts> model/oauth

const fs = require("fs");

const [source, prefix] = process.argv.slice(2);
if (!source || !prefix) {
  console.error("Usage: node scripts/pack-model.js <decaptcha.model.ts> <output prefix>");
  process.exit(1);
}

const text = fs.readFileSync(source, "utf8");
const match = text.match(/'(\{.*\})'/s);
if (!match) throw new Error(`no serialized model in ${source}`);
const { tensors, ...settings } = JSON.parse(match[1]);

const weights = [];
const chunks = [];
for (const [name, tensor] of Object.entries(tensors)) {
  const size = tensor.shape.reduce((a, b) => a * b, 1);
  if (size !== tensor.data.length) throw new Error(`${name}: shape does not match data`);
  weights.push({ name, shape: tensor.shape });
  chunks.push(Buffer.from(Float32Array.from(tensor.data).buffer));
}

fs.writeFileSync(`${prefix}.json`, JSON.stringify({ ...settings, weights }) + "\n");
fs.writeFileSync(`${prefix}.bin`, Buffer.concat(chunks));
console.log(`${prefix}: ${weights.length} weights, ${chunks.reduce((n, c) => n + c.length, 0)} bytes`);

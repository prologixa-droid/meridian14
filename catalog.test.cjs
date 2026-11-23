const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'products.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${source}\n;globalThis.catalog = cosmeticProducts; globalThis.renderImage = cosmeticImageSvg; globalThis.defects = catalogDefects;`, sandbox);
const products = sandbox.catalog;

test('catalog still contains 100 complete cosmetic records', () => {
  assert.equal(products.length, 100);
  assert.equal(new Set(products.map(p => p.sku)).size, 100);
  assert.equal(new Set(products.map(p => p.family)).size, 15);
  for (const p of products) {
    assert.match(p.sku, /^SKU-C\d{5}$/);
    assert.ok(p.name && p.description && p.family && p.kind);
    assert.ok(p.description.length >= 60, `${p.sku} has a meaningful product description`);
  }
});

test('all 100 products have unique replacement descriptions', () => {
  const descriptions = products.map(p => p.description.trim());
  assert.equal(new Set(descriptions).size, 100);
  assert.ok(descriptions.every(text => text.length >= 60));
});

test('the new image renderer produces 100 distinct SKU-specific illustrations', () => {
  const svgs = products.map(p => sandbox.renderImage(p));
  assert.equal(svgs.length, 100);
  assert.equal(new Set(svgs).size, 100);
  for (let i = 0; i < svgs.length; i++) {
    assert.match(svgs[i], /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svgs[i], new RegExp(products[i].sku));
    assert.match(svgs[i], /<defs>/);
    assert.match(svgs[i], /editorial cosmetic still life/);
  }
});

test('seeded quality defects retain source-backed before and reference values', () => {
  assert.equal(sandbox.defects.length, 22);
  const affected = products.filter(p => p.qualityIssue);
  assert.equal(affected.length, 22);
  for (const p of affected) {
    assert.ok(p.sourceNote.includes(String(p.qualityReference.value)));
    assert.equal(p.qualityIssue.field, p.qualityReference.field);
    assert.notEqual(p[p.qualityIssue.field], p.qualityReference.value);
  }
});

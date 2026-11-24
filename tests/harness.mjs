import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;

function check(name, condition, detail = '') {
  const ok = !!condition;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

function baseSettings() {
  return {
    enabled: true,
    ignoreTyping: true,
    showToasts: true,
    saveAs: false,
    generateSelector: '',
    imageSelector: '',
    promptSelector: '',
    bindings: {
      focus: { code: 'KeyC', label: 'C', enabled: true, mods: { ctrl: false, alt: false, shift: false, meta: false } },
      generate: { code: 'KeyZ', label: 'Z', enabled: true, mods: { ctrl: false, alt: false, shift: false, meta: false } },
      save: { code: 'KeyX', label: 'X', enabled: true, mods: { ctrl: false, alt: false, shift: false, meta: false } },
      saveAll: { code: '', label: '', enabled: false, mods: { ctrl: false, alt: false, shift: false, meta: false } }
    }
  };
}

class ClassList {
  constructor() { this.items = new Set(); }
  add(...xs) { xs.forEach((x) => this.items.add(x)); }
  remove(...xs) { xs.forEach((x) => this.items.delete(x)); }
  toggle(x, force) {
    const on = force === undefined ? !this.items.has(x) : !!force;
    if (on) this.items.add(x); else this.items.delete(x);
    return on;
  }
  contains(x) { return this.items.has(x); }
}

class El {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.classList = new ClassList();
    this.style = {};
    this.attrs = {};
    this.dataset = {};
    this._text = '';
    this._src = '';
    this.naturalWidth = 0;
    this.disabled = false;
    this.clicks = 0;
    this.removed = false;
    this.isConnected = true;
    this.id = '';
    this.className = '';
  }
  get textContent() { return this._text; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get innerText() { return this._text; }
  get src() { return this._src; }
  set src(value) { this._src = String(value); }
  get currentSrc() { return this._src; }
  getAttribute(key) { return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null; }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  remove() { this.removed = true; }
  focus() { this.focused = true; if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  get parentElement() { return this.parent || null; }
  click() { this.clicks += 1; }
  getBoundingClientRect() { return { width: 100, height: 30, top: 0, left: 0 }; }
  closest() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
}

// Manifest and assets are checked before any behaviour test.
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
check('manifest is MV3 with a unique gecko id', manifest.manifest_version === 3 &&
  manifest.browser_specific_settings?.gecko?.id === 'novelai-hotkeys@apoapostolov');
check('manifest targets the image route', manifest.content_scripts[0].matches.some((m) => m.includes('/image')));
check('all four icons exist', [16, 32, 48, 128].every((s) =>
  fs.existsSync(path.join(ROOT, 'assets', `icon-${s}.png`))));

const buttons = [];
const images = [];
const created = [];
const body = new El('body', null);
const html = new El('html', null);
const customNodes = new Map();
const fields = [];

const document = {
  body,
  documentElement: html,
  defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) },
  createElement(tag) {
    const element = new El(tag, document);
    if (String(tag).toLowerCase() === 'canvas') {
      // A stub 2d context: pixels come from the image the extension draws, and
      // an image without pixels stands in for a cross-origin canvas taint.
      const context = {
        drawImage(img) { context.image = img; },
        getImageData() {
          if (!context.image || !context.image._pixels) throw new Error('tainted canvas');
          return { data: context.image._pixels };
        }
      };
      element.getContext = () => context;
    }
    created.push(element);
    return element;
  },
  getElementById(id) {
    if (id === 'nai-hk-toast') return body.children.find((child) => child.id === id) || null;
    return null;
  },
  querySelector(selector) {
    return customNodes.has(selector) ? customNodes.get(selector)[0] || null : null;
  },
  querySelectorAll(selector) {
    if (selector.startsWith('button, [role')) return buttons;
    if (selector === 'img') return images;
    if (selector.startsWith('textarea,')) return fields;
    return customNodes.get(selector) || [];
  },
  addEventListener() {}
};
body.ownerDocument = document;
html.ownerDocument = document;

const generateButton = new El('button', document);
generateButton._text = 'Generate 1 Image';
buttons.push(generateButton);
const historyButton = new El('button', document);
historyButton._text = 'History';
buttons.push(historyButton);

const resultImage = new El('img', document);
resultImage.src = 'data:image/png;base64,AAAA';
resultImage.naturalWidth = 1024;
images.push(resultImage);
const siteIcon = new El('img', document);
siteIcon.src = 'https://novelai.net/icons/lang_en.svg';
images.push(siteIcon);

const promptField = new El('textarea', document);
promptField.attrs.placeholder = 'Prompt';
fields.push(promptField);
const undesiredField = new El('textarea', document);
undesiredField.attrs.placeholder = 'Undesired Content';
fields.push(undesiredField);

const listeners = {};
const windowStub = {
  addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }
};

let currentSettings = baseSettings();
const changeListeners = [];
const sent = [];
const stored = [];
const browser = {
  storage: {
    local: {
      get: async () => ({ settings: structuredClone(currentSettings) }),
      set: async (value) => { stored.push(structuredClone(value)); }
    },
    onChanged: { addListener(fn) { changeListeners.push(fn); } }
  },
  runtime: { sendMessage: async (message) => { sent.push(message); return { ok: true }; } }
};

const context = {
  window: windowStub,
  document,
  browser,
  console,
  MutationObserver: class { constructor(callback) { this.callback = callback; } observe() {} },
  setTimeout: () => 1,
  clearTimeout: () => {}
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8'), context, { filename: 'content.js' });
await new Promise((resolve) => setImmediate(resolve));

function fire(code, key, target = body, extra = {}) {
  const event = {
    code, key, target,
    ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
    isComposing: false, repeat: false, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; },
    ...extra
  };
  for (const fn of listeners.keydown || []) fn(event);
  return event;
}

function applySettings(next) {
  currentSettings = next;
  for (const fn of changeListeners) fn({ settings: { newValue: next } });
}

function anchorDownloads() {
  return created.filter((el) => el.tagName === 'A' &&
    /^novelai-\d{8}-\d{6}(?:-\d+)?\.(?:png|webp|jpg)$/.test(el.download));
}

function toastText() {
  const box = body.children.find((child) => child.id === 'nai-hk-toast');
  return box ? String(box.textContent) : '';
}

function ledgerWrites() {
  return stored.filter((value) => Array.isArray(value.downloadHistory));
}

const zEvent = fire('KeyZ', 'z');
check('Z clicks the Generate button', generateButton.clicks === 1, `clicks=${generateButton.clicks}`);
check('Z is consumed by the extension', zEvent.defaultPrevented && zEvent.stopped);
check('unrelated button is untouched', historyButton.clicks === 0);

fire('KeyX', 'x');
await new Promise((resolve) => setImmediate(resolve));
check('X creates one image download', anchorDownloads().length === 1 && anchorDownloads()[0].clicks === 1,
  `anchors=${anchorDownloads().length}`);

const textarea = new El('textarea', document);
const typingEvent = fire('KeyZ', 'z', textarea);
check('typing in a prompt does not generate', generateButton.clicks === 1 && !typingEvent.defaultPrevented);

const rebound = baseSettings();
rebound.bindings.generate = {
  code: 'KeyJ', label: 'J', enabled: true,
  mods: { ctrl: true, alt: false, shift: false, meta: false }
};
applySettings(rebound);
fire('KeyZ', 'z');
check('old key stops working after a rebind', generateButton.clicks === 1);
const jEvent = fire('KeyJ', 'j', body, { ctrlKey: true });
check('custom Ctrl+J generates', generateButton.clicks === 2 && jEvent.defaultPrevented);

const disabled = baseSettings();
disabled.enabled = false;
applySettings(disabled);
fire('KeyJ', 'j', body, { ctrlKey: true });
check('master toggle blocks every shortcut', generateButton.clicks === 2);

const batch = baseSettings();
batch.bindings.saveAll = {
  code: 'KeyK', label: 'K', enabled: true,
  mods: { ctrl: false, alt: false, shift: false, meta: false }
};
const secondImage = new El('img', document);
secondImage.src = 'data:image/webp;base64,BBBB';
secondImage.naturalWidth = 800;
images.push(secondImage);
applySettings(batch);
const beforeBatch = anchorDownloads().length;
fire('KeyK', 'k');
await new Promise((resolve) => setImmediate(resolve));
check('save batch adds the image that was not saved yet', anchorDownloads().length === beforeBatch + 1,
  `delta=${anchorDownloads().length - beforeBatch}`);

const beforeRepeat = anchorDownloads().length;
fire('KeyK', 'k');
await new Promise((resolve) => setImmediate(resolve));
check('save batch skips images that are already downloaded',
  anchorDownloads().length === beforeRepeat, `delta=${anchorDownloads().length - beforeRepeat}`);
check('the skip is reported to the user', /already downloaded/i.test(toastText()), toastText());

const repeatX = anchorDownloads().length;
fire('KeyX', 'x');
await new Promise((resolve) => setImmediate(resolve));
check('pressing the save key twice keeps one copy on disk',
  anchorDownloads().length === repeatX, `anchors=${anchorDownloads().length}`);
check('the ledger records the saved file', ledgerWrites().some((value) =>
  value.downloadHistory.some((entry) => /novelai-\d{8}-\d{6}\.(?:png|webp|jpg)/.test(entry.filename))),
  `writes=${ledgerWrites().length}`);

const remoteImage = new El('img', document);
remoteImage.src = 'https://static.novelai.net/generated/123.png';
remoteImage.naturalWidth = 1024;
images.push(remoteImage);
applySettings(baseSettings());
fire('KeyX', 'x');
await new Promise((resolve) => setImmediate(resolve));
check('remote image goes to the download bridge', sent.length === 1 &&
  sent[0].type === 'nai-download' && sent[0].url.includes('static.novelai.net'),
  `messages=${sent.length}`);

fire('KeyX', 'x');
await new Promise((resolve) => setImmediate(resolve));
check('a remote image is not bridged twice', sent.length === 1, `messages=${sent.length}`);

const freshImage = new El('img', document);
freshImage.src = 'https://static.novelai.net/generated/456.png';
freshImage.naturalWidth = 1216;
images.push(freshImage);
fire('KeyX', 'x');
await new Promise((resolve) => setImmediate(resolve));
check('an image that was not saved yet still downloads', sent.length === 2 &&
  sent[1].url.includes('456.png'), `messages=${sent.length}`);

// A regenerated blob URL for the same pixels must not download a second copy.
const blobImage = new El('img', document);
blobImage.src = 'blob:https://novelai.net/11111111';
blobImage.naturalWidth = 1600;
blobImage.naturalHeight = 900;
blobImage._pixels = new Uint8ClampedArray([12, 34, 56, 255]);
images.push(blobImage);
const beforeBlob = anchorDownloads().length;
fire('KeyX', 'x');
await new Promise((resolve) => setImmediate(resolve));
check('a blob image downloads once', anchorDownloads().length === beforeBlob + 1,
  `delta=${anchorDownloads().length - beforeBlob}`);

const blobTwin = new El('img', document);
blobTwin.src = 'blob:https://novelai.net/22222222';
blobTwin.naturalWidth = 1600;
blobTwin.naturalHeight = 900;
blobTwin._pixels = new Uint8ClampedArray([12, 34, 56, 255]);
images.push(blobTwin);
const beforeTwin = anchorDownloads().length;
fire('KeyX', 'x');
await new Promise((resolve) => setImmediate(resolve));
check('the same pixels under a fresh blob URL are skipped',
  anchorDownloads().length === beforeTwin, `delta=${anchorDownloads().length - beforeTwin}`);

const differentPixels = new El('img', document);
differentPixels.src = 'blob:https://novelai.net/33333333';
differentPixels.naturalWidth = 1600;
differentPixels.naturalHeight = 900;
differentPixels._pixels = new Uint8ClampedArray([12, 34, 57, 255]);
images.push(differentPixels);
const beforeDifferent = anchorDownloads().length;
fire('KeyX', 'x');
await new Promise((resolve) => setImmediate(resolve));
check('different pixels still download', anchorDownloads().length === beforeDifferent + 1,
  `delta=${anchorDownloads().length - beforeDifferent}`);

// Custom selector overrides auto-detection.
const customButton = new El('button', document);
customButton._text = 'Make art';
customNodes.set('#go', [customButton]);
const customSettings = baseSettings();
customSettings.generateSelector = '#go';
applySettings(customSettings);
fire('KeyZ', 'z');
check('custom selector overrides text detection', customButton.clicks === 1 && generateButton.clicks === 2);

// Prompt focus action.
fire('KeyC', 'c');
check('C focuses the prompt field', document.activeElement === promptField && promptField.focused === true);

document.activeElement = null;
promptField.focused = false;
fire('KeyC', 'c', undesiredField);
check('typing guard keeps C from stealing focus', promptField.focused !== true && document.activeElement === null);

const customPrompt = new El('textarea', document);
customPrompt.attrs.placeholder = 'Something else';
customNodes.set('#prompt', [customPrompt]);
const promptSettings = baseSettings();
promptSettings.promptSelector = '#prompt';
applySettings(promptSettings);
fire('KeyC', 'c');
check('custom prompt selector overrides auto-detection',
  customPrompt.focused === true && document.activeElement === customPrompt);

// Background download bridge.
const bgCalls = [];
const bgListeners = [];
const backgroundApi = {
  runtime: { onMessage: { addListener(fn) { bgListeners.push(fn); } } },
  downloads: { download: async (options) => { bgCalls.push(options); return 42; } }
};
const backgroundContext = { browser: backgroundApi, console };
backgroundContext.globalThis = backgroundContext;
vm.createContext(backgroundContext);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8'), backgroundContext,
  { filename: 'background.js' });
const bgResult = await bgListeners[0]({
  type: 'nai-download', url: 'https://static.novelai.net/x.png', filename: 'novelai-x.png', saveAs: true
});
check('background downloads with uniquify', bgResult.ok === true && bgCalls.length === 1 &&
  bgCalls[0].conflictAction === 'uniquify' && bgCalls[0].saveAs === true);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

test('site BGM waits for audio, then plays two tracks in a loop and can be turned off', async () => {
  const config = fs.readFileSync(path.join(root, 'assets/site-bgm-config.js'), 'utf8');
  const code = fs.readFileSync(path.join(root, 'assets/site-bgm.js'), 'utf8');
  const listeners = new Map();
  const elements = Object.fromEntries(['#site-bgm-toggle', '#site-bgm-action', '#site-bgm-label'].map((key) => [key, {
    textContent: '', disabled: false, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { listeners.set(`button:${name}`, callback); }
  }]));
  const player = {
    classList: { add() {}, toggle() {} },
    setAttribute() {},
    querySelector(key) { return elements[key]; }
  };
  const audioEvents = new Map();
  class FakeAudio {
    constructor() { this.paused = true; this.currentTime = 0; FakeAudio.instance = this; }
    addEventListener(name, callback) { audioEvents.set(name, callback); }
    removeEventListener(name) { audioEvents.delete(name); }
    async play() { this.paused = false; }
    pause() { this.paused = true; }
  }
  const memory = () => {
    const values = new Map();
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  };
  const context = {
    window: { addEventListener() {} },
    document: { createElement: () => player, body: { append() {} } },
    localStorage: memory(), sessionStorage: memory(), Audio: FakeAudio
  };
  vm.createContext(context);
  vm.runInContext(config, context);
  assert.equal(context.window.TRAVEL_SITE_BGM_TRACKS.length, 2);
  assert(context.window.TRAVEL_SITE_BGM_TRACKS.every((track) => !track.audioUrl));
  context.window.TRAVEL_SITE_BGM_TRACKS[0].audioUrl = './first.mp3';
  context.window.TRAVEL_SITE_BGM_TRACKS[1].audioUrl = './second.mp3';
  vm.runInContext(code, context);
  const audio = FakeAudio.instance;
  assert.equal(audio.src, './first.mp3');
  listeners.get('button:click')();
  await Promise.resolve();
  assert.equal(audio.paused, false);
  audioEvents.get('ended')();
  await Promise.resolve();
  assert.equal(audio.src, './second.mp3');
  audioEvents.get('ended')();
  await Promise.resolve();
  assert.equal(audio.src, './first.mp3');
  listeners.get('button:click')();
  assert.equal(audio.paused, true);
  assert.equal(context.localStorage.getItem('sehuri.siteBgm.enabled'), '0');
});

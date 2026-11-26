'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, 'public/assets/js/exam-portal.js'), 'utf8');

function makeElement() {
  return {
    hidden: false, className: '', textContent: '', value: '', disabled: false,
    attrs: {}, listeners: {},
    addEventListener(name, fn) { this.listeners[name] = fn; },
    setAttribute(name, value) { this.attrs[name] = value; },
    querySelector(selector) {
      if (!this.children) this.children = {};
      if (!this.children[selector]) this.children[selector] = makeElement();
      return this.children[selector];
    }
  };
}

async function runScenario({ healthStatus, healthContentType }) {
  const root = makeElement();
  const nodes = {};
  const document = {
    getElementById(id) { if (id === 'examApp') return root; return nodes[id] || (nodes[id] = makeElement()); },
    querySelectorAll() { return []; }
  };
  Object.defineProperty(root, 'innerHTML', {
    get() { return this._html || ''; },
    set(value) {
      this._html = value;
      for (const id of ['portalConnectionStatus', 'loginMessage', 'examUsername', 'examPassword', 'loginForm', 'togglePassword']) {
        if (value.includes(`id="${id}"`)) nodes[id] = makeElement();
      }
    }
  });
  const window = {
    location: { search: '?course=korean', href: 'https://example.test/mock-test.html?course=korean' },
    clearInterval() {}, setInterval() { return 1; },
    history: { replaceState() {} }, confirm() { return true; }
  };
  const fetch = async url => {
    const isHealth = url === '/api/health';
    const status = isHealth ? healthStatus : 401;
    const contentType = isHealth ? healthContentType : 'application/json';
    return {
      ok: status >= 200 && status < 300, status,
      headers: { get() { return contentType; } },
      async json() { return isHealth ? { status: 'ok' } : { error: 'Please sign in to continue.' }; }
    };
  };
  vm.runInNewContext(source, {
    document, window, fetch, URLSearchParams, FormData: class {},
    Date, Math, String, Number, Object, Array, Promise, Error, setTimeout, clearTimeout
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  return { html: root._html, message: nodes.loginMessage && nodes.loginMessage.textContent, status: nodes.portalConnectionStatus && nodes.portalConnectionStatus.className };
}

(async () => {
  const online = await runScenario({ healthStatus: 200, healthContentType: 'application/json' });
  for (const field of ['id="examUsername"', 'id="examPassword"', 'id="loginForm"', 'Admin Login']) {
    if (!online.html.includes(field)) throw new Error(`Online login page missing ${field}`);
  }
  console.log('PASS: username and password login page renders when secure API is online.');

  const offline = await runScenario({ healthStatus: 404, healthContentType: 'text/html' });
  for (const field of ['id="examUsername"', 'id="examPassword"', 'id="loginForm"', 'Admin Login']) {
    if (!offline.html.includes(field)) throw new Error(`Offline login page missing ${field}`);
  }
  if (!offline.message || !offline.message.includes('Node.js + PostgreSQL')) throw new Error('Offline status warning is missing.');
  if (!String(offline.status).includes('offline')) throw new Error('Offline portal state is not shown.');
  console.log('PASS: login form remains visible when backend is missing, with a clear deployment warning.');
})();

import React from 'react';
import ReactDOM from 'react-dom/client';

// Emergency diagnostics: a crash during boot must never be a silent white
// screen. Deliberately outside the theme/token system — this has to work
// even when the CSS or the database didn't.
function showFatal(msg) {
  let el = document.getElementById('fatal-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatal-error';
    el.style.cssText =
      'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#7a2f2f;color:#fff;' +
      'font:13px/1.4 -apple-system,system-ui,sans-serif;padding:10px 14px;white-space:pre-wrap;';
    document.body.appendChild(el);
  }
  el.textContent = `Something broke — screenshot this:\n${msg}`;
}
window.addEventListener('error', (e) => showFatal(e.message || String(e.error)));
window.addEventListener('unhandledrejection', (e) =>
  showFatal(String(e.reason?.stack || e.reason?.message || e.reason))
);
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { initTapRipples } from './fx.js';
import { watchSystemTheme } from './theme.js';

import '@fontsource/quicksand/500.css';
import '@fontsource/quicksand/700.css';
import '@fontsource/nunito-sans/400.css';
import '@fontsource/nunito-sans/600.css';
import '@fontsource/nunito-sans/700.css';
import './themes/_tokens.css';
import './themes/paper.css';
import './themes/dark.css';
import './themes/mono.css';
import './styles/base.css';

initTapRipples();
watchSystemTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

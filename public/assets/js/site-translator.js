/* Hello EPS multilingual site translator. English is the source/default language. */
(function () {
  if (document.getElementById('hello-eps-translator')) return;

  var wrapper = document.createElement('div');
  wrapper.id = 'hello-eps-translator';
  wrapper.className = 'hello-eps-translator';
  wrapper.setAttribute('aria-label', 'Website language selector');
  wrapper.innerHTML = '<span class="hello-eps-language-icon" aria-hidden="true">文</span><span class="hello-eps-language-label">Language</span><div id="google_translate_element"></div>';
  document.body.appendChild(wrapper);

  var style = document.createElement('style');
  style.textContent = `
    .hello-eps-translator{position:fixed;right:16px;top:88px;z-index:10000;display:flex;align-items:center;gap:8px;padding:7px 11px;background:#fff;border:1px solid #e5eaf2;border-radius:999px;box-shadow:0 8px 24px rgba(16,24,40,.14);font:600 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;color:#172033;max-width:calc(100vw - 24px)}
    .hello-eps-language-icon{display:grid;place-items:center;width:23px;height:23px;border-radius:50%;background:#fff0f0;color:#d71920;font-size:14px;font-weight:800;flex:0 0 auto}
    .hello-eps-language-label{white-space:nowrap}
    #google_translate_element{min-width:100px;max-width:150px;overflow:hidden}
    #google_translate_element .goog-te-gadget{font:600 12px system-ui,sans-serif!important;color:#344054!important;white-space:nowrap}
    #google_translate_element .goog-te-gadget span{display:none!important}
    #google_translate_element .goog-te-combo{max-width:145px;margin:0!important;padding:5px 22px 5px 7px;border:1px solid #d9e0ea;border-radius:8px;background:#fff;color:#172033;font:600 12px system-ui,sans-serif;outline:none;cursor:pointer}
    #google_translate_element .goog-te-combo:focus{border-color:#d71920;box-shadow:0 0 0 3px rgba(215,25,32,.12)}
    .goog-te-banner-frame.skiptranslate{display:none!important}body{top:0!important}
    @media(max-width:600px){.hello-eps-translator{top:auto;bottom:76px;right:10px;padding:6px 8px;gap:6px}.hello-eps-language-label{display:none}#google_translate_element{min-width:105px}}
  `;
  document.head.appendChild(style);

  window.googleTranslateElementInit = function () {
    if (window.google && window.google.translate) {
      new window.google.translate.TranslateElement({
        pageLanguage: 'en',
        includedLanguages: 'en,ne,hi,ko,ja,zh-CN,ar,fr,es,de',
        autoDisplay: false,
        layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE
      }, 'google_translate_element');
    }
  };

  var script = document.createElement('script');
  script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  script.async = true;
  script.onerror = function () {
    var select = document.getElementById('google_translate_element');
    if (select) select.textContent = 'Translation unavailable offline';
  };
  document.head.appendChild(script);
})();

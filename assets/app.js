/* ==========================================================================
   Image Media News — offline site edit engine
   Everything persists to localStorage on this machine/browser only.
   No server, no accounts — this runs entirely from the local files.

   Multi-language: content and UI chrome are translated on the fly from
   window.IM_I18N (assets/i18n.js). Language is auto-detected from the
   browser on first visit, then remembered per-browser; edits made while a
   given language is active are saved for that language only.
   ========================================================================== */
(function(){
  "use strict";

  var PREFIX = "at_";
  var LANG_KEY = "im_lang";
  var GH_TOKEN_KEY = "im_gh_token";

  /* ---------------- live publish (GitHub) ----------------
     When this site is opened from its GitHub Pages URL, image
     uploads are committed straight to the repo (images/ folder +
     the page's own HTML file), so every visitor sees the new photo
     — not just this browser. Everything else (text/links/cards)
     stays local-only by design; real article text is authored and
     published separately. */
  var GH_OWNER = "ImageMedia2026";
  var GH_REPO = "imagemedia-news";
  var GH_BRANCH = "main";
  var LIVE = /\.github\.io$/.test(location.hostname);

  var I18N = window.IM_I18N || { supported: ["en"], "default": "en", content: {}, chrome: {} };

  function detectLang(){
    var stored = null;
    try { stored = localStorage.getItem(LANG_KEY); } catch(e){ stored = null; }
    if(stored && I18N.supported.indexOf(stored) !== -1) return stored;
    var raw = (navigator.language || navigator.userLanguage || I18N["default"] || "en") + "";
    var two = raw.toLowerCase().slice(0, 2);
    return I18N.supported.indexOf(two) !== -1 ? two : I18N["default"];
  }

  var currentLang = detectLang();

  function T(chromeKey){
    var entry = I18N.chrome[chromeKey];
    if(!entry) return chromeKey;
    return entry[currentLang] || entry[I18N["default"]] || chromeKey;
  }

  function contentText(id){
    var entry = I18N.content[id];
    if(!entry) return null;
    var val = entry[currentLang];
    if(val === undefined) val = entry[I18N["default"]];
    return val === undefined ? null : val;
  }

  function key(id, lang){ return PREFIX + (lang || currentLang) + "_" + id; }
  function hrefKey(id, lang){ return PREFIX + (lang || currentLang) + "_" + id + "__href"; }
  function orderKey(){ return PREFIX + "order__" + (document.body.getAttribute("data-page") || "page"); }

  /* ---------------- toast (small status feedback) ---------------- */

  var toastEl = null;
  var toastTimer = null;
  function toast(msg, isError){
    if(!toastEl){
      toastEl = document.createElement("div");
      toastEl.id = "im-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.toggle("error", !!isError);
    toastEl.classList.add("show");
    if(toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, isError ? 5200 : 3400);
  }

  /* ---------------- GitHub live-publish helpers ---------------- */

  function ghToken(){
    try { return localStorage.getItem(GH_TOKEN_KEY); } catch(e){ return null; }
  }

  function ensureGhToken(){
    var t = ghToken();
    if(t) return t;
    var entered = window.prompt(
      "Publishing this photo to the live site needs a GitHub access token (one-time setup).\n\n" +
      "Create one at github.com/settings/personal-access-tokens with “Contents: Read and write” " +
      "access to the imagemedia-news repo, then paste it here. It is stored only in this browser.",
      ""
    );
    if(entered){
      entered = entered.trim();
      if(entered){
        try { localStorage.setItem(GH_TOKEN_KEY, entered); } catch(e){ /* ignore */ }
        return entered;
      }
    }
    return null;
  }

  function forgetGhToken(){
    try { localStorage.removeItem(GH_TOKEN_KEY); } catch(e){ /* ignore */ }
  }

  function b64EncodeUnicode(str){
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(_, p1){
      return String.fromCharCode("0x" + p1);
    }));
  }

  function b64DecodeUnicode(str){
    return decodeURIComponent(atob(str).split("").map(function(c){
      return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(""));
  }

  function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function ghApi(path, opts, token){
    opts = opts || {};
    var headers = opts.headers || {};
    headers["Authorization"] = "token " + token;
    headers["Accept"] = "application/vnd.github+json";
    opts.headers = headers;
    return fetch("https://api.github.com/repos/" + GH_OWNER + "/" + GH_REPO + "/contents/" + path, opts)
      .then(function(res){
        if(res.status === 404) return { notFound: true };
        return res.json().then(function(body){
          if(!res.ok){
            var msg = (body && body.message) || ("GitHub API error " + res.status);
            var err = new Error(msg);
            err.status = res.status;
            throw err;
          }
          return body;
        });
      });
  }

  function ghGetFile(path, token){
    return ghApi(path + "?ref=" + GH_BRANCH, { method: "GET" }, token).then(function(body){
      if(body.notFound) return null;
      var contentB64 = (body.content || "").replace(/\n/g, "");
      return { sha: body.sha, text: b64DecodeUnicode(contentB64) };
    });
  }

  function ghPutFile(path, base64Content, message, sha, token){
    var body = { message: message, content: base64Content, branch: GH_BRANCH };
    if(sha) body.sha = sha;
    return ghApi(path, { method: "PUT", body: JSON.stringify(body) }, token);
  }

  function currentPagePath(){
    var parts = location.pathname.split("/").filter(Boolean);
    var last = parts[parts.length - 1] || "index.html";
    if(last.indexOf(".html") === -1) last = "index.html";
    return last;
  }

  function extFromFile(file){
    var name = file.name || "";
    var m = /\.([a-z0-9]+)$/i.exec(name);
    if(m) return "." + m[1].toLowerCase();
    if(file.type === "image/png") return ".png";
    if(file.type === "image/webp") return ".webp";
    if(file.type === "image/gif") return ".gif";
    return ".jpg";
  }

  /* Publishes a single image replacement: uploads the binary to
     images/, then rewrites that <img>'s src inside the current
     page's committed HTML. Only works for images that already exist
     in the published file (new, not-yet-published story cards are
     skipped with a clear message). */
  function publishImage(imgEl, file, dataUrl){
    var id = imgEl.getAttribute("data-edit-id");
    var token = ensureGhToken();
    if(!token){
      toast("Saved on this device only — paste a GitHub token to publish it live.", true);
      return;
    }
    if(chromeRefresh) chromeRefresh();
    toast("Publishing photo…");

    var comma = dataUrl.indexOf(",");
    var base64Payload = comma !== -1 ? dataUrl.slice(comma + 1) : dataUrl;
    var imagePath = "images/" + id.replace(/[^a-z0-9_-]/gi, "") + "-" + Date.now() + extFromFile(file);
    var pagePath = currentPagePath();

    ghPutFile(imagePath, base64Payload, "Add photo for " + id, null, token)
      .then(function(){ return ghGetFile(pagePath, token); })
      .then(function(fileData){
        if(!fileData) throw new Error("Could not read " + pagePath + " from the repo.");
        var re = new RegExp('(<img\\b[^>]*data-edit-id="' + escapeRegExp(id) + '"[^>]*>)', "i");
        var m = re.exec(fileData.text);
        if(!m){
          throw new Error("NEW_CARD");
        }
        var oldTag = m[1];
        var newTag = oldTag.replace(/\ssrc="[^"]*"/i, ' src="' + imagePath + '"');
        if(newTag === oldTag && !/\ssrc="/i.test(oldTag)){
          newTag = oldTag.replace(/^<img\b/i, '<img src="' + imagePath + '"');
        }
        var newText = fileData.text.slice(0, m.index) + newTag + fileData.text.slice(m.index + oldTag.length);
        return ghPutFile(pagePath, b64EncodeUnicode(newText), "Publish photo update: " + id, fileData.sha, token);
      })
      .then(function(){
        toast("Published — live on the site in about a minute.");
      })
      .catch(function(err){
        if(err && err.message === "NEW_CARD"){
          toast("Saved locally. This card isn't published yet, so the photo can't go live on its own — ask Claude to publish this story first.", true);
        } else if(err && err.status === 401){
          forgetGhToken();
          toast("That GitHub token was rejected. Try uploading again to enter a new one.", true);
        } else {
          toast("Saved on this device, but publishing failed: " + (err && err.message ? err.message : "unknown error"), true);
        }
      });
  }

  /* ---------------- restore on load ---------------- */

  function restoreCards(){
    var grid = document.querySelector("[data-cards-grid]");
    var tpl = document.getElementById("story-card-template");
    if(!grid || !tpl) return;

    var defaultOrder = Array.prototype.map.call(
      grid.querySelectorAll(".story-card"),
      function(c){ return c.getAttribute("data-card-id"); }
    );

    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(orderKey()) || "null"); } catch(e){ saved = null; }

    if(!saved){
      localStorage.setItem(orderKey(), JSON.stringify(defaultOrder));
      return;
    }

    var existing = {};
    Array.prototype.forEach.call(grid.querySelectorAll(".story-card"), function(c){
      existing[c.getAttribute("data-card-id")] = c;
    });

    Object.keys(existing).forEach(function(id){
      if(saved.indexOf(id) === -1){ existing[id].remove(); }
    });

    saved.forEach(function(id){
      if(!existing[id]){
        var node = tpl.content.firstElementChild.cloneNode(true);
        node.setAttribute("data-card-id", id);
        rewriteEditIds(node, id);
        grid.appendChild(node);
      }
    });
  }

  function rewriteEditIds(node, cardId){
    Array.prototype.forEach.call(node.querySelectorAll("[data-edit-id]"), function(el){
      var parts = el.getAttribute("data-edit-id").split("__field__");
      var suffix = parts[1];
      if(suffix){ el.setAttribute("data-edit-id", "card-" + cardId + "__field__" + suffix); }
    });
    var removeBtn = node.querySelector(".remove-card-btn");
    if(removeBtn){ removeBtn.setAttribute("data-remove-card", cardId); }
  }

  function restoreFields(){
    Array.prototype.forEach.call(document.querySelectorAll("[data-edit-id]"), function(el){
      var id = el.getAttribute("data-edit-id");
      var type = el.getAttribute("data-edit-type") || "text";
      var base = contentText(id);
      var override = localStorage.getItem(key(id));

      if(type === "image"){
        if(override) el.setAttribute("src", override);
      } else if(type === "link"){
        var href = localStorage.getItem(hrefKey(id));
        if(href) el.setAttribute("href", href);
        var linkVal = override !== null ? override : base;
        if(linkVal !== null) el.innerHTML = linkVal;
      } else {
        var textVal = override !== null ? override : base;
        if(textVal !== null) el.innerHTML = textVal;
      }
    });
  }

  function applyChromeI18n(){
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function(el){
      el.innerHTML = T(el.getAttribute("data-i18n"));
    });
  }

  /* ---------------- edit mode wiring ---------------- */

  function setEditable(on){
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit-type="text"], [data-edit-type="link"]'), function(el){
      el.setAttribute("contenteditable", on ? "true" : "false");
    });
  }

  /* Some layouts (the homepage hero, for one) wrap an entire editable block —
     image, headline, deck — in a single <a> so it's clickable through to the
     article when NOT editing. While editing, that same link would hijack every
     click (upload button, text focus) into a page navigation before the edit
     could register, which looks exactly like "nothing happens". Neutralise
     that navigation for the duration of edit mode. */
  function wireEditModeLinkGuard(){
    document.addEventListener("click", function(e){
      if(!document.body.classList.contains("edit-mode")) return;
      var link = e.target.closest && e.target.closest("a[href]");
      if(!link) return;
      if(link.querySelector("[data-edit-id]") || link.querySelector(".editable-img-wrap")){
        e.preventDefault();
      }
    }, true);
  }

  function wireSaveOnBlur(){
    document.addEventListener("blur", function(e){
      var el = e.target;
      if(!el || !el.hasAttribute || !el.hasAttribute("data-edit-id")) return;
      var type = el.getAttribute("data-edit-type");
      if(type === "text" || type === "link"){
        localStorage.setItem(key(el.getAttribute("data-edit-id")), el.innerHTML);
      }
    }, true);
  }

  function wireImageEditing(){
    document.addEventListener("click", function(e){
      var uploadBtn = e.target.closest && e.target.closest("[data-img-upload]");
      var urlBtn = e.target.closest && e.target.closest("[data-img-url]");
      if(uploadBtn){
        var wrap = uploadBtn.closest(".editable-img-wrap");
        var input = wrap.querySelector("input[type=file]");
        input.click();
      }
      if(urlBtn){
        var wrap2 = urlBtn.closest(".editable-img-wrap");
        var img = wrap2.querySelector("img[data-edit-id]");
        var current = img.getAttribute("src");
        var val = window.prompt(T("prompt.image_url"), current && current.indexOf("data:") === 0 ? "" : current);
        if(val){
          img.setAttribute("src", val);
          localStorage.setItem(key(img.getAttribute("data-edit-id")), val);
        }
      }
    });

    document.addEventListener("change", function(e){
      var input = e.target;
      if(input && input.matches && input.matches(".editable-img-wrap input[type=file]")){
        var file = input.files && input.files[0];
        if(!file) return;
        var img = input.closest(".editable-img-wrap").querySelector("img[data-edit-id]");
        var reader = new FileReader();
        reader.onload = function(){
          img.setAttribute("src", reader.result);
          try {
            localStorage.setItem(key(img.getAttribute("data-edit-id")), reader.result);
          } catch(err) {
            /* localStorage quota exceeded (real photos are big as base64) — safe to
               ignore. On LIVE sites the actual file is published straight to GitHub
               below, so this local cache is a nice-to-have, not a requirement. */
}
          if(LIVE) publishImage(img, file, reader.result);
        };
        reader.readAsDataURL(file);
      }
    });
  }

  function wireLinkHrefEditing(){
    document.addEventListener("click", function(e){
      var badge = e.target.closest && e.target.closest(".link-edit-badge");
      if(!badge) return;
      var a = badge.previousElementSibling;
      if(!a || !a.hasAttribute("data-edit-id")) return;
      var id = a.getAttribute("data-edit-id");
      var val = window.prompt(T("prompt.link_href"), a.getAttribute("href") || "");
      if(val !== null){
        a.setAttribute("href", val);
        localStorage.setItem(hrefKey(id), val);
      }
    });
  }

  function wireCardButtons(){
    document.addEventListener("click", function(e){
      var addBtn = e.target.closest && e.target.closest("[data-add-card]");
      if(addBtn){ addCard(); return; }

      var removeBtn = e.target.closest && e.target.closest(".remove-card-btn");
      if(removeBtn){
        if(!window.confirm(T("confirm.remove_card"))) return;
        var cardId = removeBtn.getAttribute("data-remove-card");
        var card = removeBtn.closest(".story-card");
        if(card) card.remove();
        purgeCard(cardId);
        updateOrder();
      }
    });
  }

  function addCard(){
    var grid = document.querySelector("[data-cards-grid]");
    var tpl = document.getElementById("story-card-template");
    if(!grid || !tpl) return;
    var id = "new" + Date.now();
    var node = tpl.content.firstElementChild.cloneNode(true);
    node.setAttribute("data-card-id", id);
    rewriteEditIds(node, id);
    grid.appendChild(node);
    setEditable(true);
    updateOrder();
  }

  function purgeCard(cardId){
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit-id^="card-' + cardId + '__field__"]'), function(el){
      var eid = el.getAttribute("data-edit-id");
      I18N.supported.forEach(function(l){
        localStorage.removeItem(key(eid, l));
        localStorage.removeItem(hrefKey(eid, l));
      });
    });
  }

  function updateOrder(){
    var grid = document.querySelector("[data-cards-grid]");
    if(!grid) return;
    var ids = Array.prototype.map.call(grid.querySelectorAll(".story-card"), function(c){ return c.getAttribute("data-card-id"); });
    localStorage.setItem(orderKey(), JSON.stringify(ids));
  }

  /* ---------------- category filters (section pages) ---------------- */

  function wireFilters(){
    var bar = document.querySelector(".filters");
    if(!bar) return;
    bar.addEventListener("click", function(e){
      var btn = e.target.closest("button[data-filter]");
      if(!btn) return;
      Array.prototype.forEach.call(bar.querySelectorAll("button"), function(b){ b.classList.remove("active"); });
      btn.classList.add("active");
      var f = btn.getAttribute("data-filter");
      Array.prototype.forEach.call(document.querySelectorAll(".story-card"), function(card){
        card.style.display = (f === "all" || card.getAttribute("data-category") === f) ? "" : "none";
      });
    });
  }

  /* ---------------- breaking-bar ticker ---------------- */

  var tickerControls = null;

  function wireTicker(){
    var viewport = document.querySelector(".ticker-viewport");
    var track = viewport && viewport.querySelector(".ticker-track");
    if(!viewport || !track) return;

    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var anim = null;
    var PX_PER_SECOND = 45; // slow, deliberate crawl

    function start(){
      if(reduceMotion) return;
      if(anim){ anim.cancel(); anim = null; }
      var vw = viewport.clientWidth;
      var tw = track.scrollWidth;
      if(vw === 0 || tw === 0) return; // not visible yet / no text
      var distance = vw + tw;
      var duration = Math.max(8000, (distance / PX_PER_SECOND) * 1000);
      anim = track.animate(
        [{ transform: "translateX(" + vw + "px)" }, { transform: "translateX(" + (-tw) + "px)" }],
        { duration: duration, iterations: Infinity, easing: "linear" }
      );
    }

    function stop(){
      if(anim) anim.pause();
    }

    start();
    window.addEventListener("resize", function(){
      if(!document.body.classList.contains("edit-mode")) start();
    });

    tickerControls = { start: start, stop: stop };
  }

  /* ---------------- language switcher ---------------- */

  var chromeRefresh = null;

  function wireLangSwitch(){
    var switches = document.querySelectorAll(".lang-switch");
    if(!switches.length) return;

    function markActive(){
      Array.prototype.forEach.call(document.querySelectorAll(".lang-switch button"), function(b){
        b.classList.toggle("active", b.getAttribute("data-lang") === currentLang);
      });
    }
    markActive();

    Array.prototype.forEach.call(switches, function(sw){
      sw.addEventListener("click", function(e){
        var btn = e.target.closest("button[data-lang]");
        if(!btn) return;
        var lang = btn.getAttribute("data-lang");
        if(lang === currentLang) return;
        currentLang = lang;
        try { localStorage.setItem(LANG_KEY, lang); } catch(err){ /* ignore */ }
        markActive();
        restoreFields();
        applyChromeI18n();
        if(chromeRefresh) chromeRefresh();
        if(tickerControls) tickerControls.start();
      });
    });
  }

  /* ---------------- toolbar ---------------- */

  function buildToolbar(){
    var launcher = document.createElement("button");
    launcher.id = "im-edit-launcher";
    document.body.appendChild(launcher);

    var bar = document.createElement("div");
    bar.id = "im-toolbar";
    document.body.appendChild(bar);

    var modal = document.createElement("div");
    modal.id = "im-help-modal";
    document.body.appendChild(modal);

    function wireImportInput(){
      var inp = bar.querySelector("[data-import-input]");
      if(!inp) return;
      inp.addEventListener("change", function(e){
        var file = e.target.files && e.target.files[0];
        if(!file) return;
        var reader = new FileReader();
        reader.onload = function(){
          try{
            var data = JSON.parse(reader.result);
            Object.keys(data).forEach(function(k){ localStorage.setItem(k, data[k]); });
            window.alert(T("alert.import_ok"));
            location.reload();
          }catch(err){
            window.alert(T("alert.import_fail"));
          }
        };
        reader.readAsText(file);
      });
    }

    function render(){
      launcher.textContent = T("toolbar.edit");
      var livePill = LIVE
        ? '<span class="live-pill' + (ghToken() ? ' on' : '') + '">' + (ghToken() ? "🌐 Live photos" : "🌐 Live (connect on upload)") + '</span>'
        : '<span class="live-pill">Offline copy</span>';
      bar.innerHTML =
        '<button class="primary" data-action="done">' + T("toolbar.done") + '</button>' +
        '<span class="status">' + T("toolbar.status") + '</span>' +
        livePill +
        '<span class="grow"></span>' +
        '<label class="tbtn" data-action="import">' + T("toolbar.import") +
          '<input type="file" accept="application/json" style="display:none" data-import-input></label>' +
        '<button data-action="export">' + T("toolbar.export") + '</button>' +
        '<button data-action="help">' + T("toolbar.help") + '</button>' +
        '<button class="danger" data-action="reset">' + T("toolbar.reset") + '</button>';
      modal.innerHTML =
        '<div class="box"><h3>' + T("help.title") + '</h3><ul>' +
        '<li>' + T("help.li1") + '</li>' +
        '<li>' + T("help.li2") + '</li>' +
        '<li>' + T("help.li3") + '</li>' +
        '<li>' + T("help.li4") + '</li>' +
        '<li>' + T("help.li5") + '</li>' +
        '</ul><button class="btn btn-primary close-btn" data-action="close-help">' + T("help.gotit") + '</button></div>';
      wireImportInput();
    }
    render();
    chromeRefresh = render;

    launcher.addEventListener("click", function(){
      document.body.classList.add("edit-mode");
      setEditable(true);
      if(tickerControls) tickerControls.stop();
    });

    bar.addEventListener("click", function(e){
      var actionEl = e.target.closest("[data-action]");
      if(!actionEl) return;
      var action = actionEl.getAttribute("data-action");
      if(action === "done"){
        document.body.classList.remove("edit-mode");
        setEditable(false);
        if(tickerControls) tickerControls.start();
      } else if(action === "export"){
        exportBackup();
      } else if(action === "help"){
        modal.classList.add("open");
      } else if(action === "reset"){
        resetPage();
      }
    });

    modal.addEventListener("click", function(e){
      if(e.target === modal || e.target.closest("[data-action='close-help']")){
        modal.classList.remove("open");
      }
    });
  }

  function exportBackup(){
    var data = {};
    for(var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i);
      if(k.indexOf(PREFIX) === 0) data[k] = localStorage.getItem(k);
    }
    var blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "imagemedia-news-backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function resetPage(){
    if(!window.confirm(T("confirm.reset_page"))) return;
    var ids = [];
    Array.prototype.forEach.call(document.querySelectorAll("[data-edit-id]"), function(el){
      ids.push(el.getAttribute("data-edit-id"));
    });
    ids.forEach(function(id){
      I18N.supported.forEach(function(l){
        localStorage.removeItem(key(id, l));
        localStorage.removeItem(hrefKey(id, l));
      });
    });
    if(document.querySelector("[data-cards-grid]")) localStorage.removeItem(orderKey());
    location.reload();
  }

  /* ---------------- mobile nav ---------------- */

  function wireMobileNav(){
    var toggle = document.querySelector(".nav-toggle");
    var menu = document.querySelector("nav.menu");
    if(!toggle || !menu) return;
    toggle.addEventListener("click", function(){ menu.classList.toggle("open"); });
  }

  /* ---------------- init ---------------- */

  document.addEventListener("DOMContentLoaded", function(){
    restoreCards();
    restoreFields();
    applyChromeI18n();
    wireEditModeLinkGuard();
    wireSaveOnBlur();
    wireImageEditing();
    wireLinkHrefEditing();
    wireCardButtons();
    buildToolbar();
    wireMobileNav();
    wireFilters();
    wireTicker();
    wireLangSwitch();
  });
})();


// --- Adaptive image fit: landscape photos fill the frame, portrait photos show in full ---
(function () {
  var SELECTOR = '.hero-story img, .story-card .thumb img, .latest-row .thumb img, .article-hero img, .inline-figure img';

  function classify(img) {
    if (!img.naturalWidth || !img.naturalHeight) return;
    if (img.naturalHeight > img.naturalWidth) {
      img.classList.add('fit-contain');
    } else {
      img.classList.remove('fit-contain');
    }
  }

  function watch(img) {
    if (img.complete) {
      classify(img);
    } else {
      img.addEventListener('load', function () { classify(img); });
    }
  }

  function scanAll() {
    document.querySelectorAll(SELECTOR).forEach(watch);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanAll);
  } else {
    scanAll();
  }

  var imgFitObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.type === 'attributes' && m.attributeName === 'src' && m.target && m.target.tagName === 'IMG') {
        var img = m.target;
        img.classList.remove('fit-contain');
        watch(img);
      }
    });
  });
  imgFitObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['src'], subtree: true });
})();

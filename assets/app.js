/* ==========================================================================
   Image Media News — site script
   Multi-language: content and UI chrome are translated on the fly from
   window.IM_I18N (assets/i18n.js). Language is auto-detected from the
   browser on first visit, then remembered per-browser.
   ========================================================================== */
(function(){
  "use strict";

  var LANG_KEY = "im_lang";

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

  /* ---------------- translated content on load ----------------
     Applies the translated dictionary text (assets/i18n.js) for any element
     carrying a data-edit-id, when a translation exists for the current
     language. If no dictionary entry exists, the page's own baked-in text
     is left untouched. Images are never touched here — every photo on the
     site is a plain, fixed <img src> published directly to the repo. */
  function restoreFields(){
    Array.prototype.forEach.call(document.querySelectorAll("[data-edit-id]"), function(el){
      var id = el.getAttribute("data-edit-id");
      var type = el.getAttribute("data-edit-type") || "text";
      if(type === "image") return;
      var base = contentText(id);
      if(base !== null) el.innerHTML = base;
    });
  }

  function applyChromeI18n(){
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function(el){
      el.innerHTML = T(el.getAttribute("data-i18n"));
    });
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

  /* Section chronology follows the event, not the publication day.
     Late-arriving coverage therefore keeps its correct editorial position. */
  function sortEventGrids(){
    Array.prototype.forEach.call(document.querySelectorAll("[data-cards-grid]"), function(grid){
      var cards = Array.prototype.map.call(grid.children, function(card, index){
        return { card: card, index: index, date: card.getAttribute("data-event-date") || "" };
      }).filter(function(item){ return item.card.classList.contains("story-card"); });

      cards.sort(function(a, b){
        if(a.date === b.date) return a.index - b.index;
        if(!a.date) return 1;
        if(!b.date) return -1;
        return b.date.localeCompare(a.date);
      });
      cards.forEach(function(item){ grid.appendChild(item.card); });
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
    window.addEventListener("resize", function(){ start(); });

    tickerControls = { start: start, stop: stop };
  }

  /* ---------------- language switcher ---------------- */

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
        if(tickerControls) tickerControls.start();
      });
    });
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
    restoreFields();
    applyChromeI18n();
    sortEventGrids();
    wireMobileNav();
    wireFilters();
    wireTicker();
    wireLangSwitch();
  });
})();

/* ---------------- privacy-first audience measurement ----------------
   Google Analytics belongs to the Image Media account. The tag is not loaded
   until the visitor accepts analytics, and the choice can be changed later. */
(function () {
  "use strict";

  var MEASUREMENT_ID = "G-K43LKDTWW3";
  var CONSENT_KEY = "im_analytics_consent";
  var analyticsLoaded = false;

  function savedChoice() {
    try { return window.localStorage.getItem(CONSENT_KEY); }
    catch (error) { return null; }
  }

  function saveChoice(choice) {
    try { window.localStorage.setItem(CONSENT_KEY, choice); }
    catch (error) {}
  }

  function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    globalThis.dataLayer = globalThis.dataLayer || [];
    globalThis.gtag = globalThis.gtag || function () {
      globalThis.dataLayer.push(Array.prototype.slice.call(arguments));
    };
    globalThis.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "granted"
    });
    globalThis.gtag("js", new Date());
    globalThis.gtag("config", MEASUREMENT_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });

    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + MEASUREMENT_ID;
    script.setAttribute("data-im-news-analytics", MEASUREMENT_ID);
    document.head.appendChild(script);
  }

  document.documentElement.setAttribute("data-analytics-ready", MEASUREMENT_ID);
  globalThis.imTrack = globalThis.imTrack || function (eventName, parameters) {
    if (!analyticsLoaded || typeof globalThis.gtag !== "function") return;
    globalThis.gtag("event", eventName, parameters || {});
  };

  function removeBanner() {
    var banner = document.getElementById("privacy-consent");
    if (banner) banner.remove();
  }

  function showBanner() {
    if (document.getElementById("privacy-consent")) return;
    var banner = document.createElement("section");
    banner.id = "privacy-consent";
    banner.className = "privacy-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Analytics privacy choice");
    banner.innerHTML =
      '<div class="privacy-consent-copy"><strong>Help us improve IM News</strong>' +
      '<p>With your permission, we use Google Analytics to understand which stories and formats readers value. Advertising storage and personalisation remain off.</p>' +
      '<a href="privacy.html">Privacy information</a></div>' +
      '<div class="privacy-consent-actions">' +
      '<button type="button" class="btn privacy-decline">Decline analytics</button>' +
      '<button type="button" class="btn btn-primary privacy-accept">Accept analytics</button>' +
      '</div>';
    document.body.appendChild(banner);

    banner.querySelector(".privacy-accept").addEventListener("click", function () {
      saveChoice("accepted");
      loadAnalytics();
      removeBanner();
    });
    banner.querySelector(".privacy-decline").addEventListener("click", function () {
      saveChoice("declined");
      removeBanner();
    });
  }

  function addPrivacySettings() {
    if (document.getElementById("privacy-settings")) return;
    var button = document.createElement("button");
    button.id = "privacy-settings";
    button.className = "privacy-settings";
    button.type = "button";
    button.textContent = "Privacy settings";
    button.addEventListener("click", function () {
      try { window.localStorage.removeItem(CONSENT_KEY); } catch (error) {}
      showBanner();
    });
    document.body.appendChild(button);
  }

  function startPrivacyMeasurement() {
    if (savedChoice() === "accepted") loadAnalytics();
    else if (savedChoice() !== "declined") showBanner();
    addPrivacySettings();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startPrivacyMeasurement);
  } else {
    startPrivacyMeasurement();
  }
})();

/* ---------------- audience engagement ----------------
   Adds useful sharing controls to every article and handles the newsletter
   confirmation state. The controls are generated here so old and new stories
   receive the same behaviour without maintaining duplicated article markup. */
(function () {
  "use strict";

  function pageUrl() {
    var canonical = document.querySelector('link[rel="canonical"]');
    return canonical ? canonical.href : window.location.href.split("#")[0];
  }

  function shareText() {
    var headline = document.querySelector(".article-head h1");
    return headline ? headline.textContent.trim() : document.title;
  }

  function showCopyResult(button, success) {
    var original = button.getAttribute("data-label") || button.textContent;
    button.textContent = success ? "Link copied" : "Copy failed";
    window.setTimeout(function () { button.textContent = original; }, 1800);
  }

  function copyLink(button) {
    var url = pageUrl();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        showCopyResult(button, true);
      }).catch(function () {
        showCopyResult(button, false);
      });
      return;
    }
    var field = document.createElement("textarea");
    field.value = url;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    var copied = false;
    try { copied = document.execCommand("copy"); } catch (error) { copied = false; }
    document.body.removeChild(field);
    showCopyResult(button, copied);
  }

  function wireArticleSharing() {
    var body = document.querySelector(".article-body");
    if (!body || document.querySelector(".article-share")) return;

    var url = pageUrl();
    var title = shareText();
    var encodedUrl = encodeURIComponent(url);
    var encodedTitle = encodeURIComponent(title);
    var share = document.createElement("aside");
    share.className = "article-share";
    share.setAttribute("aria-label", "Share this article");
    share.innerHTML =
      '<strong>Share this story</strong>' +
      '<div class="article-share-actions">' +
      '<a class="share-button share-whatsapp" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodedTitle + '%20' + encodedUrl + '">WhatsApp</a>' +
      '<a class="share-button share-facebook" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=' + encodedUrl + '">Facebook</a>' +
      '<button class="share-button share-copy" type="button" data-label="Copy link">Copy link</button>' +
      '</div>';

    var tags = body.querySelector(".article-tags");
    if (tags) body.insertBefore(share, tags);
    else body.appendChild(share);

    share.querySelector(".share-copy").addEventListener("click", function () {
      copyLink(this);
      globalThis.imTrack("share", { method: "copy_link", content_type: "article", item_id: pageUrl() });
    });

    share.querySelector(".share-whatsapp").addEventListener("click", function () {
      globalThis.imTrack("share", { method: "whatsapp", content_type: "article", item_id: pageUrl() });
    });
    share.querySelector(".share-facebook").addEventListener("click", function () {
      globalThis.imTrack("share", { method: "facebook", content_type: "article", item_id: pageUrl() });
    });

    if (navigator.share) {
      var nativeButton = document.createElement("button");
      nativeButton.type = "button";
      nativeButton.className = "share-button share-native";
      nativeButton.textContent = "More";
      nativeButton.addEventListener("click", function () {
        globalThis.imTrack("share", { method: "native", content_type: "article", item_id: pageUrl() });
        navigator.share({ title: title, text: title, url: url }).catch(function () {});
      });
      share.querySelector(".article-share-actions").appendChild(nativeButton);
    }
  }

  function wireNewsletter() {
    var form = document.querySelector("[data-newsletter-form]");
    if (!form) return;
    var status = form.parentNode.querySelector("[data-newsletter-status]");
    var responseFrame = form.parentNode.querySelector("iframe[name='newsletter-submit']");
    var submitted = false;
    var button = form.querySelector("button[type='submit']");

    function finishSubscription() {
      if (!submitted) return;
      submitted = false;
      form.reset();
      if (button) {
        button.disabled = false;
        button.textContent = "Subscribe";
      }
      if (status) {
        status.textContent = "Thank you — your subscription has been received.";
        status.classList.add("show");
      }
    }

    if (responseFrame) responseFrame.addEventListener("load", finishSubscription);
    form.addEventListener("submit", function () {
      submitted = true;
      globalThis.imTrack("newsletter_signup", { form_name: "homepage_newsletter" });
      if (status) status.classList.remove("show");
      if (button) {
        button.disabled = true;
        button.textContent = "Subscribing…";
      }
      window.setTimeout(finishSubscription, 8000);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      wireArticleSharing();
      wireNewsletter();
    });
  } else {
    wireArticleSharing();
    wireNewsletter();
  }
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

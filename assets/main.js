/* Ye Liu — profile site behaviour.
   Renders highlights and publications (with figures) from assets/publications.js,
   and wires up filters, deep links, the figure viewer, the section
   scroll-spy and the light/dark toggle. Plain browser JavaScript: no modules, no build, works from file://. */
(function () {
  "use strict";

  var PUBS = window.PUBLICATIONS || [];
  // Defaults, so one incomplete entry cannot break the whole page.
  PUBS.forEach(function (p) {
    p.title = p.title || ""; p.authors = p.authors || ""; p.venue = p.venue || ""; p.year = +p.year;
    p.topics = p.topics || []; p.links = p.links || {}; p.highlights = p.highlights || [];
  });
  var SCHOLAR_SEARCH = "https://scholar.google.com/scholar?q=";

  // Owner's name as a whole author token. A trailing "*" (equal contribution) is allowed.
  var OWNER = /^(Y|Ye) Liu\*?$/;
  var MAX_AUTHORS = 10; // longer lists are collapsed around the owner's name

  // Topic keys used in publications.js -> labels shown on filter chips (in this order).
  var TOPICS = {
    reasoning: "Reasoning", agents: "Agents", retrieval: "Retrieval & embeddings", code: "Code",
    llm: "LLMs", qa: "QA & parsing", dialogue: "Dialogue & NLU", nlg: "Text generation", graph: "Graph mining"
  };
  var TYPE_BADGE = { preprint: "Preprint", report: "Tech report", workshop: "Workshop", release: "Model release" };
  // Link keys in display order: [key, label, URL prefix for bare ids]. Other keys follow, as-is.
  var LINKS = [["arxiv", "arXiv", "https://arxiv.org/abs/"], ["code", "Code"], ["model", "Model"], ["data", "Data"],
    ["project", "Project"], ["blog", "Blog"], ["doi", "DOI", "https://doi.org/"]];
  // Short names used in the Highlights section; default is the part of the title before ":".
  var SHORT = {
    "sfr-embedding-2-2024": "SFR-Embedding-2_R", "b3-2025": "B3",
    "collab-verification-2024": "Collaborative Verification", "commonsense-evidence-2020": "Commonsense Evidence Generation"
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function byYearDesc(a, b) { return b.year - a.year; } // Array.sort is stable: keeps file order within a year
  function isPub(id) { return PUBS.some(function (p) { return "pub-" + p.id === id; }); }
  function icon(id) { return '<svg aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  var DOT = ' <span class="dot" aria-hidden="true">·</span> ';
  function shortName(p) { return SHORT[p.id] || (p.title.indexOf(":") > 0 ? p.title.split(":")[0] : p.title); }
  function venueName(p) { return p.venue.replace(/\s*\b(19|20)\d{2}\b/, "") || p.venue; }
  // Venue, then the year. A venue with the year inside it ("EMNLP 2021 (short)") is shown as written.
  function venueYearHTML(p) {
    return /\b(19|20)\d{2}\b.*\S/.test(p.venue) ? esc(p.venue) : esc(venueName(p)) + ' <span class="year">' + p.year + "</span>";
  }
  function names(str) { return str.split(",").map(function (s) { return s.trim(); }).filter(Boolean); }
  function ownerToken(p) { return names(p.authors).filter(function (a) { return OWNER.test(a); })[0] || ""; }
  // Only http(s), mailto and in-page URLs become links.
  function href(u) { return ' href="' + esc(/^(https?:|mailto:|#)/i.test(u) ? u : "#") + '"'; }

  /* ---------- Paper rendering ---------- */

  function au(a) { return OWNER.test(a) ? '<b class="me au">' + esc(a) + "</b>" : '<span class="au">' + esc(a) + "</span>"; }

  // Long lists: first 3, the owner, the last author, plus a button that reveals everyone.
  function authorsHTML(str) {
    var list = names(str), full = list.map(au).join(", ");
    if (list.length <= MAX_AUTHORS) return full;
    var keep = [0, 1, 2, list.findIndex(function (a) { return OWNER.test(a); }), list.length - 1], out = [], prev = -1;
    list.forEach(function (a, i) {
      if (keep.indexOf(i) === -1) return;
      if (i > prev + 1) out.push("…");
      out.push(au(a));
      prev = i;
    });
    return "<span>" + out.join(", ") + "</span><span hidden>" + full + '</span> <button type="button" class="more" aria-expanded="false" data-n="' +
      list.length + '">show all ' + list.length + " authors</button>";
  }

  function paperLinks(p) {
    var L = p.links, known = LINKS.map(function (d) { return d[0]; });
    return LINKS.filter(function (d) { return L[d[0]]; }).map(function (d) { return { label: d[1], href: (d[2] || "") + L[d[0]] }; })
      .concat(Object.keys(L).filter(function (k) { return known.indexOf(k) === -1 && L[k]; }).map(function (k) {
        return { label: k.charAt(0).toUpperCase() + k.slice(1), href: L[k] };
      }));
  }

  function badgesHTML(p) {
    return p.highlights.map(function (h) {
      return '<a class="hl hl-' + esc(h.kind) + '"' + href(h.url) + (h.note ? ' title="' + esc(h.note) + '"' : "") + ">" +
        esc(h.text) + "</a>";
    }).join("");
  }

  function linksHTML(p, links) {
    return links.map(function (l) {
      return "<a" + href(l.href) + ' aria-label="' + esc(l.label + ": " + shortName(p)) + '">' + esc(l.label) + "</a>";
    }).join(DOT);
  }

  // Type and authorship labels. No "Workshop" label when the venue already says so.
  function tagsHTML(p) {
    var badge = TYPE_BADGE[p.type], out = [];
    if (badge && p.venue.toLowerCase().indexOf(badge.toLowerCase()) === -1) out.push('<span class="pub-type">' + badge + "</span>");
    if (p.first) out.push('<span class="role-mark">' + (/\*$/.test(ownerToken(p)) ? "Co-first author" : "First author") + "</span>");
    return out.join(DOT);
  }

  // Venue, year, type and authorship on one line (figure viewer).
  function metaHTML(p, year) {
    var tags = tagsHTML(p);
    return '<span class="venue">' + (year ? venueYearHTML(p) : esc(venueName(p))) + "</span>" + (tags ? DOT + tags : "");
  }

  // Title (to arXiv if present, else the first link, else a Google Scholar search for the exact title), authors,
  // TL;DR (Selected only, one line with a "more" button), links, labels, highlights. Then the venue badge
  // (with the year in Selected; All publications has year headings) and the figure, a button that opens the
  // viewer; style.css places both in the left column.
  function paperHTML(p, opts) {
    var links = paperLinks(p), hl = badgesHTML(p), linkHTML = linksHTML(p, links), tags = tagsHTML(p);
    var titleHref = links.length ? links[0].href : SCHOLAR_SEARCH + encodeURIComponent('"' + p.title + '"');
    var src = p.figure_thumb ? ' src="' + esc(p.figure_thumb) + '" srcset="' + esc(p.figure_thumb) + " 400w, " + esc(p.figure) + " " +
      p.figure_w + 'w" sizes="(max-width: 679px) 92px, 104px"' : ' src="' + esc(p.figure) + '"';
    var fig = p.figure ? '<button type="button" class="fig" data-fig="' + esc(p.id) + '"><span class="sr-only">Enlarge figure: </span><img' + src +
      ' alt="' + esc(p.figure_alt || "") + '" width="' + p.figure_w + '" height="' + p.figure_h + '" loading="lazy" decoding="async"></button>' : "";
    var venue = '<p class="venue-badge">' + (opts.year ? venueYearHTML(p) : esc(venueName(p))) + "</p>";

    return '<li class="pub"' + (opts.anchor ? ' id="pub-' + esc(p.id) + '"' : "") + ">" +
      '<div class="pub-body"><p class="pub-title"><a' + href(titleHref) + ">" + esc(p.title) + "</a></p>" +
      '<p class="pub-authors">' + authorsHTML(p.authors) + "</p>" +
      (opts.tldr && p.tldr ? '<div class="tldr-row"><p class="tldr">' + esc(p.tldr) + '</p><button type="button" class="tldr-more" aria-expanded="false" hidden>more<span class="sr-only"> of the summary of ' +
        esc(shortName(p)) + "</span></button></div>" : "") +
      (hl || linkHTML || tags ? '<p class="pub-foot">' + (linkHTML ? '<span class="pub-links">' + linkHTML + "</span>" : "") +
        (tags ? '<span class="tags">' + tags + "</span>" : "") + (hl ? '<span class="hls">' + hl + "</span>" : "") + "</p>" : "") +
      '</div><div class="pub-side">' + venue + fig + "</div></li>";
  }

  // The "more" button of a one-line TL;DR shows only when the line is cut off.
  function fitTldr() {
    $$(".tldr-row:not(.open)").forEach(function (r) {
      var t = r.firstChild;
      r.lastChild.hidden = t.scrollHeight <= t.clientHeight + 1;
    });
  }

  /* ---------- Highlights: one card per artifact ---------- */

  // Papers with a leaderboard highlight (h) and/or an open release (r). Order: both, by downloads; then results only;
  // then releases only, by downloads.
  function artifacts() {
    var group = function (x) { return x.h && x.r ? 0 : x.h ? 1 : 2; }, dl = function (x) { return x.r ? x.r.downloads : 0; };
    return PUBS.map(function (p) {
      return { p: p, h: p.highlights.filter(function (h) { return h.kind === "leaderboard"; })[0], r: p.release };
    }).filter(function (x) { return x.h || x.r; }).sort(function (a, b) { return group(a) - group(b) || dl(b) - dl(a); });
  }

  function role(x) {
    if (x.h && x.h.role) return x.h.role;
    if (/\*$/.test(ownerToken(x.p))) return "Co-first author";
    return OWNER.test(names(x.p.authors)[0]) ? "First author" : "Co-author";
  }

  function count(n) { return n.toLocaleString("en-US"); }

  // Name (plus the release name unless it is the paper name with a version suffix) and kind; result; downloads with a
  // bar, linear relative to the largest release (at least 2 px wide, style.css); role and Details (note, per-repo
  // counts). Each part has its own grid row.
  function cardHTML(x, max) {
    var name = shortName(x.p), r = x.r, h = x.h, repos = r ? Object.keys(r.repos) : [], kind = r ? r.kind : h.artifact;
    var details = (h && h.note ? '<p class="note">' + esc(h.note) + "</p>" : "") +
      (repos.length > 1 ? '<p class="note">Downloads by repository:</p><ul class="note ac-repos">' + repos.map(function (k) {
        return "<li>" + esc(k.split("/").pop()) + " <span>" + count(r.repos[k]) + "</span></li>";
      }).join("") + "</ul>" : "");
    var cut = h ? h.when.lastIndexOf(" ", h.when.lastIndexOf(" ") - 1) + 1 : 0; // the date and the link icon stay on one line
    return '<li class="ac">' +
      '<div class="ac-head"><h3 class="ac-name"><a href="#pub-' + esc(x.p.id) + '">' + esc(name) + "</a>" +
        (r && r.name.indexOf(name) !== 0 ? ' <span class="ac-repo">' + esc(r.name) + "</span>" : "") + "</h3>" +
        (kind ? '<p class="ac-kind">' + esc(kind) + "</p>" : "") + "</div>" +
      (h ? '<div class="ac-result"><p class="ac-bench"><b>' + esc(h.bench) + "</b>" + (h.scope ? DOT + esc(h.scope) : "") + "</p>" +
        '<p class="ac-claim"><a' + href(h.url) + ">" + esc(h.when.slice(0, cut)) + '<span class="nowrap">' + esc(h.when.slice(cut)) +
        '<span class="sr-only"> (source)</span>' + icon("i-ext") + "</span></a></p></div>" : "") +
      (r ? '<p class="ac-dl"><a' + href(r.url) + ' title="' + esc("All-time downloads (Hugging Face API, " + r.as_of + "): " +
        repos.map(function (k) { return k + ": " + count(r.repos[k]); }).join(" · ")) + '"><b>' + esc(r.label) + "</b> downloads" +
        '<span class="sr-only"> of ' + esc(name) + " on Hugging Face</span></a>" +
        '<span class="ac-bar" style="--v:' + (100 * r.downloads / max).toPrecision(3) + '%" aria-hidden="true"><i></i></span></p>' : "") +
      '<div class="ac-foot"><span class="ac-role">' + esc(role(x)) + "</span>" +
        (details ? DOT + '<details><summary>Details<span class="sr-only"> for ' + esc(name) + "</span></summary>" +
          '<div class="ac-detail">' + details + "</div></details>" : "") + "</div></li>";
  }

  // Replaces the no-JavaScript copy of the cards in index.html.
  function renderHighlights() {
    var list = artifacts(), rel = list.filter(function (x) { return x.r; });
    var max = Math.max.apply(null, rel.map(function (x) { return x.r.downloads; }));
    $("#hl-cards").innerHTML = '<ul class="ac-grid">\n' + list.map(function (x) { return cardHTML(x, max); }).join("\n") + "\n</ul>" +
      (rel.length ? '<p class="ac-caption">Hugging Face downloads, all-time, as of ' + esc(rel[0].r.as_of) + "</p>" : "");
  }

  /* ---------- Selected publications ---------- */

  function renderSelected() {
    $("#selected-list").innerHTML = PUBS.filter(function (p) { return p.selected && p.id !== "judgerank-2024" && p.id !== "folio-2024"; }).sort(byYearDesc).slice(0, 6)
      .map(function (p) { return paperHTML(p, { tldr: true, year: true }); }).join("");
  }

  /* ---------- All publications + filters ---------- */

  var EMPTY = { topic: null, q: "" };
  var state = Object.assign({}, EMPTY);
  var YEARS = PUBS.map(function (p) { return p.year; })
    .filter(function (y, i, a) { return a.indexOf(y) === i; }).sort(function (a, b) { return b - a; });

  function topicCount(t) { return PUBS.filter(function (p) { return p.topics.indexOf(t) !== -1; }).length; }

  function matches(p) {
    if (state.topic && p.topics.indexOf(state.topic) === -1) return false;
    if (state.q) {
      var hay = [p.title, p.authors, p.venue, p.year, p.tldr].concat(p.topics.map(function (t) { return TOPICS[t] || t; }),
        p.highlights.map(function (h) { return h.text; })).join(" ").toLowerCase();
      return state.q.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
    }
    return true;
  }

  function renderPubs() {
    var shown = PUBS.filter(matches), html = "", index = [];
    YEARS.forEach(function (y) {
      var items = shown.filter(function (p) { return p.year === y; });
      if (!items.length) { index.push('<span class="off" aria-disabled="true">' + y + "</span>"); return; }
      index.push('<a href="#y-' + y + '">' + y + "</a>");
      html += '<div class="year-group" id="y-' + y + '"><div class="year-head"><h3>' + y + '</h3></div><ol class="pub-list">' +
        items.map(function (p) { return paperHTML(p, { anchor: true }); }).join("") + "</ol></div>";
    });
    $("#pub-groups").innerHTML = html || '<p class="empty">No publications match these filters.</p>';
    $("#year-index").innerHTML = '<span class="yi-label" aria-hidden="true">Jump to</span>' + index.join("");
    $("#year-index").hidden = !shown.length;

    var active = state.topic || state.q;
    $("#result-count").textContent = active
      ? "Showing " + shown.length + " of " + PUBS.length + " publications"
      : PUBS.length + " publications, newest first";
    $("#clear-filters").hidden = !active;

    $$("#topic-chips .chip").forEach(function (b) {
      b.setAttribute("aria-pressed", String((b.getAttribute("data-topic") || null) === state.topic));
    });
  }

  function chipHTML(topic, label, n, extraClass, attrs, nClass) {
    return '<button type="button" class="chip' + (extraClass || "") + '" data-topic="' + esc(topic || "") + '" ' +
      (attrs || 'aria-pressed="false"') + ">" + esc(label) + (n != null ? ' <span class="n' + (nClass || "") + '">' + n + "</span>" : "") + "</button>";
  }

  function setupFilters() {
    var chips = $("#topic-chips");
    // Topic tabs: the count is a tooltip and read out by screen readers, not shown.
    var tab = function (t, label, n) { return chipHTML(t, label, n, "", 'aria-pressed="false" title="' + n + ' papers"', " sr-only"); };
    chips.innerHTML = tab(null, "All", PUBS.length) + Object.keys(TOPICS)
      .filter(function (t) { return topicCount(t) > 0; })
      .map(function (t) { return tab(t, TOPICS[t], topicCount(t)); }).join("");

    chips.addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      var t = b.getAttribute("data-topic") || null;
      state.topic = state.topic === t ? null : t; // clicking the active topic again clears it
      renderPubs();
    });
    $("#pub-search").addEventListener("input", function (e) {
      state.q = e.target.value.trim().toLowerCase();
      renderPubs();
    });
    $("#clear-filters").addEventListener("click", function () {
      resetFilters();
      $("#pub-search").focus();
    });
    $("#filters").hidden = false;
  }

  function resetFilters() {
    state = Object.assign({}, EMPTY);
    $("#pub-search").value = "";
    renderPubs();
  }

  /* ---------- Research themes: topic buttons ---------- */

  function setupThemes() {
    $$(".theme[data-topics]").forEach(function (card) {
      var topics = card.getAttribute("data-topics").split(/\s+/).filter(function (t) { return topicCount(t) > 0; });
      if (!topics.length) return;
      var row = document.createElement("div");
      row.className = "theme-topics";
      row.innerHTML = '<span class="theme-topics-label" aria-hidden="true">Browse</span><span class="theme-topics-chips">' + topics.map(function (t) {
        return chipHTML(t, TOPICS[t] || t, topicCount(t), " chip-sm", 'title="Show ' + esc(TOPICS[t] || t) + ' papers"');
      }).join("") + "</span>";
      card.appendChild(row);
      row.addEventListener("click", function (e) {
        var b = e.target.closest(".chip");
        if (!b) return;
        resetFilters();
        state.topic = b.getAttribute("data-topic");
        renderPubs();
        var h = $("#pubs-h");
        h.scrollIntoView();
        h.focus({ preventScroll: true });
      });
    });
  }

  /* ---------- Deep links to papers (#pub-<id>) ---------- */

  // Show the paper even if the current filters hide it, scroll to it and flash it.
  function revealHash(e) {
    var id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (err) { return; }
    if (id.indexOf("pub-") !== 0) return;
    if (!isPub(id)) { console.warn("Unknown paper link: #" + id); return; }
    if (!document.getElementById(id)) resetFilters();
    var el = document.getElementById(id), flashed = false;
    var flash = function () {
      if (flashed) return;
      flashed = true;
      el.classList.remove("flash");
      void el.offsetWidth; // restart the highlight if it is already running
      el.classList.add("flash");
      setTimeout(function () { el.classList.remove("flash"); }, 1600);
    };
    el.scrollIntoView({ block: "start", behavior: e ? "auto" : "instant" }); // no long animation on page load
    // After a click the page may scroll smoothly: flash when it arrives (fallback in case no scroll happens).
    if (e && "onscrollend" in window) { window.addEventListener("scrollend", flash, { once: true }); setTimeout(flash, 1500); }
    else flash();
    el.setAttribute("tabindex", "-1"); // so the next Tab continues from the paper
    el.focus({ preventScroll: true });
  }

  // Warn (in the browser console) about in-page links that point at unknown paper ids.
  function checkAnchors() {
    $$('a[href^="#pub-"]').forEach(function (a) {
      if (!isPub(a.getAttribute("href").slice(1))) console.warn("Broken paper link:", a.getAttribute("href"));
    });
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest('a[href^="#pub-"]');
    if (a) {
      e.preventDefault();
      if (location.hash === a.getAttribute("href")) revealHash();
      else location.hash = a.getAttribute("href"); // -> hashchange -> revealHash
      return;
    }
    var b = e.target.closest(".more"); // "show all N authors"
    if (b) {
      var open = b.getAttribute("aria-expanded") !== "true";
      b.setAttribute("aria-expanded", String(open));
      b.previousElementSibling.hidden = !open;
      b.previousElementSibling.previousElementSibling.hidden = open;
      b.textContent = open ? "show fewer" : "show all " + b.getAttribute("data-n") + " authors";
    }
    var m = e.target.closest(".tldr-more");
    if (m) {
      var row = m.parentNode, on = !row.classList.contains("open");
      row.classList.toggle("open", on);
      m.setAttribute("aria-expanded", String(on));
      m.firstChild.nodeValue = on ? "less" : "more";
    }
    var f = e.target.closest(".fig");
    if (f) openFigure(f);
  });

  /* ---------- Figure viewer (native <dialog>: Esc and focus trapping come with it) ---------- */

  var viewer = $("#fig-viewer"), opener = null;

  function openFigure(btn) {
    var p = PUBS.filter(function (x) { return x.id === btn.getAttribute("data-fig"); })[0];
    opener = btn;
    $("#fig-meta").innerHTML = metaHTML(p, true);
    $("#fig-title").textContent = p.title;
    $(".viewer-frame", viewer).innerHTML = '<img src="' + esc(p.figure) + '" alt="' + esc(p.figure_alt || "") +
      '" width="' + p.figure_w + '" height="' + p.figure_h + '" style="--ar:' + (p.figure_w / p.figure_h).toFixed(3) + '">';
    $("#fig-cap").textContent = p.figure_alt || "";
    // "Open image": the file on its own, for the browser's zoom (the figure path is relative, so not through href()).
    $("#fig-links").innerHTML = [linksHTML(p, paperLinks(p)), '<a href="' + esc(p.figure) + '">Open image</a>'].filter(Boolean).join(DOT);
    viewer.showModal();
    $(".viewer-close", viewer).focus();
  }
  // A click on the backdrop lands on the <dialog> itself; its content fills the box. A text selection that
  // starts inside and ends on the backdrop also clicks the <dialog>, so only a press that began there counts.
  var downOnBackdrop = false;
  viewer.addEventListener("pointerdown", function (e) { downOnBackdrop = e.target === viewer; });
  viewer.addEventListener("click", function (e) {
    if ((e.target === viewer && downOnBackdrop) || e.target.closest(".viewer-close")) viewer.close();
  });
  viewer.addEventListener("close", function () { if (opener) opener.focus(); });

  /* ---------- Section scroll-spy (aria-current on the matching nav link) ---------- */

  function setupSpy() {
    if (!("IntersectionObserver" in window)) return;
    var nav = $(".site-nav"), links = $$(".site-nav a"), sections = $$("main section[id]"), live = {};
    var update = function () {
      var h = location.hash.slice(1), t = document.getElementById(h), cur = null;
      // At the page end the last sections never reach the band: use the first one starting below it.
      var atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
      var seen = function (s) { var y = s.getBoundingClientRect().top; return atEnd ? y > innerHeight * .15 && y < innerHeight : live[s.id]; };
      // A clicked nav target wins over a neighbour that is also in view.
      if (sections.indexOf(t) > -1 && (live[h] || atEnd && t.getBoundingClientRect().bottom > 0)) cur = h;
      else sections.some(function (s) { return seen(s) && (cur = s.id); });
      if (!cur && atEnd) cur = sections[sections.length - 1].id;
      if (!cur) return;
      links.forEach(function (a) {
        if (a.getAttribute("href") !== "#" + cur) return a.removeAttribute("aria-current");
        if (a.hasAttribute("aria-current")) return;
        a.setAttribute("aria-current", "true");
        // On narrow screens the nav is a horizontal strip: keep the current link in view.
        if (nav.scrollWidth > nav.clientWidth) {
          nav.scrollLeft += a.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - a.offsetWidth) / 2;
        }
      });
    };
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { live[en.target.id] = en.isIntersecting; });
      update();
    }, { rootMargin: "-15% 0px -75% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
    window.addEventListener("hashchange", update);
    window.addEventListener("scroll", update, { passive: true });
  }

  /* ---------- Light / dark toggle (follows the OS until the visitor chooses) ---------- */

  function setupTheme() {
    var root = document.documentElement, btn = $(".theme-toggle");
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var apply = function (t) {
      root.setAttribute("data-theme", t);
      btn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
      // Mobile browser bar colour follows the toggle, not only the OS.
      var bg = getComputedStyle(root).getPropertyValue("--bg").trim();
      $$('meta[name="theme-color"]').forEach(function (m) { m.content = bg; });
    };
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try { localStorage.setItem("theme", next); } catch (e) { /* storage may be unavailable */ }
      apply(next);
    });
    if (mq.addEventListener) {
      mq.addEventListener("change", function () {
        var saved = null;
        try { saved = localStorage.getItem("theme"); } catch (e) { /* ignore */ }
        if (!saved) apply(mq.matches ? "dark" : "light");
      });
    }
    apply(root.getAttribute("data-theme") || (mq.matches ? "dark" : "light"));
    btn.hidden = false;
  }

  /* ---------- Init ---------- */

  renderSelected();
  fitTldr();
  if (document.fonts) document.fonts.ready.then(fitTldr);
  var fitQueued = false;
  window.addEventListener("resize", function () {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(function () { fitQueued = false; fitTldr(); });
  });
  setupFilters();
  renderPubs();
  setupThemes();
  setupTheme();
  setupSpy();
  checkAnchors();
  if (PUBS.some(function (p) { return /\*/.test(p.authors); })) $$(".eq-note").forEach(function (n) { n.hidden = false; });
  // Sideways-scrolling strips (small screens): keep the keyboard-focused item in view. Only for keyboard
  // focus (scrolling on a tap moves the item away before the click lands), and only sideways.
  [$(".site-nav"), $("#topic-chips")].forEach(function (s) {
    s.addEventListener("focusin", function (e) {
      if (!e.target.matches(":focus-visible")) return;
      var r = e.target.getBoundingClientRect(), b = s.getBoundingClientRect();
      if (r.left < b.left || r.right > b.right - 40) s.scrollLeft += r.left - b.left - (b.width - r.width) / 2;
    });
  });
  // Print the Highlights notes, which are otherwise inside closed "Details".
  window.addEventListener("beforeprint", function () { $$("#hl-cards details").forEach(function (d) { d.open = true; }); });
  window.addEventListener("hashchange", revealHash);
  if (location.hash) revealHash();
})();

import { library } from "./library.js";

const storageKey = "dune-manual-deck-v1";
const legacyKey = "uprising-deck-tracker-v1";
const editions = { uprising: "起义", base: "帝国本体", ix: "伊克斯崛起", immortality: "不朽" };
const cardByID = new Map(library.map(card => [card.id, card]));
const normalized = value => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const searchable = new Map(library.map(card => [card.id, [normalized(card.zh), normalized(card.en)]]));
const sortedLibrary = [...library].sort((a, b) => a.zh.localeCompare(b.zh, "zh-CN") || a.en.localeCompare(b.en, "en"));
const safe = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

const root = document.querySelector("#app");
const sheet = document.querySelector("#sheet");
const sheetTitle = document.querySelector("#sheet-title");
const sheetBody = document.querySelector("#sheet-body");
const notice = document.querySelector("#notice");
let noticeTimer;
let hasLegacy = false;
let history = [startingDeck("uprising")];
let view = "all";
let sheetMode = "";
let query = "";
const pickedEditions = new Set();

document.body.classList.add("manual");
document.title = "沙丘记牌器";
try {
  const saved = localStorage.getItem(storageKey);
  if (saved !== null) {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.length || !parsed.every(entries => Array.isArray(entries) &&
        entries.every(card => card && typeof card.id === "string" && typeof card.flipped === "boolean"))) {
      throw new Error("Invalid deck");
    }
    history = parsed;
  }
  hasLegacy = (JSON.parse(localStorage.getItem(legacyKey) || "[]")?.length ?? 0) > 0;
} catch {
  notify("暂时无法读取本机牌组。");
}

function startingDeck(edition) {
  return library.filter(card => card.set === edition && card.group === "starter")
    .flatMap(card => Array.from({length: card.count}, () => ({id: card.id, flipped: false})));
}

const deck = () => history.at(-1);
function lookup(id) {
  return cardByID.get(id) ?? {zh: id.replace(/^custom:/, ""), en: "", set: "", image: ""};
}

function notify(text) {
  const target = sheet.open ? sheetBody.querySelector(".sheet-notice") ?? notice : notice;
  notice.textContent = "";
  target.textContent = text;
  clearTimeout(noticeTimer);
  if (target === notice) noticeTimer = setTimeout(() => { notice.textContent = ""; }, 3000);
}

function save(updated) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(updated));
  } catch {
    notify("无法保存到这部手机。");
    return false;
  }
  history = updated;
  render();
  return true;
}

function record(next) {
  return save([...history.slice(-30), next]);
}

function thumb(card, cssClass) {
  return card.image
    ? '<img class="' + cssClass + '" src="' + card.image + '" alt="" loading="lazy" decoding="async">'
    : '<span class="' + cssClass + ' custom-art" aria-hidden="true">◇</span>';
}

function tile(entry, index) {
  const card = lookup(entry.id);
  const name = safe(card.zh);
  const action = entry.flipped ? "翻回" : "翻面";
  const faceDown = entry.flipped && view !== "flipped";
  const picture = faceDown
    ? '<span class="tile-back" aria-hidden="true"><span class="back-mark">◇</span><span>已翻面</span></span>'
    : thumb(card, "tile-art");
  return '<article class="deck-tile' + (faceDown ? " flipped" : "") + '">' +
    '<button type="button" class="tile-flip" data-action="flip" data-index="' + index +
    '" aria-label="' + action + name + '" aria-pressed="' + entry.flipped + '">' + picture +
    '<span class="tile-label"><strong>' + name + '</strong><small>' + safe(editions[card.set] || "自定义") + '</small></span></button>' +
    '<button type="button" class="tile-remove" data-action="remove" data-index="' + index +
    '" aria-label="删除' + name + '">−</button></article>';
}

function render() {
  const current = deck();
  const flipped = current.filter(card => card.flipped).length;
  const available = current.length - flipped;
  const visible = current.map((card,index)=>({card,index}))
    .filter(({card}) => view === "all" || card.flipped === (view === "flipped"));
  const tabs = [["all","全部",current.length],["draw","抽牌堆",available],["flipped","已翻面",flipped]];
  root.innerHTML =
    '<header class="manual-header"><div class="manual-title"><span>沙丘：帝国</span><h1>我的牌组</h1></div>' +
    '<div class="manual-tools"><button type="button" class="quiet" data-action="undo"' +
    (history.length < 2 ? " disabled" : "") + '>撤销</button>' +
    '<button type="button" class="quiet" data-action="reset-sheet">新牌组</button></div></header>' +
    '<section class="draw-overview" aria-label="牌组概况"><div><h2>抽牌堆</h2>' +
    '<p class="draw-value"><strong>' + available + '</strong><span>张</span></p></div>' +
    '<div class="deck-stats"><p>牌组总数 <strong>' + current.length + '</strong></p>' +
    '<p>已翻面 <strong>' + flipped + '</strong></p></div></section>' +
    '<div class="deck-controls"><p>点卡翻面，再点翻回。</p><button type="button" class="quiet" data-action="unflip-all"' +
    (!flipped ? " disabled" : "") + '>全部翻回</button></div>' +
    '<nav class="deck-tabs" aria-label="查看牌组">' + tabs.map(([key,label,count]) =>
      '<button type="button" data-action="view" data-value="' + key + '" aria-pressed="' + (view === key) +
      '">' + label + ' <span>' + count + '</span></button>').join("") + '</nav>' +
    (visible.length ? '<div class="deck-grid">' + visible.map(({card,index})=>tile(card,index)).join("") + '</div>' :
      '<p class="deck-empty">' + (current.length ? "这个视图里暂无卡牌。" : "牌组空了，可以通过下方添加卡牌。") + '</p>') +
    '<a class="legacy-link" href="./catalog.html">查看卡牌图鉴</a>' +
    (hasLegacy ? '<a class="legacy-link" href="?classic=1">打开旧版对局记录</a>' : "") +
    '<div class="deck-dock"><button id="add-card" type="button" class="accent" data-action="add-sheet">＋ 添加卡牌</button></div>';
}

function results() {
  const term = query.trim();
  const key = normalized(term);
  const matches = sortedLibrary.filter(card =>
    (!pickedEditions.size || pickedEditions.has(card.set)) &&
    (!key || searchable.get(card.id).some(name=>name.includes(key))));
  const exact = key && sortedLibrary.some(card => searchable.get(card.id).includes(key));
  const selectedResults = sheetBody.querySelector("#library-results");
  selectedResults.innerHTML =
    '<p class="search-total">' + matches.length + ' 种卡牌</p>' +
    (matches.length ? '<div class="library-list">' + matches.map(card =>
      '<button type="button" class="library-row" data-action="add" data-value="' + safe(card.id) +
      '" aria-label="添加' + safe(card.zh) + '（' + safe(editions[card.set]) + '）">' +
      thumb(card,"library-art") + '<span class="library-name"><strong>' + safe(card.zh) + '</strong>' +
      '<small>' + safe(editions[card.set]) + ' · ' + safe(card.en) + '</small></span><span class="library-plus">＋</span></button>'
    ).join("") + '</div>' : '<p class="deck-empty">没有找到匹配的卡牌。</p>') +
    (term && !exact ? '<button type="button" class="custom-add quiet" data-action="add" data-value="' + safe("custom:"+term) +
      '">添加自定义牌「' + safe(term) + '」</button>' : "");
}

function showSheet(mode) {
  sheetMode = mode;
  sheetTitle.textContent = mode === "add" ? "添加卡牌" : "新牌组";
  if (mode === "add") {
    query = "";
    pickedEditions.clear();
    sheetBody.innerHTML =
      '<label class="search-label"><span class="sr-only">搜索卡牌</span>' +
      '<input type="search" id="library-search" maxlength="64" placeholder="搜中文或英文牌名" autocomplete="off"></label>' +
      '<div class="edition-choices" aria-label="版本可多选">' + Object.entries(editions).map(([key,label]) =>
        '<button type="button" class="quiet" aria-pressed="false" data-action="edition" data-value="' + key + '">' + label + '</button>'
      ).join("") + '</div><p class="sheet-notice" role="status"></p><div id="library-results"></div>';
    results();
  } else {
    sheetBody.innerHTML =
      '<p class="reset-copy">选一套起始牌，或从空牌组开始。</p><div class="new-deck-options">' +
      '<button type="button" data-action="reset" data-value="uprising">起义 · 10 张</button>' +
      '<button type="button" data-action="reset" data-value="base">帝国本体 · 10 张</button>' +
      '<button type="button" data-action="reset" data-value="empty">空牌组</button></div><p class="sheet-notice" role="status"></p>';
  }
  sheetBody.scrollTop = 0;
  sheet.showModal();
}

document.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  const {action, value, index} = button.dataset;
  if (action === "flip" || action === "remove") {
    const selected = deck()[Number(index)];
    if (!selected) return;
    const next = [...deck()];
    if (action === "flip") next[Number(index)] = {...selected, flipped: !selected.flipped};
    else next.splice(Number(index), 1);
    if (record(next)) {
      notify(action === "remove" ? "已删除「" + lookup(selected.id).zh + "」" :
        (selected.flipped ? "已放回抽牌堆" : "已翻面"));
    }
  } else if (action === "undo") {
    if (history.length > 1 && save(history.slice(0, -1))) notify("已撤销");
  } else if (action === "unflip-all") {
    if (record(deck().map(card => ({...card, flipped: false})))) notify("已全部翻回");
  } else if (action === "view") {
    view = value;
    render();
  } else if (action === "add-sheet" || action === "reset-sheet") {
    showSheet(action === "add-sheet" ? "add" : "reset");
  } else if (action === "close") {
    sheet.close();
  } else if (action === "edition") {
    if (pickedEditions.has(value)) pickedEditions.delete(value);
    else pickedEditions.add(value);
    button.setAttribute("aria-pressed", String(pickedEditions.has(value)));
    results();
  } else if (action === "add") {
    if (!(cardByID.has(value) || value.startsWith("custom:"))) return;
    if (view === "flipped") view = "all";
    if (record([...deck(), {id: value, flipped: false}])) notify("已添加「" + lookup(value).zh + "」");
  } else if (action === "reset") {
    view = "all";
    if (record(startingDeck(value))) sheet.close();
  }
});
sheet.addEventListener("input", event => {
  if (event.target.id === "library-search") {
    query = event.target.value;
    results();
  }
});
sheet.addEventListener("close", () => {
  if (sheetMode === "add") document.querySelector("#add-card")?.focus();
  sheetMode = "";
  clearTimeout(noticeTimer);
});
render();

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

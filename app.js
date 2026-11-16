import { catalog, starter } from "./cards.js";
import { newGame, size, combine, add, remove, apply, drawCount, handCount, canDraw, candidates, handOptions, playArea } from "./core.js";

const root = document.querySelector("#app");
const sheet = document.querySelector("#sheet");
const sheetTitle = document.querySelector("#sheet-title");
const sheetBody = document.querySelector("#sheet-body");
const notice = document.querySelector("#notice");
const storageKey = "uprising-deck-tracker-v1";
const initial = newGame(starter);
const byID = new Map(catalog.map(card => [card.id, card]));
const title = id => byID.get(id)?.name ?? id.replace(/^custom:/, "");
const escapeHTML = value => String(value).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sorted = ids => [...ids].sort((a, b) => title(a).localeCompare(title(b), "zh-CN"));
const state = () => history.at(-1)?.state ?? initial;
const tabs = { deck: "抽牌堆", round: "本轮", discard: "弃牌堆", log: "记录" };
const modes = {
  play: "打出哪张牌？", reveal: "展示手牌", acquire: "获取卡牌", identify: "登记手牌",
  discard: "弃掉哪张手牌？", trash: "销毁哪张牌？", recover: "从弃牌堆取回",
  putOnTop: "放回抽牌堆顶", more: "牌操作", help: "怎么用", reset: "新开一局？",
};
const zones = { hand: "手牌", play: "场上", discard: "弃牌堆" };
const destinations = { discard: "弃牌堆", hand: "手牌", top: "抽牌堆顶" };
const phases = { between: "等待下一轮", agent: "特使阶段", reveal: "展示阶段" };
let history = [];
let tab = "deck";
let mode = "";
let zone = "hand";
let destination = "discard";
let selection = {};
let noticeTimer;

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  if (Array.isArray(saved) && saved.every(entry => entry?.state?.pool && typeof entry.note === "string")) history = saved;
} catch {
  showNotice("无法读取本机对局记录");
}

function showNotice(message) {
  notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.textContent = ""; }, 3600);
}

function save(next) {
  try { localStorage.setItem(storageKey, JSON.stringify(next)); }
  catch { showNotice("无法保存到这部手机"); return false; }
  history = next;
  render();
  return true;
}

function record(type, options) {
  const entry = apply(state(), { type, ...options }, title);
  if (!entry) { showNotice("操作与当前牌堆状态不符"); return; }
  if (save([...history, entry]) && sheet.open) sheet.close();
}

function button(label, action, value = "", style = "", disabled = false) {
  return `<button type="button" class="${style}" data-action="${action}" data-value="${escapeHTML(value)}"${disabled ? " disabled" : ""}>${escapeHTML(label)}</button>`;
}

function section(heading, body) {
  return `<section class="card-section"><h2>${escapeHTML(heading)}</h2>${body}</section>`;
}

function hint(message) { return `<p class="hint">${escapeHTML(message)}</p>`; }
function row(id, trailing = "", clickable = false) {
  const content = `<span class="card-label"><strong>${escapeHTML(title(id))}</strong>${byID.has(id) ? `<small lang="en">${escapeHTML(id)}</small>` : ""}</span>
    ${trailing === "" ? "" : `<span class="quantity">${escapeHTML(trailing)}</span>`}`;
  return clickable
    ? `<button type="button" class="card-row" data-action="card" data-value="${escapeHTML(id)}">${content}</button>`
    : `<div class="card-row">${content}</div>`;
}

function group(cards, clickable = false) {
  const ids = sorted(Object.keys(cards));
  return ids.length ? `<div class="card-list">${ids.map(id => row(id, `×${cards[id]}`, clickable)).join("")}</div>` : hint("暂无卡牌");
}

function content(s) {
  if (tab === "round") {
    return section("已登记手牌", group(s.hand) + (s.unknown ? button(`还有 ${s.unknown} 张手牌未登记`, "open", "identify", "quiet") : "")) +
      section("打出的牌", group(s.played)) + section("展示的牌", group(s.revealed));
  }
  if (tab === "discard") return section("弃牌堆", group(s.discard)) + section("本局已销毁", group(s.trashed));
  if (tab === "log") {
    const log = history.slice().reverse().map(entry => `<li><small>第 ${entry.state.round} 轮</small>${escapeHTML(entry.note)}</li>`).join("");
    return section("操作记录", log ? `<ol class="history">${log}</ol>` : hint("开局后，抽牌、出牌和获取卡牌会记在这里。"));
  }
  const entries = candidates(s).sort((a, b) => title(a.id).localeCompare(title(b.id), "zh-CN"));
  const caption = s.unknown ? `<p class="caption">${s.unknown} 张手牌未登记。右侧是每种牌可能剩余的张数。</p>` : "";
  const top = s.top.length ? `<p class="top-card">牌堆顶 · ${escapeHTML(title(s.top.at(-1)))}</p>` : "";
  const list = entries.length
    ? `<div class="card-list">${entries.map(c => row(c.id, c.min === c.max ? c.max : `${c.min}–${c.max}`)).join("")}</div>`
    : hint(canDraw(s) ? "下次抽牌时，先将弃牌堆洗成新的抽牌堆。" : "抽牌堆已空。");
  return section(s.unknown ? "可能在抽牌堆" : "抽牌堆组成", caption + top + list);
}

function render() {
  const s = state();
  let primary;
  if (s.phase === "between") primary = button(`开始第 ${s.round + 1} 轮 · 抽 5 张`, "record", "round", "accent");
  else if (s.phase === "agent") primary = button("打出", "open", "play", "accent", !handCount(s)) + button("展示", "reveal");
  else if (handCount(s)) primary = button("展示剩余手牌", "reveal", "", "accent");
  else primary = button("结算完毕 · 收入弃牌堆", "record", "cleanup", "accent");
  const metrics = [["手牌", handCount(s)], ["已打出", size(s.played)], ["已展示", size(s.revealed)], ["弃牌堆", size(s.discard)]];
  root.innerHTML = `
    <header class="masthead">
      <div><p class="eyebrow">沙丘：帝国 · 起义</p><h1>个人记牌器</h1></div>
      <div class="toolbar">${button("撤销", "undo", "", "quiet", !history.length)}${button("更多", "open", "help", "quiet")}</div>
    </header>
    <section class="deck-hero" aria-label="对局概况">
      <div class="deck-header"><span>${s.round ? `第 ${s.round} 轮` : "开局准备"}</span><span>${s.round ? phases[s.phase] : "标准起始牌组"}</span></div>
      <div class="deck-number"><strong>${drawCount(s)}</strong><span>张在抽牌堆</span></div>
      <div class="metrics">${metrics.map(([label, count]) => `<div><strong>${count}</strong><small>${label}</small></div>`).join("")}</div>
    </section>
    <div class="actions">${primary}</div>
    ${s.round ? `<div class="actions">${button("抽 1 张", "record", "draw", "", !canDraw(s))}${button("获取牌", "open", "acquire")}${button("牌操作", "open", "more")}</div>` : ""}
    <nav class="tabs" aria-label="查看牌区">${Object.entries(tabs).map(([key, name]) =>
      `<button type="button" data-action="tab" data-value="${key}" aria-pressed="${key === tab}">${name}</button>`).join("")}</nav>
    <div class="contents">${content(s)}</div>`;
}

function options() {
  const s = state();
  if (mode === "reveal" || mode === "identify") return s.unknown ? s.pool : {};
  if (mode === "recover") return s.discard;
  if (mode === "trash") return { hand: handOptions(s), play: playArea(s), discard: s.discard }[zone];
  return handOptions(s);
}

function selector(name, values, current) {
  return `<label class="field">${name}<select data-field="${name}">
    ${Object.entries(values).map(([key, value]) => `<option value="${key}"${key === current ? " selected" : ""}>${value}</option>`).join("")}
  </select></label>`;
}

function paintPurchase(query = "") {
  const s = state();
  const typed = query.trim();
  const search = typed.toLowerCase();
  const ids = new Set([...s.top, ...Object.keys(combine(s.pool, s.hand, s.played, s.revealed, s.discard, s.trashed))]);
  const custom = [...ids].filter(id => id.startsWith("custom:"));
  const matches = id => title(id).toLowerCase().includes(search) || id.toLowerCase().includes(search);
  const categories = [
    ["供给牌", catalog.filter(c => c.group === "reserve").map(c => c.id)],
    ["帝国牌", catalog.filter(c => c.group === "market").map(c => c.id)],
    ["自定义牌", custom],
  ];
  let markup = "";
  for (const [name, group] of categories) {
    const available = sorted(group.filter(matches));
    if (available.length) markup += section(name, `<div class="card-list">${available.map(id => row(id, byID.has(id) ? `${byID.get(id).number} 说服力` : "", true)).join("")}</div>`);
  }
  const exact = [...byID.keys(), ...custom].some(id => [id.toLowerCase(), title(id).toLowerCase()].includes(search));
  if (typed && !exact) markup += button(`加入自定义牌「${typed}」`, "card", "custom:" + typed, "quiet");
  sheetBody.querySelector("#results").innerHTML = markup;
}

function paintSheet() {
  const s = state();
  const available = options();
  if (mode === "help") {
    sheetBody.innerHTML = `<div class="help">
      <h3>添加到 iPhone 主屏幕</h3><p>用 Safari 打开本页，点分享 → 添加到主屏幕。如果看到「作为网页 App 打开」，保持开启。</p>
      <p>添加后，从主屏幕图标联网打开一次，再开始记牌。对局保存在这部手机。</p>
      <h3>实体对局怎么记</h3><p>每轮抽完起始手牌后点「开始第 N 轮」。额外抽牌点「抽 1 张」。打出或展示时补记牌名，结算后把场上的牌收入弃牌堆。</p>
      <p>获取牌默认进弃牌堆。抽牌堆用尽且还要抽时，弃牌堆会自动重洗。</p>
      <p>内置 63 个牌名与 Steam 简体中文版一致，购牌可以搜中文或英文。</p>
      ${button("新开一局", "open", "reset", "quiet", !history.length)}</div>`;
  } else if (mode === "reset") {
    sheetBody.innerHTML = hint("会清空当前记录，恢复标准 10 张起始牌。") + button("清空当前对局", "reset", "", "accent");
  } else if (mode === "more") {
    sheetBody.innerHTML = `<div class="menu-list">${[
      ["identify", !s.unknown], ["discard", !handCount(s)], ["trash", !handCount(s) && !size(playArea(s)) && !size(s.discard)],
      ["recover", !size(s.discard)], ["putOnTop", !handCount(s)],
    ].map(([key, disabled]) => button(modes[key], "open", key, "", disabled)).join("")}</div>`;
  } else if (mode === "acquire") {
    sheetBody.innerHTML = selector("卡牌去向", destinations, destination) +
      '<input type="search" maxlength="64" id="search" aria-label="搜索卡牌" placeholder="搜中文或英文牌名"><div id="results"></div>';
    paintPurchase();
  } else if (mode === "reveal") {
    const total = size(selection);
    const rows = sorted(Object.keys(available)).map(id => `<div class="reveal-row">${row(id, "", true)}
      ${button("−", "subtract", id, "step", !selection[id])}<span class="quantity">${selection[id] || 0}</span>
      ${button("+", "card", id, "step", total === s.unknown || (selection[id] || 0) === available[id])}</div>`).join("");
    sheetBody.innerHTML = `${s.unknown ? section(`补记牌名 ${total}/${s.unknown}`, `<div class="card-list">${rows}</div>`) : ""}
      ${size(s.hand) ? section("已登记的手牌会自动展示", group(s.hand)) : ""}
      <div class="confirm">${button("确认展示", "reveal-confirm", "", "accent", total !== s.unknown)}</div>`;
  } else {
    const controls = mode === "trash" ? selector("牌的位置", zones, zone) :
      mode === "recover" ? selector("卡牌去向", { hand: "手牌", top: "抽牌堆顶" }, destination) : "";
    sheetBody.innerHTML = controls + group(available, true);
  }
}

function open(next) {
  mode = next;
  const s = state();
  zone = handCount(s) ? "hand" : size(playArea(s)) ? "play" : "discard";
  destination = mode === "recover" ? "hand" : "discard";
  selection = {};
  sheetTitle.textContent = modes[mode];
  paintSheet();
  sheetBody.scrollTop = 0;
  if (!sheet.open) sheet.showModal();
}

document.addEventListener("click", event => {
  const target = event.target.closest("button[data-action]");
  if (!target || target.disabled) return;
  const { action, value } = target.dataset;
  switch (action) {
    case "open": open(value); break;
    case "close": sheet.close(); break;
    case "tab": tab = value; render(); break;
    case "record": record(value); break;
    case "undo": save(history.slice(0, -1)); break;
    case "reset": if (save([])) { tab = "deck"; render(); sheet.close(); } break;
    case "reveal": if (state().unknown) open("reveal"); else record("reveal"); break;
    case "reveal-confirm": record("reveal", { selection }); break;
    case "subtract": if (remove(selection, value)) paintSheet(); break;
    case "card":
      if (mode !== "reveal") record(mode, { id: value, where: mode === "trash" ? zone : destination });
      else if (size(selection) < state().unknown && (selection[value] ?? 0) < (state().pool[value] ?? 0)) {
        add(selection, value);
        paintSheet();
      }
      break;
  }
});
sheet.addEventListener("input", event => {
  if (event.target.id === "search") paintPurchase(event.target.value);
});
sheet.addEventListener("change", event => {
  if (event.target.dataset.field === "牌的位置") { zone = event.target.value; paintSheet(); }
  if (event.target.dataset.field === "卡牌去向") destination = event.target.value;
});
render();
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

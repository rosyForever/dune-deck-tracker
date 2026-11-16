const size = cards => Object.values(cards).reduce((total, count) => total + count, 0);
const add = (cards, id, count = 1) => { cards[id] = (cards[id] ?? 0) + count; };
const remove = (cards, id) => {
  if (!cards[id]) return false;
  if (cards[id] === 1) delete cards[id];
  else cards[id]--;
  return true;
};
const combine = (...groups) => {
  const cards = {};
  for (const group of groups) {
    for (const [id, count] of Object.entries(group)) add(cards, id, count);
  }
  return cards;
};

export { size, combine, add, remove };
export const newGame = starter => ({
  round: 0, phase: "between", shuffles: 0, pool: { ...starter }, unknown: 0,
  top: [], hand: {}, played: {}, revealed: {}, discard: {}, trashed: {},
});
export const drawCount = state => state.top.length + size(state.pool) - state.unknown;
export const handCount = state => size(state.hand) + state.unknown;
export const canDraw = state => drawCount(state) + size(state.discard) > 0;
export const handOptions = state => state.unknown ? combine(state.hand, state.pool) : state.hand;
export const playArea = state => combine(state.played, state.revealed);

export function candidates(state) {
  const top = {};
  for (const id of state.top) add(top, id);
  const unordered = size(state.pool) - state.unknown;
  return [...new Set([...Object.keys(state.pool), ...Object.keys(top)])].map(id => ({
    id,
    min: (top[id] ?? 0) + Math.max(0, (state.pool[id] ?? 0) - state.unknown),
    max: (top[id] ?? 0) + Math.min(state.pool[id] ?? 0, unordered),
  })).filter(candidate => candidate.max > 0);
}

function resolveHand(state) {
  if (!state.unknown) return;
  if (size(state.pool) === state.unknown) {
    state.hand = combine(state.hand, state.pool);
    state.pool = {};
    state.unknown = 0;
  } else if (Object.keys(state.pool).length === 1) {
    const id = Object.keys(state.pool)[0];
    add(state.hand, id, state.unknown);
    state.pool[id] -= state.unknown;
    state.unknown = 0;
  }
}

function removeFromHand(state, id) {
  if (remove(state.hand, id)) return true;
  if (!state.unknown || !remove(state.pool, id)) return false;
  state.unknown--;
  resolveHand(state);
  return true;
}

function draw(state, requested) {
  let drawn = 0;
  let reshuffled = false;
  while (drawn < requested) {
    if (drawCount(state) === 0) {
      if (!size(state.discard)) break;
      state.pool = state.discard;
      state.discard = {};
      state.shuffles++;
      reshuffled = true;
    }
    if (state.top.length) add(state.hand, state.top.pop());
    else {
      state.unknown++;
      resolveHand(state);
    }
    drawn++;
  }
  const count = drawn === requested ? drawn : `${drawn}/${requested}`;
  return `抽 ${count} 张${reshuffled ? " · 重洗弃牌堆" : ""}`;
}

const destinations = { discard: "弃牌堆", hand: "手牌", top: "抽牌堆顶" };

function place(state, id, where) {
  if (where === "top") state.top.push(id);
  else add(state[where], id);
}

export function apply(previous, action, title) {
  const state = structuredClone(previous);
  const { type, id, where } = action;
  const card = id ? title(id) : "";
  let note;
  switch (type) {
    case "round":
      if (state.phase !== "between") return null;
      state.round++;
      state.phase = "agent";
      note = `第 ${state.round} 轮 · ${draw(state, 5)}`;
      break;
    case "draw":
      if (!state.round || !canDraw(state)) return null;
      note = draw(state, 1);
      break;
    case "identify":
      if (!state.unknown || !remove(state.pool, id)) return null;
      state.unknown--;
      add(state.hand, id);
      resolveHand(state);
      note = `登记手牌 · ${card}`;
      break;
    case "play":
      if (state.phase !== "agent" || !removeFromHand(state, id)) return null;
      add(state.played, id);
      note = `打出 · ${card}`;
      break;
    case "reveal": {
      const selection = action.selection ?? {};
      if (state.phase === "between" || size(selection) !== state.unknown ||
          Object.entries(selection).some(([key, count]) => count < 1 || count > (state.pool[key] ?? 0))) return null;
      const shown = combine(state.hand, selection);
      for (const [key, count] of Object.entries(selection)) {
        for (let index = 0; index < count; index++) remove(state.pool, key);
      }
      state.unknown = 0;
      state.hand = {};
      state.revealed = combine(state.revealed, shown);
      state.phase = "reveal";
      const names = Object.entries(shown).map(([key, count]) => title(key) + (count > 1 ? ` ×${count}` : ""));
      note = "展示 · " + (names.join("、") || "无手牌");
      break;
    }
    case "cleanup": {
      if (state.phase !== "reveal" || handCount(state)) return null;
      const played = playArea(state);
      state.discard = combine(state.discard, played);
      state.played = {};
      state.revealed = {};
      state.phase = "between";
      note = `结算完毕 · ${size(played)} 张进入弃牌堆`;
      break;
    }
    case "acquire":
      if (!id || !Object.hasOwn(destinations, where)) return null;
      place(state, id, where);
      note = `获取 · ${card} → ${destinations[where]}`;
      break;
    case "discard":
      if (!removeFromHand(state, id)) return null;
      add(state.discard, id);
      note = `弃掉 · ${card}`;
      break;
    case "trash": {
      const zones = { hand: "手牌", play: "场上", discard: "弃牌堆" };
      const removed = where === "hand" ? removeFromHand(state, id) :
        where === "play" ? remove(state.played, id) || remove(state.revealed, id) :
        where === "discard" && remove(state.discard, id);
      if (!removed) return null;
      add(state.trashed, id);
      note = `销毁 · ${card}（${zones[where]}）`;
      break;
    }
    case "recover":
      if (!["hand", "top"].includes(where) || !remove(state.discard, id)) return null;
      place(state, id, where);
      note = `取回 · ${card} → ${destinations[where]}`;
      break;
    case "putOnTop":
      if (!removeFromHand(state, id)) return null;
      state.top.push(id);
      note = `放回牌堆顶 · ${card}`;
      break;
    default: return null;
  }
  return { state, note };
}

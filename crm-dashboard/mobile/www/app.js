import { CANCEL_REASONS, DEFAULT_RULES, applySync, blockers, cartFromOrder, cartLines, cleanServerUrl, isOffline, lastOrderFor, linesToConfirm, makeOrder, money, parseQty, receiptText, setQty, total, units } from "./logic.js";

/* ---------- storage: everything the app needs is kept on the phone ---------- */

const KEY = "das.orders.v1";
const blank = { server: null, user: null, catalog: null, queue: [], history: [], lastSync: null };
let S = load();
function load() {
  try {
    return { ...blank, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...blank };
  }
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {
    /* storage full: the app keeps working until it is closed */
  }
}

/* ---------- talking to the CRM ---------- */

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "content-type": "application/json" };
  if (auth && S.user) headers.authorization = `Bearer builtin:${S.user.id}`;
  const res = await fetch(`${S.server}/das-api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw Object.assign(new Error(data?.title || `The server answered ${res.status}.`), { status: res.status });
  return data;
}

let online = true;
let syncing = false;
async function sync({ quiet = false } = {}) {
  if (syncing || !S.server || !S.user) return;
  syncing = true;
  try {
    if (S.queue.length) {
      const pending = S.queue.filter((o) => !o.error);
      if (pending.length) {
        const r = await api("/orders/sync", { method: "POST", body: { orders: pending } });
        S.queue = applySync(S.queue, r.results);
      }
    }
    S.catalog = await api("/orders/catalog");
    S.history = await api("/orders/mine");
    S.lastSync = new Date().toISOString();
    online = true;
    persist();
  } catch (e) {
    if (isOffline(e)) online = false;
    else if (!quiet) toast(e.message, "bad");
  } finally {
    syncing = false;
    render();
  }
}
window.addEventListener("online", () => sync({ quiet: true }));
window.addEventListener("offline", () => { online = false; render(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) sync({ quiet: true }); });
setInterval(() => { if (S.queue.some((o) => !o.error)) sync({ quiet: true }); }, 30000);

/* ---------- small helpers ---------- */

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const $ = (sel, root = document) => root.querySelector(sel);
const app = document.getElementById("app");
let toastMsg = null;
function toast(msg, kind = "ok") {
  toastMsg = { msg, kind };
  render();
  setTimeout(() => { toastMsg = null; render(); }, 4000);
}

/* ---------- screens ---------- */

let tab = "new"; // new | outbox
let draft = null; // { customer, cart, notes, search, step: "pick"|"items"|"review", confirmed: {} }
let setup = { error: null, users: null, busy: false };
let detail = null; // id of a sent order being viewed
let cancelling = false;

function header(title) {
  const pending = S.queue.filter((o) => !o.error).length;
  return `<header class="top"><h1>${esc(title)}</h1>
    <span class="pill" id="net">${online ? "Online" : "Offline"}</span>
    ${pending ? `<span class="pill">${pending} waiting</span>` : ""}</header>`;
}

function render() {
  const keep = document.activeElement?.id;
  const sel = keep ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  if (!S.server || !S.user) app.innerHTML = setupView();
  else app.innerHTML = mainView();
  if (toastMsg) app.insertAdjacentHTML("afterbegin", `<div class="note ${toastMsg.kind}" role="status" style="margin:8px 16px">${esc(toastMsg.msg)}</div>`);
  if (keep && $(`#${keep}`)) {
    const el = $(`#${keep}`);
    el.focus();
    if (sel && el.setSelectionRange && el.type !== "number") try { el.setSelectionRange(...sel); } catch { /* not a text field */ }
  }
}

function setupView() {
  if (!S.server) {
    return `${header("DAS Orders")}<main><div class="card"><h2>Connect to the CRM</h2>
      <p class="muted">Enter the address of the DAS Engage 360 server, for example the office PC's address on the Wi-Fi.</p>
      <label for="server">Server address</label>
      <input id="server" inputmode="url" autocapitalize="off" autocomplete="off" placeholder="192.168.1.20:3000" value="${esc(setup.value ?? "")}" />
      ${setup.error ? `<div class="note bad">${esc(setup.error)}</div>` : ""}
      <p><button id="connect" ${setup.busy ? "disabled" : ""}>${setup.busy ? "Connecting…" : "Connect"}</button></p></div></main>`;
  }
  const reps = (setup.users ?? []).filter((u) => u.role === "Rep" || u.role === "AreaManager");
  return `${header("DAS Orders")}<main><div class="card"><h2>Who are you?</h2>
    <p class="muted">Connected to ${esc(S.server)}</p>
    ${setup.error ? `<div class="note bad">${esc(setup.error)}</div>` : ""}
    <div class="list">${reps.map((u) => `<div class="item"><div class="grow"><div class="name">${esc(u.fullName)}</div><div class="muted">${esc(u.role)}${u.territory ? " · " + esc(u.territory) : ""}</div></div><button data-user="${esc(u.id)}">Sign in</button></div>`).join("") || '<p class="muted">Loading…</p>'}</div>
    <p><button class="ghost" id="change-server">Use a different server</button></p></div></main>`;
}

function mainView() {
  if (detail && !draft) return detailView();
  return `${header(draft ? "New order" : "DAS Orders")}
    ${draft ? "" : `<nav class="tabs"><button data-tab="new" class="${tab === "new" ? "on" : ""}">New order</button><button data-tab="outbox" class="${tab === "outbox" ? "on" : ""}">Orders${S.queue.length ? ` (${S.queue.length})` : ""}</button></nav>`}
    ${draft ? draftView() : tab === "new" ? homeView() : outboxView()}`;
}

function homeView() {
  const when = S.lastSync ? new Date(S.lastSync).toLocaleString("en-GB") : "never";
  return `<main><div class="card"><h2>Hello, ${esc(S.user.fullName.split(" ")[0])}</h2>
    <p class="muted">${S.catalog ? `${S.catalog.products.length} products and ${S.catalog.customers.length} customers on this phone. Updated ${esc(when)}.` : "No catalog yet. Connect to the internet and tap Sync."}</p>
    <p><button id="start" ${S.catalog ? "" : "disabled"}>Start a new order</button> <button class="ghost" id="sync">${syncing ? "Syncing…" : "Sync now"}</button></p></div>
    <p><button class="ghost" id="signout">Sign out</button></p></main>`;
}

function draftView() {
  const rules = S.catalog?.rules ?? DEFAULT_RULES;
  if (draft.step === "pick") {
    const q = draft.search.toLowerCase();
    const cs = S.catalog.customers.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.city ?? "").toLowerCase().includes(q)).slice(0, 60);
    return `<main><div class="card"><h2>Who is the order for?</h2>
      <input id="search" placeholder="Search customers" autocomplete="off" value="${esc(draft.search)}" />
      <div class="list">${cs.map((c) => `<div class="item" data-customer="${esc(c.id)}"><div class="grow"><div class="name">${esc(c.name)}</div><div class="muted">${esc(c.city ?? "")} · ${esc(c.channel)}</div></div><span>›</span></div>`).join("") || '<p class="muted">No match.</p>'}</div></div></main>
      <div class="bar"><button class="ghost" id="cancel">Cancel</button></div>`;
  }
  const lines = cartLines(draft.cart, S.catalog.products, draft.customer);
  if (draft.step === "items") {
    const q = draft.search.toLowerCase();
    const ps = S.catalog.products.filter((p) => !q || p.name.toLowerCase().includes(q));
    return `<main><div class="card"><div class="row"><div class="grow"><div class="name">${esc(draft.customer.name)}</div><div class="muted">${esc(draft.customer.city ?? "")}</div></div><button class="ghost" id="back-customer">Change</button></div>
      ${lastOrderFor(S.history, draft.customer.id) && !Object.keys(draft.cart).length ? `<p><button class="ghost" id="repeat-last">Repeat last order (${esc(new Date(lastOrderFor(S.history, draft.customer.id).orderedAt).toLocaleDateString("en-GB"))})</button></p>` : ""}</div>
      <div class="card"><input id="search" placeholder="Search products" autocomplete="off" value="${esc(draft.search)}" />
      <div class="list">${ps.map((p) => itemRow(p)).join("")}</div></div></main>${itemsBar(lines)}`;
  }
  // review
  const need = linesToConfirm(lines, rules);
  const block = blockers(lines, rules);
  const ready = !block && need.every((l) => draft.confirmed[l.productId] === l.qty);
  return `<main><div class="card"><h2>Check the order</h2><div class="muted">${esc(draft.customer.name)}</div>
    <div class="list">${lines.map((l) => `<div class="item"><div class="grow"><div class="name">${esc(l.name)}</div><div class="muted">${l.qty} × ${money(l.unitPrice)}</div></div><b>${money(l.qty * l.unitPrice)}</b></div>`).join("")}</div>
    <p class="row"><span class="grow">${units(lines)} units</span><b>${money(total(lines))}</b></p>
    ${block ? `<div class="note bad">${esc(block)}</div>` : ""}
    ${need.map((l) => draft.confirmed[l.productId] === l.qty
      ? `<div class="confirm done">✓ ${l.qty} × ${esc(l.name)} confirmed</div>`
      : `<div class="confirm"><div>Large quantity. Is this right?</div><div class="big">${l.qty} × ${esc(l.name)}</div><button data-confirm="${esc(l.productId)}">Yes, ${l.qty} is right</button></div>`).join("")}
    <label for="notes">Note (optional)</label><textarea id="notes" rows="2" maxlength="500">${esc(draft.notes)}</textarea></div></main>
    <div class="bar"><button class="ghost" id="back-items">Edit</button><button id="save" ${ready ? "" : "disabled"} style="flex:1">Save order</button></div>`;
}

function itemRow(p) {
  const qty = draft.cart[p.id] ?? 0;
  return `<div class="item" data-row="${esc(p.id)}"><div class="grow"><div class="name">${esc(p.name)}</div><div class="muted">${money(p.listPrice)}${p.therapeuticArea ? " · " + esc(p.therapeuticArea) : ""}${p.availability ? ` · <span class="stock ${p.availability === "In stock" ? "ok" : p.availability === "Low" ? "low" : "out"}">${esc(p.availability)}</span>` : ""}</div></div>
    <div class="step"><button data-dec="${esc(p.id)}" aria-label="Fewer">−</button><input data-qty="${esc(p.id)}" id="q-${esc(p.id)}" type="text" inputmode="numeric" value="${qty || ""}" placeholder="0" aria-label="Quantity of ${esc(p.name)}" /><button data-inc="${esc(p.id)}" aria-label="More">+</button></div></div>`;
}

function itemsBar(lines) {
  return `<div class="bar" id="itemsbar"><div class="sum"><b>${money(total(lines))}</b><div class="muted">${units(lines)} units · ${lines.length} products</div></div><button class="ghost" id="cancel">Cancel</button><button id="review" ${lines.length ? "" : "disabled"}>Review</button></div>`;
}

function detailView() {
  const o = S.history.find((x) => x.id === detail);
  if (!o) { detail = null; return mainView(); }
  const canCancel = o.status === "Placed";
  return `${header("Order")}<main><div class="card"><div class="row"><h2 class="grow">${esc(o.customerName)}</h2><span class="badge ${o.status === "Delivered" ? "ok" : o.status === "Cancelled" ? "bad" : ""}">${esc(o.status)}</span></div>
    <div class="muted">${new Date(o.orderedAt).toLocaleString("en-GB")} · Ref ${esc(String(o.id).slice(-8).toUpperCase())}</div>
    <div class="list">${o.lines.map((l) => `<div class="item"><div class="grow"><div class="name">${esc(l.name)}</div><div class="muted">${l.qty} × ${money(l.unitPrice)}</div></div><b>${money(l.qty * l.unitPrice)}</b></div>`).join("") || '<p class="muted">No line detail.</p>'}</div>
    <p class="row"><span class="grow">${o.units} units</span><b>${money(o.value)}</b></p>
    ${o.notes ? `<div class="muted">Note: ${esc(o.notes)}</div>` : ""}
    ${o.cancelReason ? `<div class="note bad">Cancelled: ${esc(o.cancelReason)}</div>` : ""}
    ${cancelling ? `<div class="confirm"><div>Why is it being cancelled?</div>${CANCEL_REASONS.map((r) => `<button class="ghost" data-cancel-reason="${esc(r)}">${esc(r)}</button>`).join("")}<button class="ghost" id="cancel-no">Keep the order</button></div>` : ""}
  </div></main>
  <div class="bar actions"><button class="ghost" id="detail-back">Back</button><button class="ghost" id="share">Share receipt</button>${o.lines.length ? '<button class="ghost" id="repeat-detail">Repeat</button>' : ""}${canCancel && !cancelling ? '<button class="danger" id="cancel-order">Cancel order</button>' : ""}</div>`;
}

function outboxView() {
  const q = S.queue;
  return `<main>
    ${q.length ? `<div class="card"><h2>On this phone</h2><div class="list">${q.map((o) => `<div class="item"><div class="grow"><div class="name">${esc(o.customerName)}</div><div class="muted">${o.units} units · ${money(o.value)} · ${new Date(o.at).toLocaleString("en-GB")}</div>${o.error ? `<div class="note bad">${esc(o.error)}</div>` : ""}</div>${o.error ? `<button class="danger" data-drop="${esc(o.clientId)}">Delete</button>` : '<span class="badge wait">Waiting</span>'}</div>`).join("")}</div>
    <p><button id="sync">${syncing ? "Syncing…" : "Send now"}</button></p></div>` : '<div class="card"><p class="muted">Nothing waiting. Saved orders are sent when there is a connection.</p></div>'}
    <div class="card"><h2>Sent</h2><div class="list">${S.history.map((o) => `<div class="item" data-detail="${esc(o.id)}"><div class="grow"><div class="name">${esc(o.customerName)}</div><div class="muted">${o.units} units · ${money(o.value)} · ${new Date(o.orderedAt).toLocaleDateString("en-GB")}</div></div><span class="badge ${o.status === "Delivered" ? "ok" : o.status === "Cancelled" ? "bad" : ""}">${esc(o.status)}</span></div>`).join("") || '<p class="muted">No sent orders yet.</p>'}</div></div></main>`;
}

/* ---------- actions ---------- */

async function connect() {
  const url = cleanServerUrl($("#server")?.value);
  setup.value = $("#server")?.value;
  if (!url) { setup.error = "That does not look like a server address."; return render(); }
  setup.busy = true; setup.error = null; render();
  try {
    S.server = url;
    const cfg = await api("/auth/config", { auth: false });
    if (cfg.mode !== "demo") throw Object.assign(new Error("This server uses Microsoft sign-in, which the app cannot do yet. Ask your administrator."), { status: 0 });
    setup.users = await api("/demo/users", { auth: false });
    persist();
  } catch (e) {
    S.server = null;
    setup.error = e.status === 0 || e.status ? e.message : "Could not reach the server. Check the address and that this phone is on the same network.";
  }
  setup.busy = false;
  render();
}

function signIn(id) {
  const u = setup.users.find((x) => x.id === id);
  S.user = { id: u.id, fullName: u.fullName, role: u.role };
  persist();
  render();
  sync();
}

function startDraft() {
  draft = { customer: null, cart: {}, notes: "", search: "", step: "pick", confirmed: {} };
  render();
}

function updateItems() {
  const lines = cartLines(draft.cart, S.catalog.products, draft.customer);
  const bar = $("#itemsbar");
  if (bar) bar.outerHTML = itemsBar(lines);
}

function changeQty(id, qty) {
  const q = Math.min(qty, 999999);
  draft.cart = setQty(draft.cart, id, q);
  delete draft.confirmed[id];
  const input = $(`#q-${CSS.escape(id)}`);
  if (input && input !== document.activeElement) input.value = draft.cart[id] || "";
  updateItems();
}

function startRepeat(order, customerId) {
  const customer = S.catalog.customers.find((c) => c.id === customerId);
  if (!customer) return toast("That customer is no longer on your list.", "bad");
  const { cart, skipped } = cartFromOrder(order, S.catalog.products);
  draft = { customer, cart, notes: "", search: "", step: "items", confirmed: {} };
  detail = null;
  render();
  if (skipped.length) toast(`Not in the catalog any more: ${skipped.join(", ")}.`, "warn");
}

async function shareReceipt(o) {
  const text = receiptText(o, S.user.fullName);
  try {
    if (navigator.share) { await navigator.share({ title: "DAS PLC order", text }); return; }
    await navigator.clipboard.writeText(text);
    toast("Receipt copied. Paste it into a message.");
  } catch (e) {
    if (e?.name !== "AbortError") toast("Could not share the receipt.", "bad");
  }
}

async function cancelOrder(o, reason) {
  try {
    await api(`/orders/${encodeURIComponent(o.id)}/cancel`, { method: "POST", body: { reason } });
    cancelling = false;
    await sync({ quiet: true });
    toast("Order cancelled.");
  } catch (e) {
    cancelling = false;
    toast(isOffline(e) ? "You need a connection to cancel an order that has been sent." : e.message, "bad");
  }
}

function saveOrder() {
  const lines = cartLines(draft.cart, S.catalog.products, draft.customer);
  S.queue.push(makeOrder(draft.customer, lines, draft.notes));
  persist();
  draft = null;
  tab = "outbox";
  render();
  toast("Order saved on this phone.");
  sync({ quiet: true });
}

/* ---------- events ---------- */

app.addEventListener("click", (e) => {
  const t = e.target.closest("button, [data-customer], [data-detail]");
  if (!t) return;
  const d = t.dataset;
  if (t.id === "connect") return connect();
  if (t.id === "change-server") { S.server = null; setup = { error: null, users: null, busy: false, value: "" }; persist(); return render(); }
  if (d.user) return signIn(d.user);
  if (t.id === "signout") { S.user = null; persist(); return render(); }
  if (d.tab) { tab = d.tab; return render(); }
  if (d.detail) { detail = d.detail; cancelling = false; return render(); }
  if (t.id === "detail-back") { detail = null; cancelling = false; return render(); }
  if (t.id === "share") return shareReceipt(S.history.find((x) => x.id === detail));
  if (t.id === "repeat-detail") { const o = S.history.find((x) => x.id === detail); return startRepeat(o, o.customerId); }
  if (t.id === "repeat-last") return startRepeat(lastOrderFor(S.history, draft.customer.id), draft.customer.id);
  if (t.id === "cancel-order") { cancelling = true; return render(); }
  if (t.id === "cancel-no") { cancelling = false; return render(); }
  if (d.cancelReason) return cancelOrder(S.history.find((x) => x.id === detail), d.cancelReason);
  if (t.id === "sync") return sync();
  if (t.id === "start") return startDraft();
  if (t.id === "cancel") { draft = null; return render(); }
  if (d.customer) { draft.customer = S.catalog.customers.find((c) => c.id === d.customer); draft.step = "items"; draft.search = ""; return render(); }
  if (t.id === "back-customer") { draft.step = "pick"; draft.search = ""; return render(); }
  if (d.inc) return changeQty(d.inc, (draft.cart[d.inc] ?? 0) + 1);
  if (d.dec) return changeQty(d.dec, Math.max(0, (draft.cart[d.dec] ?? 0) - 1));
  if (t.id === "review") { draft.step = "review"; draft.search = ""; return render(); }
  if (t.id === "back-items") { draft.step = "items"; return render(); }
  if (d.confirm) { draft.confirmed[d.confirm] = draft.cart[d.confirm]; return render(); }
  if (t.id === "save") return saveOrder();
  if (d.drop) { S.queue = S.queue.filter((o) => o.clientId !== d.drop); persist(); return render(); }
});

app.addEventListener("input", (e) => {
  const el = e.target;
  if (el.id === "search" && draft) { draft.search = el.value; return render(); }
  if (el.id === "notes" && draft) { draft.notes = el.value; return; }
  if (el.dataset.qty) {
    const text = el.value.trim();
    if (text === "") return changeQty(el.dataset.qty, 0);
    const n = parseQty(text);
    // Letters, decimals and minus signs are refused as they are typed.
    if (n === null) { el.value = draft.cart[el.dataset.qty] || ""; return; }
    changeQty(el.dataset.qty, n);
  }
});

render();
if (S.server && S.user) sync({ quiet: true });

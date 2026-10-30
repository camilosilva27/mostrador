/* Mostrador · interfaz
   Tres pantallas sobre los mismos datos (js/store.js): app del cliente, bandeja de pedidos y stock.
   Todo texto que viene del usuario o de los datos pasa por esc() antes de ir al HTML. */
(function () {
  'use strict';

  var S = window.Store;
  var LOW = S.info.lowStockThreshold;
  var VIEWS = ['cliente', 'pedidos', 'stock'];
  var CLIENT_KEY = 'mostrador:' + S.info.id + ':cliente';

  /* ---------- utilidades ---------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  function money(n) { return '$' + nf.format(Math.round(n || 0)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function relTime(iso) {
    var d = new Date(iso), now = new Date();
    var mins = Math.round((now - d) / 60000);
    var hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (mins < 1) return 'Recién';
    if (mins < 60) return 'Hace ' + mins + ' min';
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return 'Hoy, ' + hm;
    if (d.toDateString() === y.toDateString()) return 'Ayer, ' + hm;
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ', ' + hm;
  }
  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var CAT_CLASS = {
    'Frutas y Verduras': 'cat-verdu',
    'Lácteos y Huevos': 'cat-lacteos',
    'Panadería': 'cat-pan',
    'Carnes y Pescados': 'cat-carnes',
    'Almacén': 'cat-almacen',
    'Bebidas': 'cat-bebidas'
  };
  function thumb(name, category, size) {
    return '<span class="thumb ' + (CAT_CLASS[category] || 'cat-almacen') + (size ? ' thumb-' + size : '') +
      '" aria-hidden="true">' + esc(initials(name)) + '</span>';
  }

  var ICON = {
    search: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
    plus: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    back: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    check: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    send: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-5 16-3.5-6.5z"/><path d="m11.5 13.5 4-4"/></svg>',
    phone: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/></svg>',
    chat: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.3 18.6z"/></svg>',
    edit: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
    trash: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/></svg>',
    bag: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
    pin: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>'
  };

  /* Conserva el foco y el cursor cuando se re-pinta una región con un input adentro */
  function paint(el, html) {
    if (!el) return;
    var active = document.activeElement;
    var key = active && el.contains(active) ? active.getAttribute('data-focus') : null;
    var selStart = key && 'selectionStart' in active ? active.selectionStart : null;
    var scroll = el.scrollTop;
    el.innerHTML = html;
    el.scrollTop = scroll;
    if (key) {
      var again = el.querySelector('[data-focus="' + key + '"]');
      if (again) {
        again.focus({ preventScroll: true });
        try { if (selStart != null) again.setSelectionRange(selStart, selStart); } catch (e) { /* select/number */ }
      }
    }
  }

  /* ---------- estado de interfaz ---------- */
  function loadClient() {
    var base = { step: 'browse', cart: {}, name: '', phone: '', sentId: null };
    try {
      var saved = JSON.parse(localStorage.getItem(CLIENT_KEY) || 'null');
      if (saved && typeof saved === 'object') return Object.assign(base, saved);
    } catch (e) { /* sin almacenamiento */ }
    return base;
  }

  var ui = {
    view: 'cliente',
    cliente: Object.assign(loadClient(), { cat: 'Todos', search: '' }),
    pedidos: { filter: 'all', selectedId: null, showDetail: false },
    stock: { search: '', cat: 'Todos', lowOnly: false, editingId: null, draft: null, confirmDelete: null }
  };

  function saveClient() {
    var c = ui.cliente;
    try {
      localStorage.setItem(CLIENT_KEY, JSON.stringify({ step: c.step, cart: c.cart, name: c.name, phone: c.phone, sentId: c.sentId }));
    } catch (e) { /* sin almacenamiento */ }
  }

  /* El carrito solo conserva productos que existen y con stock disponible */
  function cleanCart() {
    var c = ui.cliente, changed = false;
    Object.keys(c.cart).forEach(function (id) {
      var p = S.getProduct(+id);
      var max = p ? p.stock : 0;
      if (c.cart[id] > max) { changed = true; if (max > 0) c.cart[id] = max; else delete c.cart[id]; }
    });
    if (c.step === 'review' && !Object.keys(c.cart).length) { c.step = 'browse'; changed = true; }
    if (c.step === 'sent' && !S.getRequest(c.sentId)) { c.step = 'browse'; c.sentId = null; changed = true; }
    if (changed) saveClient();
  }

  function cartLines() {
    var lines = [];
    Object.keys(ui.cliente.cart).forEach(function (id) {
      var p = S.getProduct(+id);
      if (p) lines.push({ product: p, qty: ui.cliente.cart[id] });
    });
    return lines;
  }
  function cartCount() { return cartLines().reduce(function (a, l) { return a + l.qty; }, 0); }
  function cartTotal() { return cartLines().reduce(function (a, l) { return a + l.qty * l.product.price; }, 0); }
  function requestTotal(r) { return r.items.reduce(function (a, i) { return a + i.qty * i.price; }, 0); }
  function requestUnits(r) { return r.items.reduce(function (a, i) { return a + i.qty; }, 0); }

  var STATUS = {
    new: { label: 'Nuevo', pill: 'pill-new', idx: 0 },
    ready: { label: 'Listo para retirar', pill: 'pill-ready', idx: 1 },
    done: { label: 'Completado', pill: 'pill-done', idx: 2 }
  };

  /* =====================================================================
     APP DEL CLIENTE
     ===================================================================== */
  var vCliente = $('#view-cliente');

  function renderCliente() {
    cleanCart();
    var c = ui.cliente;
    var body;
    if (c.step === 'review') body = clienteReviewShell();
    else if (c.step === 'sent') body = clienteSentShell();
    else body = clienteBrowseShell();

    vCliente.innerHTML =
      '<div class="cliente-layout">' +
        '<div class="phone">' + body + '</div>' +
        '<aside class="cliente-aside" aria-labelledby="aside-title">' +
          '<h2 id="aside-title">Así le llega al almacén</h2>' +
          '<p class="aside-lead">Cada pedido que mandás desde acá entra al instante en la bandeja de Pedidos, y el stock que se edita en el local se ve en el catálogo.</p>' +
          '<div data-region="aside"></div>' +
        '</aside>' +
      '</div>';
    refreshCliente();
  }

  function refreshCliente() {
    cleanCart();
    var c = ui.cliente;
    if (c.step === 'browse') {
      paint($('[data-region="catalogo"]', vCliente), catalogueHTML());
      paint($('[data-region="cartbar"]', vCliente), cartBarHTML());
    } else if (c.step === 'review') {
      paint($('[data-region="review"]', vCliente), reviewItemsHTML());
      updateSendState();
    } else if (c.step === 'sent') {
      paint($('[data-region="sent"]', vCliente), sentHTML());
    }
    paint($('[data-region="aside"]', vCliente), asideHTML());
  }

  function clienteHeader(title, withBack) {
    return '<header class="phone-top">' +
      (withBack ? '<button class="icon-btn" type="button" data-action="go-browse" aria-label="Volver al catálogo">' + ICON.back + '</button>' : '') +
      '<div class="phone-top-text">' +
        '<h1 id="cliente-title">' + esc(title) + '</h1>' +
        '<p class="phone-sub">' + ICON.pin + '<span>Retiro en el local · ' + esc(S.info.town) + '</span></p>' +
      '</div>' +
    '</header>';
  }

  function clienteBrowseShell() {
    var c = ui.cliente;
    var cats = ['Todos'].concat(S.categories);
    return clienteHeader(S.info.name, false) +
      '<div class="phone-tools">' +
        '<label class="search">' + ICON.search +
          '<span class="sr-only">Buscar productos</span>' +
          '<input type="search" data-focus="c-search" data-input="cliente-search" placeholder="Buscar yerba, leche, pan…" value="' + esc(c.search) + '" autocomplete="off">' +
        '</label>' +
        '<div class="chips" role="group" aria-label="Categorías">' +
          cats.map(function (cat) {
            return '<button type="button" class="chip" data-action="cliente-cat" data-cat="' + esc(cat) + '" aria-pressed="' + (c.cat === cat) + '">' + esc(cat) + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="phone-body" data-region="catalogo"></div>' +
      '<div class="cartbar-slot" data-region="cartbar"></div>';
  }

  function catalogueHTML() {
    var c = ui.cliente;
    var q = c.search.trim().toLowerCase();
    var list = S.getProducts().filter(function (p) {
      return (c.cat === 'Todos' || p.category === c.cat) && (!q || p.name.toLowerCase().indexOf(q) >= 0);
    });
    if (!list.length) {
      return '<div class="empty"><p><strong>No encontramos “' + esc(c.search.trim() || c.cat) + '”.</strong></p>' +
        '<p>Probá con otra palabra o mirá todas las categorías.</p>' +
        '<button type="button" class="btn-outline" data-action="cliente-clear">Ver todo</button></div>';
    }
    // agrupado por categoría, en el orden del almacén
    var groups = S.categories.map(function (cat) {
      return { cat: cat, items: list.filter(function (p) { return p.category === cat; }) };
    }).filter(function (g) { return g.items.length; });
    return groups.map(function (g) {
      return '<section class="cat-group" aria-label="' + esc(g.cat) + '">' +
        '<h2 class="cat-title">' + esc(g.cat) + '</h2>' +
        '<ul class="product-list">' + g.items.map(productRowHTML).join('') + '</ul>' +
      '</section>';
    }).join('');
  }

  function productRowHTML(p) {
    var qty = ui.cliente.cart[p.id] || 0;
    var soldOut = p.stock <= 0;
    var hint = soldOut ? '' : (p.stock <= LOW ? '<span class="hint-low">Solo quedan ' + p.stock + '</span>' : '');
    var control;
    if (soldOut) control = '<span class="pill pill-out">Agotado</span>';
    else if (!qty) control = '<button type="button" class="btn-add" data-action="cart-inc" data-id="' + p.id + '" aria-label="Agregar ' + esc(p.name) + '">' + ICON.plus + '<span>Agregar</span></button>';
    else control = stepperHTML(p, qty, 'cart');
    return '<li class="product' + (soldOut ? ' is-out' : '') + (qty ? ' in-cart' : '') + '">' +
      thumb(p.name, p.category) +
      '<div class="product-text">' +
        '<p class="product-name">' + esc(p.name) + '</p>' +
        '<p class="product-meta"><span class="price">' + money(p.price) + '</span> · ' + esc(p.unit) + hint + '</p>' +
      '</div>' +
      '<div class="product-ctl">' + control + '</div>' +
    '</li>';
  }

  function stepperHTML(p, qty, kind) {
    var max = kind === 'cart' ? p.stock : Infinity;
    return '<div class="stepper" role="group" aria-label="Cantidad de ' + esc(p.name) + '">' +
      '<button type="button" data-action="' + kind + '-dec" data-id="' + p.id + '" aria-label="Quitar uno">' + ICON.minus + '</button>' +
      '<output aria-live="polite">' + qty + '</output>' +
      '<button type="button" data-action="' + kind + '-inc" data-id="' + p.id + '" aria-label="Sumar uno"' + (qty >= max ? ' disabled' : '') + '>' + ICON.plus + '</button>' +
    '</div>';
  }

  function cartBarHTML() {
    var n = cartCount();
    if (!n) return '';
    return '<button type="button" class="cartbar" data-action="go-review">' +
      '<span class="cartbar-count">' + ICON.bag + plural(n, 'producto', 'productos') + '</span>' +
      '<span class="cartbar-cta">Ver pedido</span>' +
      '<span class="cartbar-total">' + money(cartTotal()) + '</span>' +
    '</button>';
  }

  function clienteReviewShell() {
    var c = ui.cliente;
    return clienteHeader('Tu pedido', true) +
      '<div class="phone-body review">' +
        '<div data-region="review"></div>' +
        '<form class="details" data-form="send" novalidate>' +
          '<h2 class="block-title">Tus datos para el retiro</h2>' +
          '<label class="field"><span>Nombre</span>' +
            '<input type="text" name="name" data-input="cliente-name" data-focus="c-name" autocomplete="name" placeholder="Ej.: Marta Benítez" value="' + esc(c.name) + '" maxlength="60"></label>' +
          '<label class="field"><span>Teléfono o WhatsApp</span>' +
            '<input type="tel" name="phone" data-input="cliente-phone" data-focus="c-phone" autocomplete="tel" inputmode="tel" placeholder="Ej.: 2323 45-6789" value="' + esc(c.phone) + '" maxlength="30"></label>' +
          '<p class="send-hint" id="send-hint"></p>' +
          '<button type="submit" class="btn-send" aria-describedby="send-hint">' +
            '<span class="btn-send-label">' + ICON.send + 'Enviar pedido</span><span class="btn-send-total" data-send-total></span>' +
          '</button>' +
          '<p class="fineprint">Pagás al retirar, en efectivo o con transferencia.</p>' +
        '</form>' +
      '</div>';
  }

  function reviewItemsHTML() {
    var lines = cartLines();
    return '<ul class="review-list">' + lines.map(function (l) {
      var p = l.product;
      return '<li class="review-line">' + thumb(p.name, p.category) +
        '<div class="product-text"><p class="product-name">' + esc(p.name) + '</p>' +
        '<p class="product-meta">' + money(p.price) + ' · ' + esc(p.unit) + '</p></div>' +
        '<div class="review-right">' + stepperHTML(p, l.qty, 'cart') +
        '<span class="line-total num">' + money(p.price * l.qty) + '</span></div>' +
      '</li>';
    }).join('') + '</ul>' +
    '<div class="review-total"><span>Total estimado</span><strong class="num">' + money(cartTotal()) + '</strong></div>';
  }

  function updateSendState() {
    var c = ui.cliente;
    var btn = $('.btn-send', vCliente);
    if (!btn) return;
    var n = cartCount();
    var missing = [];
    if (!c.name.trim()) missing.push('tu nombre');
    if (!c.phone.trim()) missing.push('tu teléfono');
    var ok = n > 0 && !missing.length;
    btn.disabled = !ok;
    $('[data-send-total]', vCliente).textContent = money(cartTotal());
    $('#send-hint', vCliente).textContent = !n ? 'Tu pedido está vacío.' : (missing.length ? 'Completá ' + missing.join(' y ') + ' para enviarlo.' : 'Listo para enviar.');
  }

  function clienteSentShell() {
    return clienteHeader('Pedido enviado', false) + '<div class="phone-body" data-region="sent"></div>';
  }

  function sentHTML() {
    var r = S.getRequest(ui.cliente.sentId);
    if (!r) return '';
    var idx = STATUS[r.status].idx;
    var steps = [
      { label: 'Recibido', sub: 'El almacén ya tiene tu pedido.' },
      { label: 'Listo para retirar', sub: 'Pasá a buscarlo por el local.' },
      { label: 'Completado', sub: 'Retirado. ¡Gracias por tu compra!' }
    ];
    var headline = idx === 0 ? 'Lo estamos preparando' : (idx === 1 ? 'Tu pedido está listo' : 'Pedido retirado');
    return '<div class="sent">' +
      '<div class="sent-head">' +
        '<span class="sent-check' + (idx >= 1 ? ' is-ready' : '') + '">' + ICON.check + '</span>' +
        '<div><p class="sent-number">Pedido <span class="mono">#' + r.id + '</span></p>' +
        '<h2 class="sent-title">' + headline + '</h2></div>' +
      '</div>' +
      '<p class="sent-lead">Te avisamos al <strong>' + esc(r.phone) + '</strong> cuando esté para retirar.</p>' +
      '<ol class="timeline">' + steps.map(function (s, i) {
        var state = i < idx ? 'done' : (i === idx ? 'current' : 'todo');
        if (idx === 2 && i === 2) state = 'done';
        return '<li class="tl-step is-' + state + '"><span class="tl-dot">' + ICON.check + '</span>' +
          '<div><p class="tl-label">' + s.label + '</p><p class="tl-sub">' + s.sub + '</p></div></li>';
      }).join('') + '</ol>' +
      '<div class="sent-summary">' +
        '<h3 class="block-title">Resumen</h3>' +
        '<ul>' + r.items.map(function (i) {
          return '<li><span>' + i.qty + ' × ' + esc(i.name) + '</span><span class="num">' + money(i.qty * i.price) + '</span></li>';
        }).join('') + '</ul>' +
        '<p class="sent-total"><span>Total estimado</span><strong class="num">' + money(requestTotal(r)) + '</strong></p>' +
      '</div>' +
      '<button type="button" class="btn-outline wide" data-action="cliente-new">Hacer otro pedido</button>' +
    '</div>';
  }

  function asideHTML() {
    var reqs = S.getRequests().slice(0, 4);
    return '<ul class="aside-list">' + reqs.map(function (r) {
      var st = STATUS[r.status];
      var mine = r.id === ui.cliente.sentId;
      return '<li class="' + (mine ? 'is-mine' : '') + '">' +
        '<div><p class="aside-name"><span class="mono">#' + r.id + '</span> ' + esc(r.customerName) + (mine ? ' <span class="you">(vos)</span>' : '') + '</p>' +
        '<p class="aside-meta">' + relTime(r.createdAt) + ' · ' + plural(requestUnits(r), 'unidad', 'unidades') + '</p></div>' +
        '<span class="pill ' + st.pill + '">' + st.label + '</span>' +
      '</li>';
    }).join('') + '</ul>' +
    '<a class="btn-outline" href="#pedidos">Abrir la bandeja de pedidos</a>';
  }

  function cartAdd(id, d) {
    var p = S.getProduct(id);
    if (!p) return;
    var c = ui.cliente;
    var q = Math.min((c.cart[id] || 0) + d, p.stock);
    if (q <= 0) delete c.cart[id]; else c.cart[id] = q;
    saveClient();
    refreshCliente();
  }

  function sendRequest() {
    var c = ui.cliente;
    var items = cartLines().map(function (l) { return { productId: l.product.id, qty: l.qty }; });
    if (!items.length || !c.name.trim() || !c.phone.trim()) { updateSendState(); return; }
    var req = S.createRequest({ customerName: c.name, phone: c.phone, items: items });
    c.cart = {}; c.sentId = req.id; c.step = 'sent';
    saveClient();
    renderCliente();
    window.scrollTo(0, 0);
  }

  /* =====================================================================
     PEDIDOS (bandeja de la tienda)
     ===================================================================== */
  var vPedidos = $('#view-pedidos');

  function renderPedidos() {
    var P = ui.pedidos;
    var all = S.getRequests();
    var counts = { all: all.length, new: 0, ready: 0, done: 0 };
    all.forEach(function (r) { counts[r.status]++; });
    var list = all.filter(function (r) { return P.filter === 'all' || r.status === P.filter; });
    if (!P.selectedId || !all.some(function (r) { return r.id === P.selectedId; })) {
      P.selectedId = (list[0] || all[0] || {}).id || null;
    }
    var sel = all.filter(function (r) { return r.id === P.selectedId; })[0];
    var products = S.getProducts();
    var tabs = [['all', 'Todos'], ['new', 'Nuevos'], ['ready', 'Listos'], ['done', 'Completados']];
    var pendingTotal = all.filter(function (r) { return r.status !== 'done'; }).reduce(function (a, r) { return a + requestTotal(r); }, 0);

    var prevList = $('.inbox-list', vPedidos);
    var listScroll = prevList ? prevList.scrollTop : 0;

    vPedidos.innerHTML =
      '<div class="title-row">' +
        '<div><h1 id="pedidos-title">Pedidos</h1>' +
        '<p class="title-sub">' + (counts.new ? plural(counts.new, 'pedido nuevo', 'pedidos nuevos') + ' para preparar' : 'Nada nuevo por preparar') +
        ' · ' + counts.ready + ' esperando retiro · ' + money(pendingTotal) + ' a cobrar</p></div>' +
      '</div>' +
      '<div class="tabs" role="tablist" aria-label="Filtrar pedidos">' + tabs.map(function (t) {
        return '<button type="button" role="tab" class="tab" data-action="pedidos-filter" data-filter="' + t[0] + '" aria-selected="' + (P.filter === t[0]) + '">' +
          t[1] + ' <span class="tab-count num">' + counts[t[0]] + '</span></button>';
      }).join('') + '</div>' +
      '<div class="inbox' + (P.showDetail ? ' show-detail' : '') + '">' +
        '<div class="inbox-list" role="list">' + (list.length ? list.map(function (r) {
          var st = STATUS[r.status];
          return '<button type="button" role="listitem" class="req-row' + (r.id === P.selectedId ? ' is-selected' : '') + (r.status === 'new' ? ' is-new' : '') +
            '" data-action="pedidos-select" data-id="' + r.id + '" aria-current="' + (r.id === P.selectedId) + '">' +
            '<span class="avatar" aria-hidden="true">' + esc(initials(r.customerName)) + '</span>' +
            '<span class="req-main"><span class="req-line1"><span class="req-name">' + esc(r.customerName) + '</span><span class="req-time">' + relTime(r.createdAt) + '</span></span>' +
            '<span class="req-line2"><span class="mono">#' + r.id + '</span> · ' + plural(requestUnits(r), 'unidad', 'unidades') + ' · <span class="num">' + money(requestTotal(r)) + '</span></span></span>' +
            '<span class="pill ' + st.pill + '">' + (r.status === 'ready' ? 'Listo' : st.label) + '</span>' +
          '</button>';
        }).join('') : '<p class="empty-inline">No hay pedidos en esta lista.</p>') + '</div>' +
        '<div class="inbox-detail">' + (sel ? detailHTML(sel, products) : '<div class="empty"><p>Todavía no entró ningún pedido.</p></div>') + '</div>' +
      '</div>';

    var newList = $('.inbox-list', vPedidos);
    if (newList) newList.scrollTop = listScroll;
  }

  function waLink(r) {
    var d = String(r.phone).replace(/\D/g, '');
    if (d.indexOf('54') !== 0) d = '549' + d.replace(/^0/, '');
    var first = r.customerName.split(' ')[0];
    var msg = 'Hola ' + first + ', tu pedido #' + r.id + ' en ' + S.info.name + ' ya está listo para retirar. Total: ' + money(requestTotal(r)) + '.';
    return 'https://wa.me/' + d + '?text=' + encodeURIComponent(msg);
  }

  function detailHTML(r, products) {
    var st = STATUS[r.status];
    var byId = {};
    products.forEach(function (p) { byId[p.id] = p; });
    var shortCount = 0;
    var rows = r.items.map(function (i) {
      var p = byId[i.productId];
      var tag = '';
      if (r.status === 'new') {
        if (!p) tag = '<span class="pill pill-out">Sin catálogo</span>';
        else if (p.stock <= 0) tag = '<span class="pill pill-out">Sin stock</span>';
        else if (p.stock < i.qty) tag = '<span class="pill pill-low">Poco stock · quedan ' + p.stock + '</span>';
        if (tag) shortCount++;
      }
      return '<tr><td><div class="cell-product">' + thumb(i.name, p ? p.category : 'Almacén', 'sm') +
        '<div><p class="cell-name">' + esc(i.name) + '</p><p class="cell-sub">' + esc(i.unit) + (tag ? ' ' + tag : '') + '</p></div></div></td>' +
        '<td class="r num">' + i.qty + '</td><td class="r num hide-sm">' + money(i.price) + '</td><td class="r num">' + money(i.qty * i.price) + '</td></tr>';
    }).join('');
    var steps = ['Recibido', 'Listo para retirar', 'Completado'];
    var action = r.status === 'new' ? 'Marcar listo para retirar' : (r.status === 'ready' ? 'Marcar como retirado' : '');

    return '<button type="button" class="back-link" data-action="pedidos-back">' + ICON.back + 'Todos los pedidos</button>' +
      '<div class="detail-head">' +
        '<div><h2 class="detail-title">Pedido <span class="mono">#' + r.id + '</span></h2>' +
        '<p class="title-sub">' + relTime(r.createdAt) + ' · retiro en el local</p></div>' +
        '<span class="pill ' + st.pill + '">' + st.label + '</span>' +
      '</div>' +
      '<div class="customer">' +
        '<span class="avatar avatar-lg" aria-hidden="true">' + esc(initials(r.customerName)) + '</span>' +
        '<div class="customer-text"><p class="customer-name">' + esc(r.customerName) + '</p><p class="cell-sub">' + esc(r.phone) + '</p></div>' +
        '<div class="customer-actions">' +
          '<a class="btn-outline sm" href="tel:' + esc(String(r.phone).replace(/[^\d+]/g, '')) + '">' + ICON.phone + '<span>Llamar</span></a>' +
          '<a class="btn-outline sm" href="' + esc(waLink(r)) + '" target="_blank" rel="noopener">' + ICON.chat + '<span>WhatsApp</span></a>' +
        '</div>' +
      '</div>' +
      '<ol class="progress" aria-label="Estado del pedido">' + steps.map(function (s, i) {
        var state = i < st.idx || st.idx === 2 ? 'done' : (i === st.idx ? 'current' : 'todo');
        return '<li class="pg-step is-' + state + '"><span class="tl-dot">' + ICON.check + '</span><span>' + s + '</span></li>';
      }).join('') + '</ol>' +
      (shortCount ? '<p class="warn-line">' + plural(shortCount, 'producto no alcanza', 'productos no alcanzan') + ' con el stock actual. Avisale al cliente antes de prepararlo.</p>' : '') +
      '<table class="items"><thead><tr><th>Producto</th><th class="r">Cant.</th><th class="r hide-sm">Precio</th><th class="r">Subtotal</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td>' + plural(requestUnits(r), 'unidad', 'unidades') + '</td><td></td><td class="hide-sm"></td><td class="r num total">' + money(requestTotal(r)) + '</td></tr></tfoot></table>' +
      '<div class="detail-actions">' +
        (action ? '<button type="button" class="btn-primary" data-action="pedidos-advance" data-id="' + r.id + '">' + ICON.check + action + '</button>'
          : '<p class="done-line">' + ICON.check + 'Retirado y cobrado.</p>') +
      '</div>';
  }

  /* =====================================================================
     STOCK
     ===================================================================== */
  var vStock = $('#view-stock');

  function stockStatus(p) {
    if (p.stock <= 0) return { label: 'Sin stock', pill: 'pill-out', key: 'out' };
    if (p.stock <= LOW) return { label: 'Poco stock', pill: 'pill-low', key: 'low' };
    return { label: 'En stock', pill: 'pill-ok', key: 'ok' };
  }

  function renderStock() {
    var T = ui.stock;
    var cats = ['Todos'].concat(S.categories);
    vStock.innerHTML =
      '<div class="title-row">' +
        '<div><h1 id="stock-title">Stock</h1><p class="title-sub">Lo que cambies acá se ve al instante en el catálogo del cliente. Poco stock: ' + LOW + ' unidades o menos.</p></div>' +
        '<button type="button" class="btn-primary" data-action="stock-add">' + ICON.plus + 'Agregar producto</button>' +
      '</div>' +
      '<div class="kpis" data-region="kpis"></div>' +
      '<div class="toolbar">' +
        '<label class="search">' + ICON.search + '<span class="sr-only">Buscar en el stock</span>' +
          '<input type="search" data-input="stock-search" data-focus="s-search" placeholder="Buscar producto" value="' + esc(T.search) + '" autocomplete="off"></label>' +
        '<div class="chips" role="group" aria-label="Categorías">' + cats.map(function (c) {
          return '<button type="button" class="chip chip-sm" data-action="stock-cat" data-cat="' + esc(c) + '" aria-pressed="' + (T.cat === c) + '">' + esc(c) + '</button>';
        }).join('') + '</div>' +
        '<button type="button" class="toggle" data-action="stock-low" aria-pressed="' + T.lowOnly + '"><span class="toggle-track" aria-hidden="true"></span>Solo poco stock</button>' +
      '</div>' +
      '<div data-region="rows"></div>';
    refreshStock();
  }

  function refreshStock() {
    var all = S.getProducts();
    var low = all.filter(function (p) { return p.stock > 0 && p.stock <= LOW; }).length;
    var out = all.filter(function (p) { return p.stock <= 0; }).length;
    paint($('[data-region="kpis"]', vStock),
      '<div class="kpi"><p class="kpi-label">Productos en el catálogo</p><p class="kpi-value num">' + all.length + '</p></div>' +
      '<div class="kpi"><p class="kpi-label">Poco stock</p><p class="kpi-value num' + (low ? ' is-warn' : '') + '">' + low + '</p></div>' +
      '<div class="kpi"><p class="kpi-label">Sin stock</p><p class="kpi-value num' + (out ? ' is-bad' : '') + '">' + out + '</p></div>');
    paint($('[data-region="rows"]', vStock), stockTableHTML(all));
  }

  function stockTableHTML(all) {
    var T = ui.stock;
    var q = T.search.trim().toLowerCase();
    var rows = all.filter(function (p) {
      return (T.cat === 'Todos' || p.category === T.cat) && (!q || p.name.toLowerCase().indexOf(q) >= 0) && (!T.lowOnly || p.stock <= LOW);
    });
    var html = '';
    if (T.editingId === 'new') html += editRowHTML({ id: 'new' });
    html += rows.map(function (p) { return T.editingId === p.id ? editRowHTML(p) : viewRowHTML(p); }).join('');
    var count = '<p class="table-count">' + plural(rows.length, 'producto', 'productos') + (rows.length !== all.length ? ' de ' + all.length : '') + '</p>';
    if (!rows.length && T.editingId !== 'new') {
      return count + '<div class="empty"><p><strong>Ningún producto coincide con el filtro.</strong></p>' +
        '<button type="button" class="btn-outline" data-action="stock-clear">Limpiar filtros</button></div>';
    }
    return count + '<table class="stock-table">' +
      '<thead><tr><th>Producto</th><th>Categoría</th><th class="r">Precio</th><th class="r">Stock</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead>' +
      '<tbody>' + html + '</tbody></table>';
  }

  function viewRowHTML(p) {
    var st = stockStatus(p);
    var confirming = ui.stock.confirmDelete === p.id;
    return '<tr class="stock-row is-' + st.key + '">' +
      '<td class="c-product"><div class="cell-product">' + thumb(p.name, p.category, 'sm') +
        '<div><p class="cell-name">' + esc(p.name) + '</p><p class="cell-sub"><span>' + esc(p.unit) + '</span><span class="show-sm"><strong class="num">' + money(p.price) + '</strong> · ' + esc(p.category) + '</span></p></div></div></td>' +
      '<td class="c-cat">' + esc(p.category) + '</td>' +
      '<td class="c-price r num">' + money(p.price) + '</td>' +
      '<td class="c-stock r">' + stepperHTML(p, p.stock, 'stock') + '</td>' +
      '<td class="c-status"><span class="pill ' + st.pill + '">' + st.label + '</span></td>' +
      '<td class="c-actions r">' + (confirming
        ? '<span class="confirm"><button type="button" class="btn-danger sm" data-action="stock-remove" data-id="' + p.id + '">Eliminar</button><button type="button" class="btn-text" data-action="stock-remove-cancel">No</button></span>'
        : '<button type="button" class="icon-btn" data-action="stock-edit" data-id="' + p.id + '" aria-label="Editar ' + esc(p.name) + '">' + ICON.edit + '</button>' +
          '<button type="button" class="icon-btn" data-action="stock-remove-ask" data-id="' + p.id + '" aria-label="Eliminar ' + esc(p.name) + '">' + ICON.trash + '</button>') +
      '</td></tr>';
  }

  function editRowHTML(p) {
    var d = ui.stock.draft;
    return '<tr class="edit-row"><td colspan="6">' +
      '<form class="edit-form" data-form="stock-save" novalidate>' +
        '<p class="edit-title">' + (p.id === 'new' ? 'Producto nuevo' : 'Editar producto') + '</p>' +
        '<div class="edit-grid">' +
          '<label class="field f-name"><span>Nombre</span><input type="text" data-draft="name" data-focus="d-name" value="' + esc(d.name) + '" maxlength="60" required placeholder="Ej.: Galletitas de agua"></label>' +
          '<label class="field f-unit"><span>Presentación</span><input type="text" data-draft="unit" data-focus="d-unit" value="' + esc(d.unit) + '" maxlength="24" placeholder="Ej.: 300 g"></label>' +
          '<label class="field f-cat"><span>Categoría</span><select data-draft="category" data-focus="d-cat">' + S.categories.map(function (c) {
            return '<option' + (c === d.category ? ' selected' : '') + '>' + esc(c) + '</option>';
          }).join('') + '</select></label>' +
          '<label class="field f-price"><span>Precio ($)</span><input type="number" min="0" step="10" inputmode="numeric" data-draft="price" data-focus="d-price" value="' + esc(d.price) + '"></label>' +
          '<label class="field f-stock"><span>Stock</span><input type="number" min="0" step="1" inputmode="numeric" data-draft="stock" data-focus="d-stock" value="' + esc(d.stock) + '"></label>' +
        '</div>' +
        '<div class="edit-actions">' +
          '<button type="submit" class="btn-primary sm">' + ICON.check + 'Guardar</button>' +
          '<button type="button" class="btn-outline sm" data-action="stock-cancel">Cancelar</button>' +
        '</div>' +
      '</form></td></tr>';
  }

  function startEdit(id) {
    var T = ui.stock;
    if (id === 'new') T.draft = { name: '', unit: '', category: T.cat !== 'Todos' ? T.cat : 'Almacén', price: '', stock: '' };
    else {
      var p = S.getProduct(id);
      if (!p) return;
      T.draft = { name: p.name, unit: p.unit, category: p.category, price: String(p.price), stock: String(p.stock) };
    }
    T.editingId = id; T.confirmDelete = null;
    refreshStock();
    var first = $('[data-draft="name"]', vStock);
    if (first) first.focus();
  }

  function saveEdit() {
    var T = ui.stock, d = T.draft;
    if (!d.name.trim()) { var f = $('[data-draft="name"]', vStock); if (f) { f.focus(); f.setAttribute('aria-invalid', 'true'); } return; }
    var saved = S.saveProduct({ id: T.editingId === 'new' ? null : T.editingId, name: d.name, unit: d.unit, category: d.category, price: d.price, stock: d.stock });
    T.editingId = null; T.draft = null;
    refreshStock();
    toast('Guardado: ' + saved.name);
  }

  /* =====================================================================
     NAVEGACIÓN, BADGE, TOAST
     ===================================================================== */
  function viewFromHash() {
    var h = (location.hash || '').replace('#', '');
    return VIEWS.indexOf(h) >= 0 ? h : 'cliente';
  }

  function setView(v) {
    ui.view = v;
    VIEWS.forEach(function (name) { $('#view-' + name).hidden = name !== v; });
    $all('[data-view-link]').forEach(function (a) {
      if (a.getAttribute('data-view-link') === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.body.setAttribute('data-view', v);
    renderCurrent();
  }

  function renderCurrent() {
    if (ui.view === 'cliente') renderCliente();
    else if (ui.view === 'pedidos') renderPedidos();
    else renderStock();
    updateBadge();
  }

  function updateBadge() {
    var n = S.getRequests().filter(function (r) { return r.status === 'new'; }).length;
    var b = $('[data-new-badge]');
    b.hidden = !n;
    b.textContent = n;
    b.setAttribute('aria-label', plural(n, 'pedido nuevo', 'pedidos nuevos'));
    document.title = (n ? '(' + n + ') ' : '') + 'Mostrador · ' + S.info.name;
  }

  var toastTimer = null;
  function toast(msg, action) {
    var t = $('.toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<a href="' + esc(action.href) + '">' + esc(action.label) + '</a>' : '');
    t.hidden = false;
    t.classList.remove('is-in'); void t.offsetWidth; t.classList.add('is-in');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }

  /* ---------- cambios en los datos (esta pestaña u otra) ---------- */
  S.subscribe(function (change) {
    if (change.type === 'reset') {
      ui.cliente = Object.assign({ step: 'browse', cart: {}, name: '', phone: '', sentId: null, cat: 'Todos', search: '' });
      ui.pedidos.selectedId = null; ui.pedidos.showDetail = false;
      ui.stock.editingId = null; ui.stock.draft = null; ui.stock.confirmDelete = null;
      saveClient();
      renderCurrent();
      return;
    }
    if (change.remote && change.type === 'request' && change.created) {
      var r = S.getRequest(change.id);
      if (r && ui.view !== 'cliente') toast('Entró el pedido #' + r.id + ' de ' + r.customerName, { href: '#pedidos', label: 'Ver' });
    }
    if (ui.view === 'cliente') refreshCliente();
    else if (ui.view === 'pedidos') renderPedidos();
    else refreshStock();
    updateBadge();
  });

  /* ---------- eventos ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var a = el.getAttribute('data-action');
    var id = el.hasAttribute('data-id') ? +el.getAttribute('data-id') : null;
    var c = ui.cliente, P = ui.pedidos, T = ui.stock;
    switch (a) {
      case 'reset-demo':
        if (window.confirm('¿Reiniciar la demo? Se borran los pedidos y cambios de stock y vuelven los datos de ejemplo.')) {
          try { localStorage.removeItem(CLIENT_KEY); } catch (err) { /* nada */ }
          S.reset();
          toast('Demo reiniciada con los datos de ejemplo');
        }
        break;
      /* cliente */
      case 'cliente-cat': c.cat = el.getAttribute('data-cat'); $all('[data-action="cliente-cat"]', vCliente).forEach(function (b) { b.setAttribute('aria-pressed', String(b === el)); }); refreshCliente(); break;
      case 'cliente-clear': c.cat = 'Todos'; c.search = ''; renderCliente(); break;
      case 'cart-inc': cartAdd(id, 1); break;
      case 'cart-dec': cartAdd(id, -1); break;
      case 'go-review': if (cartCount()) { c.step = 'review'; saveClient(); renderCliente(); window.scrollTo(0, 0); } break;
      case 'go-browse': c.step = 'browse'; saveClient(); renderCliente(); break;
      case 'cliente-new': c.step = 'browse'; c.sentId = null; c.cat = 'Todos'; c.search = ''; saveClient(); renderCliente(); window.scrollTo(0, 0); break;
      /* pedidos */
      case 'pedidos-filter': P.filter = el.getAttribute('data-filter'); P.selectedId = null; P.showDetail = false; renderPedidos(); break;
      case 'pedidos-select': P.selectedId = id; P.showDetail = true; renderPedidos(); if (window.matchMedia('(max-width: 860px)').matches) window.scrollTo(0, 0); break;
      case 'pedidos-back': P.showDetail = false; renderPedidos(); break;
      case 'pedidos-advance': {
        var r = S.advanceRequest(id);
        if (r) toast(r.status === 'ready' ? 'Pedido #' + r.id + ' listo para retirar' : 'Pedido #' + r.id + ' completado');
        break;
      }
      /* stock */
      case 'stock-add': T.search = ''; T.cat = 'Todos'; T.lowOnly = false; renderStock(); startEdit('new'); break;
      case 'stock-edit': startEdit(id); break;
      case 'stock-cancel': T.editingId = null; T.draft = null; refreshStock(); break;
      case 'stock-inc': S.adjustStock(id, 1); break;
      case 'stock-dec': S.adjustStock(id, -1); break;
      case 'stock-remove-ask': T.confirmDelete = id; refreshStock(); break;
      case 'stock-remove-cancel': T.confirmDelete = null; refreshStock(); break;
      case 'stock-remove': {
        var p = S.getProduct(id);
        T.confirmDelete = null;
        S.removeProduct(id);
        if (p) toast('Eliminado: ' + p.name);
        break;
      }
      case 'stock-cat': T.cat = el.getAttribute('data-cat'); $all('[data-action="stock-cat"]', vStock).forEach(function (b) { b.setAttribute('aria-pressed', String(b === el)); }); refreshStock(); break;
      case 'stock-low': T.lowOnly = !T.lowOnly; el.setAttribute('aria-pressed', String(T.lowOnly)); refreshStock(); break;
      case 'stock-clear': T.search = ''; T.cat = 'Todos'; T.lowOnly = false; renderStock(); break;
    }
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    var key = el.getAttribute('data-input');
    if (key === 'cliente-search') { ui.cliente.search = el.value; paint($('[data-region="catalogo"]', vCliente), catalogueHTML()); }
    else if (key === 'cliente-name') { ui.cliente.name = el.value; saveClient(); updateSendState(); }
    else if (key === 'cliente-phone') { ui.cliente.phone = el.value; saveClient(); updateSendState(); }
    else if (key === 'stock-search') { ui.stock.search = el.value; refreshStock(); }
    var dk = el.getAttribute('data-draft');
    if (dk && ui.stock.draft) { ui.stock.draft[dk] = el.value; el.removeAttribute('aria-invalid'); }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target.getAttribute('data-form');
    if (!form) return;
    e.preventDefault();
    if (form === 'send') sendRequest();
    else if (form === 'stock-save') saveEdit();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && ui.view === 'stock' && ui.stock.editingId != null) { ui.stock.editingId = null; ui.stock.draft = null; refreshStock(); }
  });

  window.addEventListener('hashchange', function () { setView(viewFromHash()); });
  setInterval(function () { if (ui.view === 'pedidos') renderPedidos(); else if (ui.view === 'cliente') paint($('[data-region="aside"]', vCliente), asideHTML()); }, 60000);

  $all('[data-store-name]').forEach(function (n) { n.textContent = S.info.name; });
  setView(viewFromHash());
})();

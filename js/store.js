/* Mostrador · capa de datos
   Toda lectura y escritura pasa por este módulo. Hoy guarda en localStorage y sincroniza
   pestañas del mismo navegador con BroadcastChannel (o el evento "storage" como respaldo).
   Para pasar a Supabase alcanza con reimplementar estas mismas funciones (ver README). */
(function () {
  'use strict';

  var STORE_ID = 'la-esquina';            // futuro store_id / tenant
  var KEY = 'mostrador:' + STORE_ID + ':v1';
  var CHANNEL = 'mostrador:' + STORE_ID;

  var STORE_INFO = {
    id: STORE_ID,
    name: 'Almacén La Esquina',
    town: 'Luján',
    lowStockThreshold: 8
  };

  var CATEGORIES = [
    'Frutas y Verduras',
    'Lácteos y Huevos',
    'Panadería',
    'Carnes y Pescados',
    'Almacén',
    'Bebidas'
  ];

  function seedProducts() {
    var P = function (id, name, category, unit, price, stock) {
      return { id: id, name: name, category: category, unit: unit, price: price, stock: stock };
    };
    return [
      P(1, 'Banana Ecuador', 'Frutas y Verduras', 'por kg', 2600, 24),
      P(2, 'Tomate redondo', 'Frutas y Verduras', 'por kg', 2900, 6),
      P(3, 'Papa negra', 'Frutas y Verduras', 'por kg', 1250, 40),
      P(4, 'Lechuga criolla', 'Frutas y Verduras', 'c/u', 1500, 0),
      P(5, 'Manzana roja', 'Frutas y Verduras', 'por kg', 2800, 31),
      P(6, 'Leche entera La Serenísima', 'Lácteos y Huevos', 'sachet 1 L', 1890, 40),
      P(7, 'Huevos de campo', 'Lácteos y Huevos', 'docena', 3900, 5),
      P(8, 'Dulce de leche', 'Lácteos y Huevos', 'pote 400 g', 3250, 18),
      P(9, 'Queso cremoso', 'Lácteos y Huevos', 'por kg', 11800, 7),
      P(10, 'Manteca', 'Lácteos y Huevos', '200 g', 3400, 12),
      P(11, 'Pan francés', 'Panadería', 'por kg', 3100, 9),
      P(12, 'Medialunas de manteca', 'Panadería', 'docena', 7200, 22),
      P(13, 'Pan lactal', 'Panadería', '550 g', 3600, 0),
      P(14, 'Pollo entero', 'Carnes y Pescados', 'por kg', 4300, 10),
      P(15, 'Milanesa de nalga', 'Carnes y Pescados', 'por kg', 15900, 4),
      P(16, 'Carne picada común', 'Carnes y Pescados', 'por kg', 9800, 8),
      P(17, 'Yerba mate', 'Almacén', '1 kg', 5800, 14),
      P(18, 'Fideos tirabuzón', 'Almacén', '500 g', 1600, 50),
      P(19, 'Aceite de girasol', 'Almacén', '1,5 L', 4900, 26),
      P(20, 'Harina 000', 'Almacén', '1 kg', 1100, 3),
      P(21, 'Gaseosa cola', 'Bebidas', '2,25 L', 4200, 33),
      P(22, 'Agua mineral', 'Bebidas', '2 L', 1500, 6),
      P(23, 'Vino tinto Malbec', 'Bebidas', '750 ml', 6500, 11),
      P(24, 'Soda en sifón', 'Bebidas', '1,5 L', 1400, 19)
    ];
  }

  function seedRequests(products) {
    var now = Date.now();
    var min = 60 * 1000;
    var byId = {};
    products.forEach(function (p) { byId[p.id] = p; });
    var items = function (list) {
      return list.map(function (pair) {
        var p = byId[pair[0]];
        return { productId: p.id, name: p.name, unit: p.unit, price: p.price, qty: pair[1] };
      });
    };
    var yesterday = function (h, m) {
      var d = new Date(); d.setDate(d.getDate() - 1); d.setHours(h, m, 0, 0); return d.toISOString();
    };
    return [
      { id: 1042, customerName: 'Laura Gómez', phone: '2323 45-1020', status: 'new',
        createdAt: new Date(now - 12 * min).toISOString(), items: items([[1, 2], [6, 3], [11, 1], [7, 1]]) },
      { id: 1041, customerName: 'Tomás Álvarez', phone: '2323 15-2233', status: 'new',
        createdAt: new Date(now - 38 * min).toISOString(), items: items([[14, 2], [17, 1], [19, 1], [15, 1]]) },
      { id: 1040, customerName: 'Sofía Fernández', phone: '2323 44-9876', status: 'ready',
        createdAt: new Date(now - 95 * min).toISOString(), items: items([[12, 1], [22, 2], [10, 1]]) },
      { id: 1039, customerName: 'Marcelo Rossi', phone: '2323 42-7766', status: 'ready',
        createdAt: yesterday(18, 30), items: items([[16, 1], [3, 2], [9, 1], [23, 1]]) },
      { id: 1038, customerName: 'Nadia Haddad', phone: '2323 47-4433', status: 'done',
        createdAt: yesterday(17, 12), items: items([[18, 3], [2, 1], [21, 1]]) }
    ];
  }

  function seedState() {
    var products = seedProducts();
    return { products: products, requests: seedRequests(products), rev: 0 };
  }

  /* ---------- persistencia ---------- */
  var state = null;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.requests)) return parsed;
      }
    } catch (e) { /* almacenamiento bloqueado o dañado: usamos semilla */ }
    return seedState();
  }

  function persist() {
    state.rev = (state.rev || 0) + 1;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* modo privado */ }
  }

  state = load();

  /* ---------- sincronización entre pestañas ---------- */
  var listeners = [];
  var channel = null;
  try { if ('BroadcastChannel' in window) channel = new BroadcastChannel(CHANNEL); } catch (e) { channel = null; }

  function emit(change) {
    listeners.forEach(function (fn) { try { fn(change); } catch (e) { console.error(e); } });
  }

  function commit(change) {
    persist();
    emit(Object.assign({ remote: false }, change));
    if (channel) channel.postMessage(change);
  }

  function reloadFromDisk(change) {
    var fresh = load();
    if (JSON.stringify(fresh) === JSON.stringify(state)) return; // BroadcastChannel y storage pueden llegar los dos
    state = fresh;
    emit(Object.assign({ remote: true }, change || { type: 'sync' }));
  }

  if (channel) {
    channel.onmessage = function (ev) { reloadFromDisk(ev.data); };
  }
  // Respaldo para navegadores sin BroadcastChannel
  if (!channel) window.addEventListener('storage', function (ev) {
    if (ev.key === KEY) reloadFromDisk({ type: 'sync' });
  });

  /* ---------- helpers ---------- */
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function findProduct(id) {
    for (var i = 0; i < state.products.length; i++) if (state.products[i].id === id) return state.products[i];
    return null;
  }
  function nextId(list, floor) {
    return list.reduce(function (m, x) { return Math.max(m, x.id); }, floor) + 1;
  }

  var NEXT_STATUS = { new: 'ready', ready: 'done', done: 'done' };

  /* ---------- API pública ---------- */
  window.Store = {
    info: STORE_INFO,
    categories: CATEGORIES.slice(),

    getProducts: function () { return clone(state.products); },
    getProduct: function (id) { var p = findProduct(id); return p ? clone(p) : null; },

    /* Crea (sin id) o actualiza (con id). Devuelve el producto guardado. */
    saveProduct: function (input) {
      var clean = {
        name: String(input.name || '').trim() || 'Producto sin nombre',
        category: CATEGORIES.indexOf(input.category) >= 0 ? input.category : 'Almacén',
        unit: String(input.unit || '').trim() || 'c/u',
        price: Math.max(0, Math.round(Number(input.price) || 0)),
        stock: Math.max(0, Math.floor(Number(input.stock) || 0))
      };
      var saved;
      if (input.id != null && findProduct(input.id)) {
        saved = Object.assign(findProduct(input.id), clean);
      } else {
        saved = Object.assign({ id: nextId(state.products, 0) }, clean);
        state.products.unshift(saved);
      }
      commit({ type: 'product', id: saved.id });
      return clone(saved);
    },

    adjustStock: function (id, delta) {
      var p = findProduct(id);
      if (!p) return null;
      p.stock = Math.max(0, p.stock + delta);
      commit({ type: 'product', id: id });
      return clone(p);
    },

    removeProduct: function (id) {
      state.products = state.products.filter(function (p) { return p.id !== id; });
      commit({ type: 'product', id: id });
    },

    getRequests: function () {
      return clone(state.requests).sort(function (a, b) { return b.id - a.id; });
    },
    getRequest: function (id) {
      var r = state.requests.filter(function (x) { return x.id === id; })[0];
      return r ? clone(r) : null;
    },

    /* items: [{ productId, qty }]. Guarda nombre y precio del momento (como haría un pedido real). */
    createRequest: function (input) {
      var items = (input.items || []).map(function (it) {
        var p = findProduct(it.productId);
        if (!p || !(it.qty > 0)) return null;
        return { productId: p.id, name: p.name, unit: p.unit, price: p.price, qty: Math.floor(it.qty) };
      }).filter(Boolean);
      var name = String(input.customerName || '').trim();
      var phone = String(input.phone || '').trim();
      if (!items.length || !name || !phone) throw new Error('Pedido incompleto');
      var req = {
        id: nextId(state.requests, 1000),
        customerName: name,
        phone: phone,
        status: 'new',
        createdAt: new Date().toISOString(),
        items: items
      };
      state.requests.unshift(req);
      commit({ type: 'request', id: req.id, created: true });
      return clone(req);
    },

    advanceRequest: function (id) {
      var r = state.requests.filter(function (x) { return x.id === id; })[0];
      if (!r) return null;
      r.status = NEXT_STATUS[r.status] || 'done';
      commit({ type: 'request', id: id });
      return clone(r);
    },

    reset: function () {
      state = seedState();
      commit({ type: 'reset' });
    },

    /* fn(change) se llama ante cualquier cambio, local o de otra pestaña. Devuelve unsubscribe. */
    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
    }
  };
})();

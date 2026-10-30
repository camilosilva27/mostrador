# Mostrador

Demo de ventas para almacenes, distribuidoras y fiambrerías de barrio: el cliente arma su pedido desde el celular y lo retira en el local; el comercio recibe los pedidos en una bandeja y maneja su stock. La tienda de ejemplo es **Almacén La Esquina** (Luján), con umbral de poco stock en 8 unidades.

Tres pantallas sobre los mismos datos:

| Pantalla | Hash | Qué hace |
| --- | --- | --- |
| App del cliente | `#cliente` | Catálogo con búsqueda y categorías, agregar con −/+, aviso "Solo quedan N" y "Agotado". "Tu pedido" pide nombre y teléfono (el botón queda deshabilitado hasta completar todo). Al enviar muestra el número de pedido y la línea de estado Recibido → Listo para retirar → Completado, que se actualiza sola. |
| Pedidos | `#pedidos` | Bandeja con filtros Todos / Nuevos / Listos / Completados y contadores, detalle con datos del cliente (Llamar / WhatsApp con mensaje armado), progreso, tabla de productos con aviso de "Poco stock" / "Sin stock" y botón para avanzar el estado. |
| Stock | `#stock` | Totales (productos, poco stock, sin stock), búsqueda, categorías, "Solo poco stock", −/+ de stock en vivo, edición en línea (nombre, presentación, categoría, precio, stock), agregar y eliminar productos. |

La barra de arriba cambia de pantalla (la pestaña Pedidos muestra cuántos pedidos nuevos hay) y tiene **Reiniciar demo**, que vuelve a los datos de ejemplo.

## Cómo correrlo

No hay build ni dependencias. Cualquier servidor estático sirve:

```bash
cd mostrador
python3 -m http.server 8000
# abrir http://localhost:8000/#cliente  y en otra pestaña  http://localhost:8000/#pedidos
```

También abre con doble clic en `index.html` (los scripts no son módulos ES, así que funciona desde `file://`). Para publicarlo alcanza con GitHub Pages sobre la rama principal.

**Para la demo:** abrí el cliente en una pestaña y Pedidos en otra (mismo navegador). Al enviar un pedido aparece al instante en la bandeja con un aviso; al marcarlo "Listo" la línea de estado del cliente cambia; lo que se edita en Stock se ve en el catálogo.

> **Sincronización entre dispositivos:** hoy los datos viven en el `localStorage` del navegador y se sincronizan solo entre pestañas del **mismo** navegador (BroadcastChannel, con el evento `storage` como respaldo). Abrir `#cliente` en el celular y `#pedidos` en la notebook muestra dos demos independientes. Para que un pedido hecho en el celular llegue a la notebook hace falta el backend (ver Supabase, abajo).

## Estructura

```
index.html       barra de demo y las tres secciones
css/styles.css   estilos (tokens en :root)
js/store.js      capa de datos: localStorage + BroadcastChannel (window.Store)
js/app.js        render y eventos de las tres pantallas
capturas/        capturas de referencia
```

`referencia/` (prototipo de diseño original) está en `.gitignore` y no se publica: usa el design system de un tercero. La identidad visual de esta app es propia (verde de persiana de almacén, IBM Plex Sans, íconos SVG en línea).

## Modelo de datos

```js
Product  { id, name, category, unit, price, stock }      // price en pesos enteros
Request  { id, customerName, phone, status, createdAt, items: RequestItem[] }
           // status: 'new' | 'ready' | 'done'
RequestItem { productId, name, unit, price, qty }         // nombre y precio congelados al momento del pedido
```

Categorías fijas: Frutas y Verduras, Lácteos y Huevos, Panadería, Carnes y Pescados, Almacén, Bebidas. Poco stock = `stock <= 8`; sin stock = `0`.

Decisiones de esta versión (a confirmar con un comercio real):
- Enviar un pedido **no descuenta stock**; el comercio ajusta el stock a mano. En la bandeja se avisa si un pedido nuevo pide más de lo que hay.
- El cliente no puede pedir más unidades que el stock disponible.
- No hay pago en línea: "Pagás al retirar".

## API de `store.js`

`getProducts()`, `getProduct(id)`, `saveProduct(p)` (crea sin `id`, actualiza con `id`), `adjustStock(id, delta)`, `removeProduct(id)`, `getRequests()`, `getRequest(id)`, `createRequest({customerName, phone, items:[{productId, qty}]})`, `advanceRequest(id)`, `reset()`, `subscribe(fn)` → devuelve la función para desuscribirse. `app.js` no toca `localStorage` para datos del negocio; solo pasa por esta API.

## Migración a Supabase

Tablas (todas con `store_id` para multi-tenant, con Row Level Security por `store_id`):

```sql
create table stores (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, name text not null, town text,
  low_stock_threshold int not null default 8
);
create table products (
  id bigint generated always as identity primary key,
  store_id uuid not null references stores(id),
  name text not null, category text not null, unit text not null default 'c/u',
  price numeric(12,2) not null check (price >= 0),
  stock int not null default 0 check (stock >= 0),
  archived_at timestamptz                 -- "eliminar" = archivar, para no romper pedidos viejos
);
create table requests (
  id bigint generated always as identity primary key,   -- o número correlativo por tienda
  store_id uuid not null references stores(id),
  customer_name text not null, phone text not null,
  status text not null default 'new' check (status in ('new','ready','done')),
  created_at timestamptz not null default now()
);
create table request_items (
  request_id bigint not null references requests(id) on delete cascade,
  store_id uuid not null references stores(id),
  product_id bigint references products(id),
  name text not null, unit text not null, price numeric(12,2) not null, qty int not null check (qty > 0),
  primary key (request_id, product_id)
);
```

Correspondencia:

| store.js | Supabase |
| --- | --- |
| `getProducts` | `select * from products where store_id = ? and archived_at is null` |
| `saveProduct` | `upsert` en `products` |
| `adjustStock` | RPC `adjust_stock(id, delta)` (atómico, `greatest(stock+delta,0)`) |
| `removeProduct` | `update products set archived_at = now()` |
| `getRequests` | `select *, request_items(*) from requests where store_id = ?` |
| `createRequest` | RPC `create_request(store_id, name, phone, items jsonb)` que copia nombre/precio en `request_items` dentro de una transacción. El cliente anónimo solo puede insertar por esta RPC. |
| `advanceRequest` | `update requests set status = …` (solo usuarios del comercio) |
| `subscribe` | Supabase Realtime sobre `products` y `requests` filtrado por `store_id` (esto da la sincronización entre dispositivos) |
| `reset` | solo para la demo: RPC que recarga datos de ejemplo en una tienda demo |

Como las funciones de lectura hoy son síncronas, al migrar conviene volverlas `async` y que `app.js` re-pinte desde `subscribe`, que ya es como funciona.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApiGet, publicApiPost } from "../lib/api";
import { consumeSyncedPublicOrder, sendPublicOrderResilient } from "../lib/offlineOrders";
import { createOrderFingerprint, guardDoubleSubmit } from "../lib/orderGuards";
import { demoDishImage, demoRestaurantLogo } from "../lib/demoVisuals";
import "../styles/customer-menu.css";

const DEMO_SLUG = "demo";
const LEGACY_DEMO_SLUG = "demo-restaurant";
const DEMO_TABLE_TOKEN = "demo-table-1";
const TABLE_PAYMENT_AVAILABLE = false;
const MONEY_FORMATTER = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

const DEMO_MENU_ITEMS = [
  { id: "demo-antipasto-1", name: "Tartare mediterranea", shortDescription: "Manzo battuto, capperi, limone, olio EVO e chips croccanti", price: 14, category: "Antipasti", preparationArea: "kitchen", isFeatured: true, allergens: ["senape"], imageUrl: demoDishImage("Tartare", "Antipasti", "antipasto") },
  { id: "demo-antipasto-2", name: "Burrata e pomodorini", shortDescription: "Burrata fresca, pomodorini confit, basilico e pane tostato", price: 11, category: "Antipasti", preparationArea: "kitchen", isFeatured: false, allergens: ["latte", "glutine"], imageUrl: demoDishImage("Burrata", "Antipasti", "antipasto") },
  { id: "demo-antipasto-3", name: "Calamaro croccante", shortDescription: "Calamaro dorato, maionese al lime e insalata aromatica", price: 13, category: "Antipasti", preparationArea: "kitchen", isFeatured: false, allergens: ["molluschi", "uova"], imageUrl: demoDishImage("Calamaro", "Antipasti", "pesce") },
  { id: "demo-primo-1", name: "Carbonara croccante", shortDescription: "Guanciale, pecorino romano, uovo e pepe tostato", price: 13, category: "Primi", preparationArea: "kitchen", isFeatured: true, allergens: ["glutine", "uova", "latte"], imageUrl: demoDishImage("Carbonara", "Primi", "primo") },
  { id: "demo-primo-2", name: "Risotto limone e gambero", shortDescription: "Riso mantecato, limone, gambero rosso e polvere di cappero", price: 18, category: "Primi", preparationArea: "kitchen", isFeatured: true, allergens: ["crostacei", "latte"], imageUrl: demoDishImage("Risotto", "Primi", "pesce") },
  { id: "demo-primo-3", name: "Pacchero al ragu bianco", shortDescription: "Pasta fresca, vitello, rosmarino e fonduta leggera", price: 15, category: "Primi", preparationArea: "kitchen", isFeatured: false, allergens: ["glutine", "latte"], imageUrl: demoDishImage("Pacchero", "Primi", "primo") },
  { id: "demo-secondo-1", name: "Filetto al pepe verde", shortDescription: "Filetto di manzo, salsa al pepe verde e patata fondente", price: 24, category: "Secondi", preparationArea: "kitchen", isFeatured: true, allergens: ["latte"], imageUrl: demoDishImage("Filetto", "Secondi", "carne") },
  { id: "demo-secondo-2", name: "Branzino alle erbe", shortDescription: "Branzino, erbe fini, verdure arrosto e salsa agrumata", price: 21, category: "Secondi", preparationArea: "kitchen", isFeatured: true, allergens: ["pesce"], imageUrl: demoDishImage("Branzino", "Secondi", "pesce") },
  { id: "demo-secondo-3", name: "Parmigiana leggera", shortDescription: "Melanzana, pomodoro dolce, basilico e provola affumicata", price: 12, category: "Vegetariano", preparationArea: "kitchen", isFeatured: false, allergens: ["latte"], imageUrl: demoDishImage("Parmigiana", "Vegetariano", "vegetariano") },
  { id: "demo-contorno-1", name: "Patate fondenti", shortDescription: "Patate dorate, burro chiarificato e sale affumicato", price: 6, category: "Contorni", preparationArea: "kitchen", isFeatured: false, allergens: ["latte"], imageUrl: demoDishImage("Patate", "Contorni", "vegetariano") },
  { id: "demo-contorno-2", name: "Verdure di stagione", shortDescription: "Verdure grigliate, olio EVO e vinaigrette alle erbe", price: 6, category: "Contorni", preparationArea: "kitchen", isFeatured: false, allergens: [], imageUrl: demoDishImage("Verdure", "Contorni", "vegetariano") },
  { id: "demo-dolce-1", name: "Tiramisù espresso", shortDescription: "Mascarpone, caffè espresso, cacao e biscotto leggero", price: 7, category: "Dolci", preparationArea: "kitchen", isFeatured: true, allergens: ["uova", "latte", "glutine"], imageUrl: demoDishImage("Tiramisù", "Dolci", "dolce") },
  { id: "demo-dolce-2", name: "Cheesecake agrumi", shortDescription: "Crema al formaggio, crumble e gel agli agrumi", price: 8, category: "Dolci", preparationArea: "kitchen", isFeatured: false, allergens: ["latte", "glutine"], imageUrl: demoDishImage("Cheesecake", "Dolci", "dolce") },
  { id: "demo-bar-1", name: "Acqua frizzante", shortDescription: "Bottiglia 75cl", price: 2.5, category: "Bevande", preparationArea: "bar", isFeatured: false, allergens: [], imageUrl: demoDishImage("Acqua", "Bevande", "drink") },
  { id: "demo-bar-2", name: "Spritz Signature", shortDescription: "Aperol, prosecco, soda e arancia", price: 8, category: "Cocktail", preparationArea: "bar", isFeatured: true, allergens: ["solfiti"], imageUrl: demoDishImage("Spritz", "Cocktail", "drink") },
  { id: "demo-bar-3", name: "Gin tonic botanico", shortDescription: "Gin secco, tonica mediterranea e scorza di limone", price: 10, category: "Cocktail", preparationArea: "bar", isFeatured: false, allergens: [], imageUrl: demoDishImage("Gin Tonic", "Cocktail", "drink") },
  { id: "demo-vino-1", name: "Calice Etna rosso", shortDescription: "Selezione cantina, calice 12cl", price: 7, category: "Vini", preparationArea: "bar", isFeatured: false, allergens: ["solfiti"], imageUrl: demoDishImage("Etna Rosso", "Vini", "vino") },
  { id: "demo-vino-2", name: "Calice Franciacorta", shortDescription: "Metodo classico, perlage fine e finale agrumato", price: 9, category: "Vini", preparationArea: "bar", isFeatured: true, allergens: ["solfiti"], imageUrl: demoDishImage("Franciacorta", "Vini", "vino") },
];

function money(value) {
  const amount = Number(value || 0);
  return MONEY_FORMATTER.format(Number.isFinite(amount) ? amount : 0);
}

function cartKey(slug, token) {
  return `cliente_cart_${slug}_${token}`;
}

function orderKey(slug, token) {
  return `cliente_order_${slug}_${token}`;
}

function normalizeAllergens(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeItem(item) {
  return {
    id: item.id,
    name: item.name || item.nome || "Prodotto",
    description: item.shortDescription || item.description || item.ingredienti || "",
    price: Number(item.price ?? item.prezzo ?? 0),
    category: item.category || item.categoria || "Menu",
    imageUrl: item.imageUrl || item.img || "",
    allergens: normalizeAllergens(item.allergens || item.allergeni),
    isFeatured: Boolean(item.isFeatured),
    preparationArea: item.preparationArea || "kitchen",
  };
}

function statusCopy(status) {
  if (status === "in_progress") return ["In preparazione", "La cucina sta lavorando sull'ordine."];
  if (status === "ready") return ["Pronto", "Il tuo ordine sta arrivando al tavolo."];
  if (status === "served") return ["Servito", "Ordine servito."];
  if (status === "cancelled") return ["Annullato", "Ordine annullato dal ristorante."];
  return ["Ordine ricevuto", "Il ristorante ha ricevuto la comanda."];
}

function statusStep(status) {
  if (status === "served") return 3;
  if (status === "ready") return 2;
  if (status === "in_progress") return 1;
  return 0;
}

function OrderTimeline({ status }) {
  const activeStep = statusStep(status);
  const steps = ["Ricevuto", "In preparazione", "Pronto", "Servito"];

  return (
    <div className="cm-status-steps" aria-label="Stato ordine">
      {steps.map((step, index) => (
        <div key={step} className={index <= activeStep ? "is-active" : ""}>
          <i />
          <span>{step}</span>
        </div>
      ))}
    </div>
  );
}

function getCategories(items) {
  return [...new Set(items.map((item) => item.category).filter(Boolean))];
}

function getCategoryCounts(items) {
  return items.reduce((acc, item) => {
    acc[item.category] = Number(acc[item.category] || 0) + 1;
    return acc;
  }, {});
}

function ProductCard({ item, quantity, note, onAdd, onRemove, onNoteChange }) {
  const hasImage = Boolean(item.imageUrl);

  return (
    <article className={`cm-product ${hasImage ? "with-image" : ""} ${quantity > 0 ? "is-selected" : ""}`}>
      {hasImage ? <img className="cm-product-image" src={item.imageUrl} alt={item.name} /> : null}
      <div className="cm-product-body">
        <div className="cm-product-kicker">
          <span>{item.category}</span>
          {quantity > 0 ? <b>{quantity} nel carrello</b> : null}
        </div>
        <div className="cm-product-top">
          <div>
            <h3>{item.name}</h3>
            {item.description ? <p>{item.description}</p> : null}
          </div>
          <strong>{money(item.price)}</strong>
        </div>

        {item.allergens.length ? (
          <div className="cm-allergen-row" aria-label="Allergeni">
            <b>Allergeni</b>
            <div className="cm-allergens">
              {item.allergens.slice(0, 5).map((allergen) => <span key={allergen}>{allergen}</span>)}
            </div>
          </div>
        ) : null}

        {quantity > 0 ? (
          <input
            className="cm-item-note"
            value={note}
            onChange={(event) => onNoteChange(item.id, event.target.value)}
            placeholder="Note per questo piatto, es. senza cipolla"
          />
        ) : null}

        <div className={quantity > 0 ? "cm-product-actions" : "cm-product-actions is-simple"}>
          {quantity > 0 ? (
            <div className="cm-qty">
              <button type="button" onClick={() => onRemove(item.id)} aria-label={`Rimuovi ${item.name}`}>-</button>
              <span>{quantity}</span>
            </div>
          ) : null}
          <button className="cm-add" type="button" onClick={() => onAdd(item.id)}>
            Aggiungi
          </button>
        </div>
      </div>
    </article>
  );
}

function CartBar({ totalItems, totalAmount, loading, onOrder, onToggle, open, tableName }) {
  if (totalItems <= 0) return null;

  return (
    <div className="cm-cartbar">
      <button className="cm-cart-summary" type="button" onClick={onToggle}>
        <span>
          <b>{open ? "Riepilogo ordine" : `${totalItems} prodotti nel carrello`}</b>
          <small>{tableName || "Tavolo"}</small>
        </span>
        <strong>{money(totalAmount)}</strong>
      </button>
      <button className="cm-order-button" type="button" disabled={loading} onClick={onOrder}>
        {loading ? "Invio..." : open ? "Conferma ordine" : "Ordina ora"}
      </button>
    </div>
  );
}

export default function Cliente() {
  const params = useParams();
  const search = new URLSearchParams(window.location.search);
  const paymentResult = search.get("payment");

  const slug =
    params.slug ||
    search.get("slug") ||
    search.get("restaurantSlug") ||
    localStorage.getItem("restaurant_slug") ||
    DEMO_SLUG;

  const tableToken =
    params.tableToken ||
    search.get("token") ||
    search.get("tableToken") ||
    params.tavolo ||
    DEMO_TABLE_TOKEN;

  const isDemo = [DEMO_SLUG, LEGACY_DEMO_SLUG].includes(slug) && String(tableToken).startsWith("demo-table");

  const [restaurant, setRestaurant] = useState({ name: isDemo ? "Ordynora Demo Bistro" : "Ristorante", slug, logoUrl: isDemo ? demoRestaurantLogo() : "", primaryColor: isDemo ? "#0f766e" : "#0f172a" });
  const [table, setTable] = useState({ name: `Tavolo ${params.tavolo || "1"}`, qrToken: tableToken });
  const [items, setItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [cart, setCart] = useState({});
  const [itemNotes, setItemNotes] = useState({});
  const [query, setQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [order, setOrder] = useState(null);
  const [showMenuAfterOrder, setShowMenuAfterOrder] = useState(false);
  const [serviceMessage, setServiceMessage] = useState("");
  const [payment, setPayment] = useState({ loading: false, error: "", open: false, summary: null });
  const [paymentMode, setPaymentMode] = useState("full");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const pendingSubmission = useRef({ fingerprint: "", requestId: "" });

  useEffect(() => {
    const applySyncedOrder = (queueId, result) => {
      if (!queueId || order?.id !== queueId) return;
      const syncedOrder = result?.order || result;
      if (!syncedOrder?.id) return;

      setOrder((current) => {
        if (current?.id !== queueId) return current;
        const next = { ...current, ...syncedOrder, status: syncedOrder.status || "pending" };
        localStorage.setItem(orderKey(slug, tableToken), JSON.stringify(next));
        return next;
      });
      setServiceMessage("Ordine sincronizzato e ricevuto dal ristorante.");
      pendingSubmission.current = { fingerprint: "", requestId: "" };
    };

    const persistedResult = order?.id ? consumeSyncedPublicOrder(order.id) : null;
    if (persistedResult) applySyncedOrder(order.id, persistedResult);

    const onSynced = (event) => {
      const { queueId, result } = event.detail || {};
      applySyncedOrder(queueId, result);
    };

    window.addEventListener("easymenu:offline-order-synced", onSynced);
    return () => window.removeEventListener("easymenu:offline-order-synced", onSynced);
  }, [order?.id, slug, tableToken]);

  useEffect(() => {
    let active = true;

    async function loadMenu() {
      try {
        setLoading(true);
        setError("");
        let data = null;
        try {
          data = await publicApiGet(`/tables/public/${encodeURIComponent(slug)}/${encodeURIComponent(tableToken)}`);
        } catch (err) {
          if (!isDemo) throw err;
          const demoItems = DEMO_MENU_ITEMS.map(normalizeItem);
          if (!active) return;
          setRestaurant({ name: "Ordynora Demo Bistro", slug: DEMO_SLUG, logoUrl: demoRestaurantLogo(), primaryColor: "#0f766e" });
          setTable({ name: `Tavolo ${String(tableToken).replace("demo-table-", "") || "1"}`, qrToken: tableToken });
          setItems(demoItems);
          setActiveCategory(getCategories(demoItems)[0] || "Menu");
          return;
        }

        const mapped = (data?.items || []).map(normalizeItem);
        if (!active) return;
        const nextRestaurant = data.restaurant || { name: "Ristorante", slug, logoUrl: "", primaryColor: "#0f172a" };
        setRestaurant(isDemo
          ? { ...nextRestaurant, name: nextRestaurant.name || "Ordynora Demo Bistro", logoUrl: nextRestaurant.logoUrl || demoRestaurantLogo(), primaryColor: nextRestaurant.primaryColor || "#0f766e" }
          : nextRestaurant);
        setTable(data.table || { name: "Tavolo", qrToken: tableToken });
        setItems(mapped);
        setActiveCategory(getCategories(mapped)[0] || "Menu");
      } catch (err) {
        if (active) setError(err.message || "Menu non disponibile");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadMenu();
    return () => {
      active = false;
    };
  }, [slug, tableToken, isDemo]);

  useEffect(() => {
    try {
      const savedCart = JSON.parse(localStorage.getItem(cartKey(slug, tableToken)) || "{}");
      setCart(savedCart && typeof savedCart === "object" ? savedCart : {});
      const savedOrder = JSON.parse(localStorage.getItem(orderKey(slug, tableToken)) || "null");
      if (savedOrder?.items) setOrder(savedOrder);
    } catch {
      setCart({});
    }
  }, [slug, tableToken]);

  useEffect(() => {
    localStorage.setItem(cartKey(slug, tableToken), JSON.stringify(cart));
  }, [cart, slug, tableToken]);

  useEffect(() => {
    const token = order?.publicToken || order?.id;
    if (!token) return undefined;

    let active = true;
    const sync = async () => {
      try {
        const [data, summary] = await Promise.all([
          publicApiGet(`/orders/public/${encodeURIComponent(token)}`),
          TABLE_PAYMENT_AVAILABLE && !isDemo
            ? publicApiGet(`/payments/public/${encodeURIComponent(token)}/summary`).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (data && active) {
          setOrder((prev) => {
            const next = { ...(prev || {}), ...data };
            localStorage.setItem(orderKey(slug, tableToken), JSON.stringify(next));
            return next;
          });
        }
        if (summary && active) {
          setPayment((prev) => ({ ...prev, summary }));
          if (!summary.equalSplitEnabled || Number(summary.availableCovers || 0) <= 0) {
            setPaymentMode("full");
          }
        }
      } catch {
        // La pagina cliente deve restare usabile anche se il backend si risveglia lentamente.
      }
    };

    sync();
    const timer = setInterval(sync, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isDemo, order?.id, order?.publicToken, slug, tableToken]);

  useEffect(() => {
    if (TABLE_PAYMENT_AVAILABLE && paymentResult === "success") {
      setServiceMessage("Pagamento ricevuto. La cassa sta aggiornando il conto.");
      setPayment((prev) => ({ ...prev, open: true, error: "" }));
    }
    if (TABLE_PAYMENT_AVAILABLE && paymentResult === "cancelled") {
      setPayment((prev) => ({ ...prev, open: true, error: "Pagamento annullato: il conto non è stato addebitato." }));
    }
  }, [paymentResult]);

  const categories = useMemo(() => getCategories(items), [items]);
  const categoryCounts = useMemo(() => getCategoryCounts(items), [items]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      return items.filter((item) => {
        const searchable = [item.name, item.description, item.category, item.allergens.join(" ")]
          .join(" ")
          .toLowerCase();
        return searchable.includes(normalizedQuery);
      });
    }

    return items.filter((item) => item.category === activeCategory);
  }, [activeCategory, items, query]);

  const visibleSectionTitle = query.trim() ? "Risultati" : activeCategory;
  const visibleCountLabel = `${visibleItems.length} ${visibleItems.length === 1 ? "prodotto" : "prodotti"}`;

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([id, quantity]) => {
        const item = items.find((product) => product.id === id);
        return item ? { ...item, quantity: Number(quantity || 0), note: itemNotes[id] || "" } : null;
      })
      .filter((item) => item && item.quantity > 0);
  }, [cart, itemNotes, items]);

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cartItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const [statusTitle, statusText] = statusCopy(order?.status);

  function addItem(id) {
    setCart((prev) => ({ ...prev, [id]: Number(prev[id] || 0) + 1 }));
  }

  function removeItem(id) {
    const currentQty = Number(cart[id] || 0);
    setCart((prev) => {
      const nextQty = Number(prev[id] || 0) - 1;
      const next = { ...prev };
      if (nextQty <= 0) delete next[id];
      else next[id] = nextQty;
      return next;
    });
    if (currentQty <= 1) {
      setItemNotes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  function updateItemNote(id, note) {
    setItemNotes((prev) => ({ ...prev, [id]: note.slice(0, 160) }));
  }

  async function submitOrder() {
    if (sending || cartItems.length === 0) return;

    try {
      setSending(true);
      setError("");
      const payload = {
        restaurantSlug: slug,
        tableToken,
        customerName: "",
        notes: "",
        items: cartItems.map((item) => ({ menuItemId: item.id, quantity: item.quantity, notes: item.note || "" })),
      };
      const fingerprint = createOrderFingerprint(payload);
      if (!guardDoubleSubmit(fingerprint)) {
        setError("Ordine già in invio. Attendi la conferma prima di riprovare.");
        return;
      }
      if (pendingSubmission.current.fingerprint !== fingerprint) {
        pendingSubmission.current = {
          fingerprint,
          requestId: `${slug}:${tableToken}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        };
      }
      payload.clientRequestId = pendingSubmission.current.requestId;

      let createdOrder = null;

      try {
        const data = await sendPublicOrderResilient(payload);
        createdOrder = data.order || data;
        if (data.queued) {
          setServiceMessage("Connessione instabile: ordine salvato sul dispositivo e invio automatico in corso.");
        } else {
          pendingSubmission.current = { fingerprint: "", requestId: "" };
        }
      } catch (err) {
        if (!isDemo) throw err;
        createdOrder = {
          id: `demo-${Date.now()}`,
          publicToken: "",
          status: "pending",
          orderNumber: "DEMO",
          restaurantName: restaurant.name,
          tableName: table.name,
          totalAmount,
          createdAt: new Date().toISOString(),
        };
      }

      const nextOrder = {
        ...createdOrder,
        items: cartItems.map((item) => ({
          id: item.id,
          nameSnapshot: item.name,
          quantity: item.quantity,
          priceSnapshot: item.price,
          categorySnapshot: item.category,
          notes: item.note || "",
        })),
        restaurantName: createdOrder.restaurantName || restaurant.name,
        tableName: createdOrder.tableName || table.name,
        totalAmount: Number(createdOrder.totalAmount || totalAmount),
      };

      setOrder(nextOrder);
      setCart({});
      setItemNotes({});
      setCartOpen(false);
      setShowMenuAfterOrder(false);
      localStorage.removeItem(cartKey(slug, tableToken));
      localStorage.setItem(orderKey(slug, tableToken), JSON.stringify(nextOrder));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message || "Impossibile inviare l'ordine");
    } finally {
      setSending(false);
    }
  }

  async function payOnline() {
    const token = order?.publicToken || order?.id;
    if (!token || payment.loading) return;

    try {
      setPayment((prev) => ({ ...prev, loading: true, error: "" }));
      const data = await publicApiPost(`/payments/public/${encodeURIComponent(token)}/checkout`, {
        paymentMode,
      });
      if (!data?.checkoutUrl) throw new Error("Pagamento non disponibile");
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setPayment((prev) => ({ ...prev, loading: false, error: err.message || "Pagamento non disponibile" }));
    }
  }

  async function requestService(type) {
    const token = order?.publicToken || order?.id;
    if (!token) return;

    const isBill = type === "bill";

    try {
      setServiceMessage("");
      if (isDemo) {
        setServiceMessage(isBill ? "Richiesta conto inviata alla cassa demo." : "Cameriere avvisato nella demo.");
        return;
      }

      const data = await publicApiPost(
        `/orders/public/${encodeURIComponent(token)}/${isBill ? "request-bill" : "call-staff"}`,
        isBill ? {} : { reason: "Richiesta dal menu cliente" }
      );
      setServiceMessage(data?.message || (isBill ? "Richiesta conto inviata." : "Cameriere avvisato."));
    } catch (err) {
      setServiceMessage(err.message || "Richiesta non inviata. Riprova tra poco.");
    }
  }

  if (loading) {
    return (
      <main className="cm-page">
        <section className="cm-empty">
          <h1>Caricamento menu</h1>
          <p>Stiamo aprendo il menu del tavolo.</p>
        </section>
      </main>
    );
  }

  if (error && items.length === 0) {
    return (
      <main className="cm-page">
        <section className="cm-empty">
          <h1>Menu non disponibile</h1>
          <p>{error}</p>
          <button className="cm-empty-action" type="button" onClick={() => window.location.reload()}>
            Riprova
          </button>
        </section>
      </main>
    );
  }

  if (order && !showMenuAfterOrder) {
    return (
      <main className="cm-page">
        <header className="cm-header compact">
          {restaurant.logoUrl ? <img src={restaurant.logoUrl} alt={restaurant.name} /> : <div className="cm-logo-fallback">{restaurant.name?.slice(0, 1) || "E"}</div>}
          <div>
            <strong>{restaurant.name}</strong>
            <span>{order.tableName || table.name}</span>
          </div>
        </header>

        <section className="cm-confirmation">
          <span className="cm-status-pill">{order.orderNumber || "Ordine"}</span>
          <h1>{statusTitle}</h1>
          <OrderTimeline status={order.status} />
          <p>{statusText}</p>

          <div className="cm-order-lines">
            {(order.items || []).map((item, index) => (
              <div key={`${item.id || item.nameSnapshot}-${index}`}>
                <span>
                  {item.nameSnapshot || item.name} x{item.quantity}
                  {item.notes ? <small>{item.notes}</small> : null}
                </span>
                <strong>{money(Number(item.priceSnapshot || item.price || 0) * Number(item.quantity || 1))}</strong>
              </div>
            ))}
          </div>

          <div className="cm-confirm-total">
            <span>Totale</span>
            <strong>{money(order.totalAmount)}</strong>
          </div>

          {order.paymentStatus === "paid" || payment.summary?.paymentStatus === "paid" ? (
            <div className="cm-payment-paid"><b>Conto pagato</b><span>Il pagamento è stato registrato correttamente.</span></div>
          ) : null}

          {payment.error ? <div className="cm-error">{payment.error}</div> : null}
          {serviceMessage ? <div className="cm-service-message">{serviceMessage}</div> : null}
          {order.paymentStatus !== "paid" && payment.summary?.paymentStatus !== "paid" ? (
            <div className="cm-payment-waiting">
              <b>Pagamento dal tavolo</b>
              <span>Prossimamente potrai pagare in sicurezza direttamente dal telefono. Per ora usa “Chiedi conto”.</span>
            </div>
          ) : null}

          {TABLE_PAYMENT_AVAILABLE && payment.open && payment.summary?.onlinePaymentAvailable && order.paymentStatus !== "paid" && payment.summary?.paymentStatus !== "paid" ? (
            <section className="cm-payment-panel">
              <div className="cm-payment-summary">
                <div><span>Totale</span><b>{money(payment.summary?.totalAmount ?? order.totalAmount)}</b></div>
                <div><span>Già pagato</span><b>{money(payment.summary?.paidAmount || 0)}</b></div>
                <div><span>Da pagare</span><b>{money(payment.summary?.remainingAmount ?? order.totalAmount)}</b></div>
              </div>
              <div className="cm-payment-split">
                <span>Come vuoi pagare?</span>
                <div>
                  <button type="button" className={paymentMode === "full" ? "is-active" : ""} onClick={() => setPaymentMode("full")}>
                    Tutto il saldo
                  </button>
                  {payment.summary?.equalSplitEnabled && Number(payment.summary?.guestCount || 1) > 1 && Number(payment.summary?.availableCovers || 0) > 0 ? (
                    <button type="button" className={paymentMode === "share" ? "is-active" : ""} onClick={() => setPaymentMode("share")}>
                      La mia quota
                    </button>
                  ) : null}
                </div>
                <small>
                  {paymentMode === "share"
                    ? `${payment.summary.guestCount} coperti confermati · quota ${money(payment.summary.nextShareAmount)}.`
                    : `Paghi il saldo disponibile di ${money(Math.max(0, Number(payment.summary?.remainingAmount || 0) - Number(payment.summary?.reservedAmount || 0)))}.`}
                </small>
                {Number(payment.summary?.paidCovers || 0) > 0 || Number(payment.summary?.reservedCovers || 0) > 0 ? (
                  <small>
                    {payment.summary.paidCovers || 0} quote pagate
                    {payment.summary.reservedCovers ? ` · ${payment.summary.reservedCovers} in pagamento` : ""}
                  </small>
                ) : null}
              </div>
              <button
                type="button"
                className="cm-payment-cta"
                onClick={payOnline}
                disabled={payment.loading || Number(payment.summary?.remainingAmount || 0) - Number(payment.summary?.reservedAmount || 0) < 0.5}
              >
                {payment.loading
                  ? "Apro il pagamento..."
                  : Number(payment.summary?.remainingAmount || 0) - Number(payment.summary?.reservedAmount || 0) < 0.5
                    ? "Pagamento già in corso"
                    : paymentMode === "share"
                      ? `Paga ${money(payment.summary?.nextShareAmount)}`
                      : "Paga il saldo"}
              </button>
              <p>Pagamento sicuro gestito da Stripe. Ordynora non salva i dati della carta.</p>
            </section>
          ) : null}

          <div className="cm-confirm-actions">
            <button type="button" className="secondary" onClick={() => requestService("staff")}>
              Chiama cameriere
            </button>
            <button type="button" className="secondary" onClick={() => requestService("bill")}>
              Chiedi conto
            </button>
            {order.paymentStatus !== "paid" && payment.summary?.paymentStatus !== "paid" ? (
              <button type="button" className="cm-coming-soon-button" disabled>
                Pagamento dal tavolo · Prossimamente
              </button>
            ) : null}
            <button
              type="button"
              className="secondary"
              onClick={() => setShowMenuAfterOrder(true)}
            >
              Continua a ordinare
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="cm-page" style={{ "--cm-accent": restaurant.primaryColor || "#0f172a" }}>
      <header className="cm-header">
        {restaurant.logoUrl ? <img src={restaurant.logoUrl} alt={restaurant.name} /> : <div className="cm-logo-fallback">{restaurant.name?.slice(0, 1) || "E"}</div>}
        <div>
          <strong>{restaurant.name}</strong>
          <span>{table.name || "Tavolo"}</span>
        </div>
      </header>

      {order ? (
        <section className="cm-active-order">
          <div>
            <span>Ordine attivo</span>
            <strong>{statusTitle}</strong>
            <small>Puoi aggiungere altri piatti: partiranno come nuovo ordine.</small>
          </div>
          <button type="button" onClick={() => setShowMenuAfterOrder(false)}>Stato ordine</button>
        </section>
      ) : null}

      <section className="cm-search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca piatto, ingrediente o allergene"
          aria-label="Cerca nel menu"
        />
      </section>

      <nav className="cm-categories" aria-label="Categorie menu">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={category === activeCategory ? "active" : ""}
            onClick={() => setActiveCategory(category)}
          >
            <span>{category}</span>
            <small>{categoryCounts[category] || 0}</small>
          </button>
        ))}
      </nav>

      {error ? <div className="cm-error">{error}</div> : null}

      <section className="cm-section-head">
        <div>
          <span>Scegli e ordina</span>
          <h2>{visibleSectionTitle}</h2>
        </div>
        <small aria-live="polite">{visibleCountLabel}</small>
      </section>

      <section className="cm-products" aria-label={visibleSectionTitle}>
        {visibleItems.length ? visibleItems.map((item) => (
          <ProductCard
            key={item.id}
            item={item}
            quantity={Number(cart[item.id] || 0)}
            note={itemNotes[item.id] || ""}
            onAdd={addItem}
            onRemove={removeItem}
            onNoteChange={updateItemNote}
          />
        )) : (
          <div className="cm-empty small cm-no-results">
            <b>{query.trim() ? "Nessun risultato" : "Nessun prodotto disponibile"}</b>
            <span>
              {query.trim()
                ? `Non abbiamo trovato “${query.trim()}” nel menu.`
                : "Il ristorante sta aggiornando questa categoria."}
            </span>
            {query.trim() ? (
              <button type="button" onClick={() => setQuery("")}>Mostra tutto il menu</button>
            ) : null}
          </div>
        )}
      </section>

      {cartOpen ? (
        <section className="cm-cart-detail">
          <div className="cm-cart-head">
            <div>
              <strong>Riepilogo ordine</strong>
              <span>{table.name || "Tavolo"}</span>
            </div>
            <button type="button" onClick={() => setCartOpen(false)}>Chiudi</button>
          </div>
          {cartItems.map((item) => (
            <div className="cm-cart-line" key={item.id}>
              <span>
                {item.name}
                {item.note ? <small>{item.note}</small> : null}
              </span>
              <div>
                <button type="button" onClick={() => removeItem(item.id)}>-</button>
                <b>{item.quantity}</b>
                <button type="button" onClick={() => addItem(item.id)}>+</button>
              </div>
            </div>
          ))}
          <div className="cm-cart-total">
            <span>Totale</span>
            <strong>{money(totalAmount)}</strong>
          </div>
          <p className="cm-cart-hint">Controlla quantità e note prima di inviare alla cucina.</p>
        </section>
      ) : null}

      <CartBar
        totalItems={totalItems}
        totalAmount={totalAmount}
        loading={sending}
        open={cartOpen}
        tableName={table.name}
        onToggle={() => setCartOpen((value) => !value)}
        onOrder={cartOpen ? submitOrder : () => setCartOpen(true)}
      />
    </main>
  );
}

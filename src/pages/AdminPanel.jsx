import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { imageFileToDataUrl } from "../lib/imageFiles";
import { getRoleLabel } from "../lib/roles";
import usePwaInstall from "../hooks/usePwaInstall";
import { appShellStyle, glowPageStyle } from "../styles/pageStyles";
import "../styles/management-os.css";

const emptyItem = {
  name: "",
  shortDescription: "",
  description: "",
  price: "",
  costPrice: "",
  category: "",
  preparationArea: "kitchen",
  imageUrl: "",
  allergens: "",
  sortOrder: 0,
  vatRate: 10,
  isAvailable: true,
  trackStock: false,
  stockQuantity: "",
  lowStockThreshold: "",
};

const emptyTable = {
  name: "",
  code: "",
  sortOrder: 0,
};

const emptyUser = {
  name: "",
  accessMode: "pin",
  pin: "",
  email: "",
  password: "",
  role: "kitchen",
};

const CATEGORY_PRESETS = ["Antipasti", "Primi", "Secondi", "Contorni", "Dolci", "Bevande"];
const SUPPORT_EMAIL = "easy.menu.service@gmail.com";
const SUPPORT_PHONE = "+39 324 046 7723";
const supportWhatsAppUrl = `https://wa.me/393240467723?text=${encodeURIComponent("Ciao, ho bisogno di supporto per Ordynora.")}`;

function getMenuQualityStats(items) {
  const total = items.length;
  const online = items.filter((item) => item.isAvailable).length;
  const unavailable = total - online;

  return { total, unavailable };
}

function formatEuro(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number.isFinite(amount) ? amount : 0);
}

function formatQuantity(value) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(Number(value || 0));
}

function marginPercent(item) {
  const price = Number(item?.price || 0);
  const cost = Number(item?.costPrice || 0);
  return price > 0 ? Math.max(0, ((price - cost) / price) * 100) : 0;
}

function bySortThenName(a, b) {
  const sortA = Number(a?.sortOrder ?? 0);
  const sortB = Number(b?.sortOrder ?? 0);
  if (sortA !== sortB) return sortA - sortB;
  return String(a?.name || a?.code || "").localeCompare(String(b?.name || b?.code || ""), "it", { numeric: true });
}


function getInitialTab(search = window.location.search) {
  const tab = new URLSearchParams(search || "").get("tab") || "menu";
  return ["menu", "tables", "staff", "settings"].includes(tab) ? tab : "menu";
}

function SectionHead({ title, subtitle, action }) {
  return (
    <div className="management-section-head">
      <div>
        <h2 className="management-title">{title}</h2>
        {subtitle ? <p className="management-subtitle">{subtitle}</p> : null}
      </div>
      {action || null}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="management-label">
      {label}
      {children}
    </label>
  );
}

function TextInput(props) {
  return <input className="management-input" {...props} />;
}

function SelectInput(props) {
  return <select className="management-select" {...props} />;
}

function TextArea(props) {
  return <textarea className="management-textarea" {...props} />;
}


function SettingsCard({ icon, title, subtitle, action, tone = "default", onClick }) {
  return (
    <button type="button" className={`settings-card ${tone}`} onClick={onClick}>
      <span className="settings-card-icon">{icon}</span>
      <span className="settings-card-copy">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <span className="settings-card-action">{action || "Apri"}</span>
    </button>
  );
}

export default function AdminPanel({ embedded = false } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const pwa = usePwaInstall();
  const [restaurant, setRestaurant] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingRestaurant, setSavingRestaurant] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [savingTable, setSavingTable] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [uploadingItemImage, setUploadingItemImage] = useState(false);
  const [uploadingRestaurantLogo, setUploadingRestaurantLogo] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [installHelp, setInstallHelp] = useState("");
  const [activeTab, setActiveTab] = useState(() => getInitialTab(location.search));
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [restaurantForm, setRestaurantForm] = useState({
    name: "",
    primaryColor: "#1d4ed8",
    logoUrl: "",
    currency: "EUR",
    isActive: true,
  });
  const [itemForm, setItemForm] = useState(emptyItem);
  const [editingItemId, setEditingItemId] = useState("");
  const [stockHistory, setStockHistory] = useState([]);
  const [tableForm, setTableForm] = useState(emptyTable);
  const [userForm, setUserForm] = useState(emptyUser);
  const [editingUserId, setEditingUserId] = useState("");
  const [userAccessForm, setUserAccessForm] = useState({ role: "waiter", pin: "" });

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      const [restaurantData, menuData, tablesData, usersData] = await Promise.all([
        apiGet("/restaurants/me"),
        apiGet("/menu"),
        apiGet("/tables"),
        apiGet("/users"),
      ]);

      setRestaurant(restaurantData);
      setRestaurantForm({
        name: restaurantData?.name || "",
        primaryColor: restaurantData?.primaryColor || "#1d4ed8",
        logoUrl: restaurantData?.logoUrl || "",
        currency: restaurantData?.currency || "EUR",
        isActive: Boolean(restaurantData?.isActive),
      });
      setMenuItems(Array.isArray(menuData) ? menuData : []);
      setTables(Array.isArray(tablesData) ? tablesData : []);
      setStaffUsers(Array.isArray(usersData) ? usersData : []);
    } catch (err) {
      setError(err.message || "Errore nel caricamento dati admin");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setActiveTab(getInitialTab(location.search));
  }, [location.search]);

  const categories = useMemo(() => {
    const found = [...new Set(menuItems.map((item) => item.category).filter(Boolean))];
    return found.sort((a, b) => a.localeCompare(b));
  }, [menuItems]);

  const categorySuggestions = useMemo(() => {
    return [...new Set([...CATEGORY_PRESETS, ...categories])];
  }, [categories]);

  const menuQuality = useMemo(() => getMenuQualityStats(menuItems), [menuItems]);

  const filteredMenu = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...menuItems]
      .sort(bySortThenName)
      .filter((item) => {
        if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
        if (areaFilter !== "all" && item.preparationArea !== areaFilter) return false;
        if (qualityFilter === "offline" && item.isAvailable) return false;
        if (!term) return true;
        return [item.name, item.category, item.preparationArea, item.shortDescription, item.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);
      });
  }, [menuItems, query, categoryFilter, areaFilter, qualityFilter]);

  const tablesByZone = useMemo(() => {
    const map = new Map();
    [...tables].sort(bySortThenName).forEach((table) => {
      const zone = table.zone || "Sala";
      if (!map.has(zone)) map.set(zone, []);
      map.get(zone).push(table);
    });
    return [...map.entries()];
  }, [tables]);

  const firstCustomerTable = tables.find((table) => table.isActive && table.qrToken);
  const customerMenuLink = restaurant?.slug && firstCustomerTable?.qrToken
    ? `/menu/${restaurant.slug}/${firstCustomerTable.qrToken}`
    : "";
  const pageTitle = activeTab === "settings"
    ? "Impostazioni ristorante"
    : activeTab === "staff"
      ? "Staff e ruoli"
      : activeTab === "tables"
        ? "Tavoli e QR"
        : "Menu del ristorante";
  const pageSubtitle = activeTab === "settings"
    ? "Profilo, setup, privacy, abbonamento, installazione app e assistenza in un unico pannello."
    : activeTab === "staff"
      ? "Ogni ruolo vede solo le schermate utili: cucina, bar, sala, cassa o amministrazione."
      : activeTab === "tables"
        ? "Configura tavoli, codici e QR senza perdere leggibilità anche su molti coperti."
        : "Prodotti, prezzi, disponibilità e anteprima cliente senza funzioni duplicate.";

  async function handleRestaurantSubmit(event) {
    event.preventDefault();
    try {
      setSavingRestaurant(true);
      setError("");
      setSuccess("");
      const response = await apiPatch("/restaurants/me", restaurantForm);
      setRestaurant(response.restaurant);
      localStorage.setItem("auth_restaurant", JSON.stringify(response.restaurant));
      localStorage.setItem("ristorante_attivo", response.restaurant.name || "");
      localStorage.setItem("restaurant_slug", response.restaurant.slug || "");
      setSuccess("Impostazioni ristorante aggiornate");
    } catch (err) {
      setError(err.message || "Errore nel salvataggio del ristorante");
    } finally {
      setSavingRestaurant(false);
    }
  }

  async function handleItemSubmit(event) {
    event.preventDefault();
    try {
      setSavingItem(true);
      setError("");
      setSuccess("");
      const payload = {
        ...itemForm,
        price: Number(itemForm.price),
        costPrice: Number(itemForm.costPrice || 0),
        sortOrder: Number(itemForm.sortOrder || 0),
        vatRate: Number(itemForm.vatRate || 10),
        allergens: itemForm.allergens,
        isFeatured: false,
        trackStock: Boolean(itemForm.trackStock),
        stockQuantity: Number(itemForm.stockQuantity || 0),
        lowStockThreshold: Number(itemForm.lowStockThreshold || 0),
      };

      if (editingItemId) {
        await apiPatch(`/menu/${editingItemId}`, payload);
        setSuccess("Prodotto aggiornato");
      } else {
        await apiPost("/menu", payload);
        setSuccess("Prodotto creato");
      }

      setItemForm(emptyItem);
      setEditingItemId("");
      setStockHistory([]);
      await loadData();
    } catch (err) {
      setError(err.message || "Errore salvataggio prodotto");
    } finally {
      setSavingItem(false);
    }
  }

  async function handleItemImageFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploadingItemImage(true);
      setError("");
      const imageUrl = await imageFileToDataUrl(file, { maxWidth: 1400, maxHeight: 1000, quality: 0.82 });
      setItemForm((prev) => ({ ...prev, imageUrl }));
      setSuccess("Immagine piatto caricata. Salva il prodotto per pubblicarla.");
    } catch (err) {
      setError(err.message || "Errore caricamento immagine");
    } finally {
      setUploadingItemImage(false);
      event.target.value = "";
    }
  }

  async function handleRestaurantLogoFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploadingRestaurantLogo(true);
      setError("");
      const logoUrl = await imageFileToDataUrl(file, { maxWidth: 900, maxHeight: 900, quality: 0.84 });
      setRestaurantForm((prev) => ({ ...prev, logoUrl }));
      setSuccess("Logo caricato. Salva il profilo ristorante per pubblicarlo.");
    } catch (err) {
      setError(err.message || "Errore caricamento logo");
    } finally {
      setUploadingRestaurantLogo(false);
      event.target.value = "";
    }
  }

  async function handleDeleteItem(id) {
    if (!window.confirm("Eliminare questo prodotto?")) return;
    try {
      setError("");
      setSuccess("");
      await apiDelete(`/menu/${id}`);
      setSuccess("Prodotto eliminato");
      await loadData();
    } catch (err) {
      setError(err.message || "Errore eliminazione prodotto");
    }
  }

  async function duplicateItem(item) {
    try {
      setError("");
      setSuccess("");
      await apiPost("/menu", {
        name: `${item.name || "Prodotto"} copia`,
        shortDescription: item.shortDescription || "",
        description: item.description || "",
        price: Number(item.price || 1),
        costPrice: Number(item.costPrice || 0),
        category: item.category || "",
        preparationArea: item.preparationArea || "kitchen",
        imageUrl: item.imageUrl || "",
        allergens: Array.isArray(item.allergens) ? item.allergens.join(", ") : item.allergens || "",
        sortOrder: Number(item.sortOrder || 0) + 1,
        vatRate: Number(item.vatRate || 10),
        isAvailable: false,
        trackStock: Boolean(item.trackStock),
        stockQuantity: Number(item.stockQuantity || 0),
        lowStockThreshold: Number(item.lowStockThreshold || 0),
      });
      setSuccess("Prodotto duplicato come bozza offline");
      await loadData();
    } catch (err) {
      setError(err.message || "Errore duplicazione prodotto");
    }
  }

  async function handleEditItem(item) {
    setActiveTab("menu");
    setEditingItemId(item.id);
    setItemForm({
      name: item.name || "",
      shortDescription: item.shortDescription || "",
      description: item.description || "",
      price: item.price ?? "",
      costPrice: item.costPrice ?? "",
      category: item.category || "",
      preparationArea: item.preparationArea || "kitchen",
      imageUrl: item.imageUrl || "",
      allergens: Array.isArray(item.allergens) ? item.allergens.join(", ") : item.allergens || "",
      sortOrder: item.sortOrder ?? 0,
      vatRate: item.vatRate ?? 10,
      isAvailable: Boolean(item.isAvailable),
      trackStock: Boolean(item.trackStock),
      stockQuantity: item.stockQuantity ?? "",
      lowStockThreshold: item.lowStockThreshold ?? "",
    });
    setStockHistory([]);
    if (item.trackStock) {
      try {
        const movements = await apiGet(`/menu/${item.id}/stock`);
        setStockHistory(Array.isArray(movements) ? movements : []);
      } catch {
        setStockHistory([]);
      }
    }
  }

  async function toggleItemAvailability(item) {
    try {
      setError("");
      setSuccess("");
      await apiPatch(`/menu/${item.id}`, { isAvailable: !item.isAvailable });
      await loadData();
    } catch (err) {
      setError(err.message || "Errore aggiornamento disponibilità");
    }
  }

  async function handleTableSubmit(event) {
    event.preventDefault();
    try {
      setSavingTable(true);
      setError("");
      setSuccess("");
      await apiPost("/tables", {
        ...tableForm,
        sortOrder: Number(tableForm.sortOrder || 0),
      });
      setTableForm(emptyTable);
      setSuccess("Tavolo creato");
      await loadData();
    } catch (err) {
      setError(err.message || "Errore creazione tavolo");
    } finally {
      setSavingTable(false);
    }
  }

  async function toggleTable(table) {
    try {
      await apiPatch(`/tables/${table.id}`, { isActive: !table.isActive });
      await loadData();
    } catch (err) {
      setError(err.message || "Errore aggiornamento tavolo");
    }
  }

  async function regenerateQr(table) {
    try {
      await apiPatch(`/tables/${table.id}`, { regenerateQrToken: true });
      setSuccess(`QR rigenerato per ${table.name}`);
      await loadData();
    } catch (err) {
      setError(err.message || "Errore rigenerazione QR");
    }
  }

  async function handleUserSubmit(event) {
    event.preventDefault();
    try {
      setSavingUser(true);
      setError("");
      setSuccess("");
      await apiPost("/users", {
        name: userForm.name.trim(),
        accessMode: userForm.accessMode,
        pin: userForm.accessMode === "pin" ? userForm.pin : undefined,
        email: userForm.accessMode === "email" ? userForm.email.trim().toLowerCase() : undefined,
        password: userForm.accessMode === "email" ? userForm.password : undefined,
        role: userForm.role,
      });
      setUserForm(emptyUser);
      setSuccess("Utente staff creato");
      await loadData();
    } catch (err) {
      setError(err.message || "Errore creazione utente");
    } finally {
      setSavingUser(false);
    }
  }

  async function toggleUser(user) {
    try {
      setError("");
      setSuccess("");
      await apiPatch(`/users/${user.id}`, { isActive: !user.isActive });
      setSuccess(user.isActive ? "Utente disattivato" : "Utente riattivato");
      await loadData();
    } catch (err) {
      setError(err.message || "Errore aggiornamento utente");
    }
  }

  function startUserAccessEdit(user) {
    setEditingUserId(user.id);
    setUserAccessForm({ role: user.role, pin: "" });
    setError("");
    setSuccess("");
  }

  async function saveUserAccess(user) {
    const nextPin = userAccessForm.pin.trim();
    if (nextPin && !/^\d{4,6}$/.test(nextPin)) {
      setError("Il nuovo PIN deve contenere da 4 a 6 numeri.");
      return;
    }

    try {
      setSavingUser(true);
      setError("");
      setSuccess("");
      await apiPatch(`/users/${user.id}`, {
        role: userAccessForm.role,
        ...(nextPin ? { pin: nextPin } : {}),
      });
      setEditingUserId("");
      setUserAccessForm({ role: "waiter", pin: "" });
      setSuccess("Accesso aggiornato. Dopo un cambio di ruolo o PIN, l'utente dovrà autenticarsi di nuovo.");
      await loadData();
    } catch (err) {
      setError(err.message || "Errore aggiornamento ruolo");
    } finally {
      setSavingUser(false);
    }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Eliminare l'accesso di ${user.name || user.email}?`)) return;
    try {
      setError("");
      setSuccess("");
      await apiDelete(`/users/${user.id}`);
      setSuccess("Utente eliminato");
      await loadData();
    } catch (err) {
      setError(err.message || "Errore eliminazione utente");
    }
  }

  function renderMenu() {
    return (
      <>
      <div className="menu-health-grid">
        <div className="management-card menu-health-main">
          <SectionHead
            title="Stato menu"
            subtitle="Controllo essenziale di ciò che il cliente può ordinare dal tavolo."
          />
          <div className="menu-health-metrics">
            <div><span>Menu</span><strong>{menuQuality.total}</strong></div>
            <div><span>Non disponibili</span><strong>{menuQuality.unavailable}</strong></div>
          </div>
        </div>
      </div>

      {customerMenuLink ? (
        <a className="menu-customer-strip" href={customerMenuLink} target="_blank" rel="noreferrer">
          <span>Menu cliente</span>
          <strong>Visualizza ciò che vede il cliente</strong>
          <small>Apri l'anteprima reale collegata al primo QR tavolo attivo.</small>
        </a>
      ) : (
        <button type="button" className="menu-customer-strip" onClick={() => { window.location.href = "/tavoli"; }}>
          <span>Menu cliente</span>
          <strong>Crea un tavolo per vedere il menu cliente</strong>
          <small>Il menu pubblico funziona tramite QR tavolo.</small>
        </button>
      )}

      <div className="menu-action-board">
        {[
          ["all", "Menu", menuQuality.total, "Tutti i prodotti visibili nella gestione menu."],
          ["offline", "Non disponibili", menuQuality.unavailable, "Controlla cosa il cliente non può ordinare."],
        ].map(([filter, title, value, hint]) => (
          <button
            key={filter}
            type="button"
            className={qualityFilter === filter ? "is-active" : ""}
            onClick={() => setQualityFilter(filter === "all" || qualityFilter === filter ? "all" : filter)}
          >
            <span>{title}</span>
            <b>{value}</b>
            <small>{hint}</small>
          </button>
        ))}
      </div>

      <div className="menu-editor-layout">
        <form className="management-card menu-editor-card" onSubmit={handleItemSubmit}>
          <SectionHead
            title={editingItemId ? "Modifica prodotto" : "Nuovo prodotto"}
            subtitle="Scheda pulita come la vede il ristoratore: foto, prezzo, categoria, descrizione e disponibilità."
          />
          <datalist id="menu-categories">{categorySuggestions.map((category) => <option key={category} value={category} />)}</datalist>
          <div className="menu-editor-grid">
            <div className="menu-editor-fields">
              <div className="menu-editor-row wide-price">
                <Field label="Nome prodotto">
                  <TextInput placeholder="Es. Carbonara" value={itemForm.name} onChange={(e) => setItemForm((prev) => ({ ...prev, name: e.target.value }))} />
                </Field>
                <Field label="Prezzo">
                  <TextInput placeholder="12.00" type="number" step="0.01" value={itemForm.price} onChange={(e) => setItemForm((prev) => ({ ...prev, price: e.target.value }))} />
                </Field>
              </div>
              <div className="menu-editor-row wide-price">
                <Field label="Categoria">
                  <TextInput placeholder="Primi" list="menu-categories" value={itemForm.category} onChange={(e) => setItemForm((prev) => ({ ...prev, category: e.target.value }))} />
                </Field>
                <Field label="Reparto">
                  <SelectInput value={itemForm.preparationArea} onChange={(e) => setItemForm((prev) => ({ ...prev, preparationArea: e.target.value }))}>
                    <option value="kitchen">Cucina</option>
                    <option value="bar">Bar</option>
                  </SelectInput>
                </Field>
              </div>
              <Field label="Descrizione breve">
                <TextArea placeholder="Es. Guanciale croccante, uova e pecorino romano" value={itemForm.shortDescription} onChange={(e) => setItemForm((prev) => ({ ...prev, shortDescription: e.target.value, description: e.target.value }))} />
              </Field>
              <Field label="Allergeni">
                <TextInput placeholder="Es. glutine, uova, latte" value={itemForm.allergens} onChange={(e) => setItemForm((prev) => ({ ...prev, allergens: e.target.value }))} />
              </Field>
              <details className="menu-management-details">
                <summary>Costi e scorte</summary>
                <div className="menu-management-details__body">
                  <div className="menu-editor-row wide-price">
                    <Field label="Costo materia prima">
                      <TextInput placeholder="4.20" type="number" min="0" step="0.01" value={itemForm.costPrice} onChange={(e) => setItemForm((prev) => ({ ...prev, costPrice: e.target.value }))} />
                    </Field>
                    <div className="menu-margin-preview">
                      <span>Margine lordo stimato</span>
                      <strong>{itemForm.price ? `${marginPercent(itemForm).toFixed(0)}%` : "-"}</strong>
                      <small>{itemForm.price ? formatEuro(Number(itemForm.price) - Number(itemForm.costPrice || 0)) : "Inserisci prezzo e costo"}</small>
                    </div>
                  </div>
                  <label className="management-check-row">
                    <input type="checkbox" checked={itemForm.trackStock} onChange={(e) => setItemForm((prev) => ({ ...prev, trackStock: e.target.checked }))} />
                    <span><b>Controlla le scorte</b><small>Quando arrivano a zero, il prodotto diventa non disponibile.</small></span>
                  </label>
                  {itemForm.trackStock ? (
                    <div className="menu-editor-row wide-price">
                      <Field label="Quantità disponibile">
                        <TextInput type="number" min="0" step="0.001" value={itemForm.stockQuantity} onChange={(e) => setItemForm((prev) => ({ ...prev, stockQuantity: e.target.value }))} />
                      </Field>
                      <Field label="Avvisami sotto">
                        <TextInput type="number" min="0" step="0.001" value={itemForm.lowStockThreshold} onChange={(e) => setItemForm((prev) => ({ ...prev, lowStockThreshold: e.target.value }))} />
                      </Field>
                    </div>
                  ) : null}
                  {editingItemId && stockHistory.length ? (
                    <details className="stock-history">
                      <summary>Ultimi movimenti ({stockHistory.length})</summary>
                      <div>
                        {stockHistory.slice(0, 8).map((movement) => (
                          <p key={movement.id}>
                            <b>{Number(movement.quantityChange) > 0 ? "+" : ""}{formatQuantity(movement.quantityChange)}</b>
                            <span>{movement.reason || "Movimento scorte"} · {new Date(movement.createdAt).toLocaleString("it-IT")}</span>
                          </p>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              </details>
              <Field label="Foto piatto">
                <div className="management-upload-row">
                  <TextInput placeholder="URL immagine oppure carica da PC" value={itemForm.imageUrl} onChange={(e) => setItemForm((prev) => ({ ...prev, imageUrl: e.target.value }))} />
                  <label className="management-file-button">
                    {uploadingItemImage ? "Carico..." : "Da PC"}
                    <input type="file" accept="image/*" onChange={handleItemImageFile} disabled={uploadingItemImage} />
                  </label>
                </div>
              </Field>
              <div className="menu-editor-actions">
                <label className="management-badge green"><input type="checkbox" checked={itemForm.isAvailable} onChange={(e) => setItemForm((prev) => ({ ...prev, isAvailable: e.target.checked }))} /> Disponibile</label>
                <button className="management-btn" type="submit" disabled={savingItem}>{savingItem ? "Salvataggio..." : editingItemId ? "Salva modifica" : "Aggiungi prodotto"}</button>
                {editingItemId ? <button className="management-btn secondary" type="button" onClick={() => { setEditingItemId(""); setItemForm(emptyItem); setStockHistory([]); }}>Annulla</button> : null}
              </div>
            </div>

            <aside className="menu-product-preview">
              {itemForm.imageUrl ? <img src={itemForm.imageUrl} alt="Anteprima piatto" /> : <div className="menu-product-image-empty">Foto</div>}
              <span>{itemForm.category || "Menu"}</span>
              <h3>{itemForm.name || "Nome prodotto"}</h3>
              <p>{itemForm.shortDescription || itemForm.description || "Descrizione breve visibile nel menu cliente."}</p>
              <strong>{itemForm.price ? formatEuro(itemForm.price) : "Prezzo"}</strong>
              <small>{itemForm.isAvailable ? "Visibile nel menu cliente" : "Non disponibile"}</small>
              {itemForm.imageUrl ? <button type="button" onClick={() => setItemForm((prev) => ({ ...prev, imageUrl: "" }))}>Rimuovi foto</button> : null}
            </aside>
          </div>
        </form>

        <div className="management-card menu-catalog-card">
          <SectionHead
            title="Catalogo"
            subtitle={`${filteredMenu.length} prodotti visibili. Modifica disponibilità, prezzo e dettagli senza cambiare pagina.`}
            action={
              <div className="management-inline-tools">
                <TextInput placeholder="Cerca prodotto" value={query} onChange={(e) => setQuery(e.target.value)} />
                <SelectInput value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="all">Tutte le categorie</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </SelectInput>
                <SelectInput value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                  <option value="all">Tutti i reparti</option>
                  <option value="kitchen">Cucina</option>
                  <option value="bar">Bar</option>
                </SelectInput>
                <SelectInput value={qualityFilter} onChange={(e) => setQualityFilter(e.target.value)}>
                  <option value="all">Stato: tutti</option>
                  <option value="offline">Non disponibili</option>
                </SelectInput>
              </div>
            }
          />
          <div className="management-list">
            {filteredMenu.map((item) => (
              <div key={item.id} className="management-list-row">
                <div>
                  <div className="management-row-title">{item.name}</div>
                  <div className="management-row-meta">{item.category || "Senza categoria"} - {item.preparationArea === "bar" ? "Bar" : "Cucina"}</div>
                  <div className="management-price">
                    {formatEuro(item.price)}
                    {Number(item.costPrice) > 0 ? <small> · margine {marginPercent(item).toFixed(0)}%</small> : null}
                  </div>
                  {item.trackStock ? (
                    <div className={`stock-inline ${Number(item.stockQuantity) <= Number(item.lowStockThreshold) ? "is-low" : ""}`}>
                      Scorta {formatQuantity(item.stockQuantity)}
                    </div>
                  ) : null}
                </div>
                <div className="management-row" style={{ justifyContent: "flex-end" }}>
                  <span className={`management-badge ${item.isAvailable ? "green" : "red"}`}>{item.isAvailable ? "Online" : "Esaurito"}</span>
                  <button className="management-btn secondary" type="button" onClick={() => toggleItemAvailability(item)}>{item.isAvailable ? "Esaurisci" : "Rimetti"}</button>
                  <button className="management-btn secondary" type="button" onClick={() => duplicateItem(item)}>Duplica</button>
                  <button className="management-btn secondary" type="button" onClick={() => handleEditItem(item)}>Modifica</button>
                  <button className="management-btn danger" type="button" onClick={() => handleDeleteItem(item.id)}>Elimina</button>
                </div>
              </div>
            ))}
            {filteredMenu.length === 0 ? <div className="management-subtitle">Nessun prodotto trovato.</div> : null}
          </div>
        </div>
      </div>
      </>
    );
  }

  function renderTables() {
    return (
      <div className="management-grid-2">
        <form className="management-card management-form" onSubmit={handleTableSubmit}>
          <SectionHead title="Nuovo tavolo" subtitle="Creazione veloce: basta numero tavolo e ordine mappa." />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Nome"><TextInput placeholder="Tavolo 24" value={tableForm.name} onChange={(e) => setTableForm((prev) => ({ ...prev, name: e.target.value }))} /></Field>
            <Field label="Codice"><TextInput placeholder="24" value={tableForm.code} onChange={(e) => setTableForm((prev) => ({ ...prev, code: e.target.value }))} /></Field>
          </div>
          <Field label="Ordine mappa"><TextInput type="number" value={tableForm.sortOrder} onChange={(e) => setTableForm((prev) => ({ ...prev, sortOrder: e.target.value }))} /></Field>
          <button className="management-btn" type="submit" disabled={savingTable}>{savingTable ? "Creazione..." : "Crea tavolo"}</button>
          <button className="management-btn secondary" type="button" onClick={() => window.location.href = "/tavoli"}>Apri sala operativa</button>
        </form>

        <div className="management-card">
          <SectionHead title="Mappa configurazione" subtitle="Vista per zone: gestibile anche con centinaia di tavoli." action={<button className="management-btn secondary" onClick={() => window.location.href = "/qr"}>QR massivi</button>} />
          <div className="management-list">
            {tablesByZone.map(([zone, zoneTables]) => (
              <div key={zone}>
                <div className="management-row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
                  <div className="management-row-title">{zone}</div>
                  <span className="management-badge gray">{zoneTables.length} tavoli</span>
                </div>
                <div className="table-planner-grid">
                  {zoneTables.map((table) => (
                    <div key={table.id} className={`table-planner-seat ${table.isActive ? "" : "off"}`}>
                      <strong>{table.code || table.name}</strong>
                      <span>{table.isActive ? "Attivo" : "Nascosto"}</span>
                      <div className="management-row" style={{ gap: 6 }}>
                        <button className="management-btn secondary" type="button" style={{ padding: "7px 9px", minHeight: 0, fontSize: 12 }} onClick={() => toggleTable(table)}>{table.isActive ? "Off" : "On"}</button>
                        <button className="management-btn secondary" type="button" style={{ padding: "7px 9px", minHeight: 0, fontSize: 12 }} onClick={() => regenerateQr(table)}>QR</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {tables.length === 0 ? <div className="management-subtitle">Nessun tavolo presente.</div> : null}
          </div>
        </div>
      </div>
    );
  }

  function renderStaff() {
    const staffAccessUrl = `${window.location.origin}/staff?restaurant=${encodeURIComponent(restaurant?.slug || "")}`;

    async function copyStaffAccessUrl() {
      try {
        await navigator.clipboard.writeText(staffAccessUrl);
        setSuccess("Link accesso staff copiato.");
        setError("");
      } catch {
        setError("Non riesco a copiare il link. Aprilo e condividilo dal browser.");
      }
    }

    return (
      <div className="management-grid-2">
        <div className="management-card" style={{ gridColumn: "1 / -1" }}>
          <SectionHead
            title="App staff"
            subtitle="Condividi questo link una volta: il telefono ricorderà il locale e chiederà soltanto il PIN personale."
            action={<button className="management-btn secondary" type="button" onClick={copyStaffAccessUrl}>Copia link</button>}
          />
          <div className="staff-code-note">
            <span>Accesso rapido</span>
            <strong>{staffAccessUrl}</strong>
            <small>Dopo l'apertura, lo staff può installare Ordynora sulla schermata Home.</small>
          </div>
        </div>

        <form className="management-card management-form" onSubmit={handleUserSubmit}>
          <SectionHead title="Nuovo accesso" subtitle="Sul tablet condiviso basta un PIN. Email e password restano disponibili per chi lavora da remoto." />
          <div className="staff-access-switch" aria-label="Tipo di accesso">
            <button type="button" className={userForm.accessMode === "pin" ? "is-active" : ""} onClick={() => setUserForm((prev) => ({ ...prev, accessMode: "pin" }))}>PIN rapido</button>
            <button type="button" className={userForm.accessMode === "email" ? "is-active" : ""} onClick={() => setUserForm((prev) => ({ ...prev, accessMode: "email" }))}>Email</button>
          </div>
          <Field label="Nome"><TextInput placeholder="Mario" value={userForm.name} onChange={(e) => setUserForm((prev) => ({ ...prev, name: e.target.value }))} /></Field>
          {userForm.accessMode === "pin" ? (
            <>
              <Field label="PIN personale"><TextInput placeholder="4-6 numeri" type="password" inputMode="numeric" minLength="4" maxLength="6" value={userForm.pin} onChange={(e) => setUserForm((prev) => ({ ...prev, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))} /></Field>
              <div className="staff-code-note"><span>Codice ristorante</span><strong>{restaurant?.slug || "-"}</strong><small>Lo staff inserisce questo codice e il proprio PIN nella pagina di accesso. Ogni ruolo apre solo le schermate utili al proprio lavoro.</small></div>
            </>
          ) : (
            <>
              <Field label="Email"><TextInput placeholder="mario@ristorante.it" type="email" value={userForm.email} onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))} /></Field>
              <Field label="Password temporanea"><TextInput placeholder="Minimo 8 caratteri" type="password" value={userForm.password} onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))} /></Field>
            </>
          )}
          <Field label="Ruolo">
            <SelectInput value={userForm.role} onChange={(e) => setUserForm((prev) => ({ ...prev, role: e.target.value }))}>
              <option value="kitchen">Cucina</option>
              <option value="bar">Bar</option>
              <option value="waiter">Sala / cameriere</option>
              <option value="cashier">Cassa</option>
              <option value="admin">Admin</option>
            </SelectInput>
          </Field>
          <button className="management-btn" type="submit" disabled={savingUser}>{savingUser ? "Creazione..." : "Crea accesso"}</button>
        </form>

        <div className="management-card">
          <SectionHead title="Team" subtitle="Controllo rapido degli accessi attivi." />
          <div className="management-list">
            {staffUsers.map((user) => (
              <div key={user.id} className="management-list-row">
                <div>
                  <div className="management-row-title">{user.name || user.email}</div>
                  <div className="management-row-meta">{user.pinEnabled ? "Accesso PIN" : user.email} - {getRoleLabel(user.role)}</div>
                </div>
                <div className="management-row" style={{ justifyContent: "flex-end" }}>
                  <span className={`management-badge ${user.isActive ? "green" : "red"}`}>{user.isActive ? "Attivo" : "Disattivo"}</span>
                  {user.role === "owner" ? (
                    <span className="management-badge gray">Titolare</span>
                  ) : (
                    <>
                      <button className="management-btn secondary" type="button" onClick={() => startUserAccessEdit(user)}>Ruolo e accesso</button>
                      <button className="management-btn secondary" type="button" onClick={() => toggleUser(user)}>{user.isActive ? "Disattiva" : "Riattiva"}</button>
                      <button className="management-btn danger" type="button" onClick={() => deleteUser(user)}>Elimina</button>
                    </>
                  )}
                </div>
                {editingUserId === user.id ? (
                  <div className="staff-role-editor">
                    <label>
                      Ruolo
                      <select value={userAccessForm.role} onChange={(event) => setUserAccessForm((prev) => ({ ...prev, role: event.target.value }))}>
                        <option value="kitchen">Cucina</option>
                        <option value="bar">Bar</option>
                        <option value="waiter">Sala / cameriere</option>
                        <option value="cashier">Cassa</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                    {user.isPinOnly ? (
                      <label>
                        Nuovo PIN (facoltativo)
                        <input type="password" inputMode="numeric" minLength="4" maxLength="6" placeholder="Lascia vuoto per non cambiarlo" value={userAccessForm.pin} onChange={(event) => setUserAccessForm((prev) => ({ ...prev, pin: event.target.value.replace(/\D/g, "").slice(0, 6) }))} />
                      </label>
                    ) : null}
                    <div>
                      <button className="management-btn" type="button" disabled={savingUser} onClick={() => saveUserAccess(user)}>{savingUser ? "Salvataggio..." : "Salva accesso"}</button>
                      <button className="management-btn secondary" type="button" disabled={savingUser} onClick={() => setEditingUserId("")}>Annulla</button>
                    </div>
                    <small>Se cambi ruolo o PIN, Ordynora disconnette le sessioni precedenti di questo utente.</small>
                  </div>
                ) : null}
              </div>
            ))}
            {staffUsers.length === 0 ? <div className="management-subtitle">Nessun utente staff creato.</div> : null}
          </div>
        </div>
      </div>
    );
  }

  async function handleInstallApp() {
    if (pwa.installed) {
      setInstallHelp("Ordynora risulta già installata su questo dispositivo.");
      return;
    }
    const result = await pwa.requestInstall();
    if (result.status === "accepted" || result.status === "installed") {
      setInstallHelp("Ordynora installata correttamente su questo dispositivo.");
      return;
    }
    setInstallHelp(`${pwa.manualCopy} Puoi tornare qui in qualsiasi momento: chiudere la notifica non blocca più l'installazione.`);
    window.dispatchEvent(new CustomEvent("ordynora:show-install-banner"));
  }

  function renderSettings() {
    const privacyItems = [
      "SuperAdmin: dati economici nascosti in modalità assistenza",
      "Accesso al ristorante solo con motivo supporto o consenso",
      "Pagine pubbliche privacy, termini e cookie già disponibili",
    ];

    return (
      <div className="settings-os-grid">
        <form className="management-card management-form settings-brand-panel" onSubmit={handleRestaurantSubmit}>
          <SectionHead
            title="Profilo ristorante"
            subtitle="Identità pubblica, brand, valuta e stato del locale."
          />
          <Field label="Nome ristorante"><TextInput value={restaurantForm.name} onChange={(e) => setRestaurantForm((prev) => ({ ...prev, name: e.target.value }))} /></Field>
          <div className="settings-brand-row">
            <Field label="Colore primario"><TextInput value={restaurantForm.primaryColor} onChange={(e) => setRestaurantForm((prev) => ({ ...prev, primaryColor: e.target.value }))} /></Field>
            <Field label="Valuta"><TextInput value={restaurantForm.currency} onChange={(e) => setRestaurantForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} /></Field>
          </div>
          <Field label="Logo ristorante">
            <div className="management-upload-row">
              <TextInput value={restaurantForm.logoUrl} onChange={(e) => setRestaurantForm((prev) => ({ ...prev, logoUrl: e.target.value }))} />
              <label className="management-file-button">
                {uploadingRestaurantLogo ? "Carico..." : "Da PC"}
                <input type="file" accept="image/*" onChange={handleRestaurantLogoFile} disabled={uploadingRestaurantLogo} />
              </label>
            </div>
            {restaurantForm.logoUrl ? (
              <div className="management-logo-preview">
                <img src={restaurantForm.logoUrl} alt="Logo ristorante" />
              </div>
            ) : null}
          </Field>
          <label className="management-badge green" style={{ width: "fit-content" }}><input type="checkbox" checked={restaurantForm.isActive} onChange={(e) => setRestaurantForm((prev) => ({ ...prev, isActive: e.target.checked }))} /> Ristorante attivo</label>
          <button className="management-btn" type="submit" disabled={savingRestaurant}>{savingRestaurant ? "Salvataggio..." : "Salva profilo"}</button>
        </form>

        <div className="settings-os-stack">
          <div className="management-card settings-group-card">
            <SectionHead
              title="Configurazione essenziale"
              subtitle="Poche sezioni chiare: profilo, setup, app staff e amministrazione. Menu e tavoli restano nelle loro pagine dedicate."
            />
            <div className="settings-card-grid">
              <SettingsCard icon="SET" title="Setup guidato" subtitle="Completa Ordynora passo passo." action="Apri" onClick={() => window.location.href = "/onboarding"} />
              <SettingsCard icon="BRD" title="Brand e colori" subtitle="Logo, colore primario e valuta del menu." action="Modifica" onClick={() => document.querySelector(".settings-brand-panel")?.scrollIntoView({ behavior: "smooth" })} />
              <SettingsCard icon="APP" title="Installa app" subtitle="Installa Ordynora su telefono, tablet o PC anche se hai chiuso la notifica iniziale." action={pwa.installed ? "Installata" : pwa.canPrompt ? "Installa" : "Guida"} tone="app" onClick={handleInstallApp} />
            </div>
            {installHelp ? <div className="settings-install-help">{installHelp}</div> : null}
          </div>

          <div className="management-card settings-staff-note">
            <SectionHead title="Staff opzionale" subtitle="Non è obbligatorio registrare subito più email o più personale." />
            <p>
              Il ristorante può partire con un solo account owner. Gli accessi separati per cucina, bar e cassa servono solo
              se il locale vuole tablet o operatori dedicati.
            </p>
            <button className="management-btn secondary" type="button" onClick={() => { setActiveTab("staff"); navigate("/admin?tab=staff", { replace: true }); }}>
              Configura staff più avanti
            </button>
          </div>

          <div className="management-card settings-group-card">
            <SectionHead title="Amministrazione" subtitle="Piano, documenti e assistenza: solo ciò che serve per gestire il locale." />
            <div className="settings-card-grid two">
              <SettingsCard icon="PAY" title="Abbonamento" subtitle={`Piano attuale: ${restaurant?.plan || "mensile"}`} action="Gestisci" tone="billing" onClick={() => window.location.href = "/billing"} />
              <SettingsCard icon="DOC" title="Privacy e documenti" subtitle="Policy, termini, cookie e trattamento dati." action="Apri" onClick={() => document.querySelector(".settings-privacy-panel")?.scrollIntoView({ behavior: "smooth" })} />
              <SettingsCard icon="SOS" title="Contattaci" subtitle="Problemi tecnici o dubbi operativi. Risposta entro 24h." action="Assistenza" tone="support" onClick={() => document.querySelector(".settings-support-panel")?.scrollIntoView({ behavior: "smooth" })} />
            </div>
          </div>

          <div className="management-card settings-support-panel">
            <SectionHead title="Contattaci" subtitle="Se il ristorante riscontra un problema, Ordynora risponde entro 24 ore lavorative." />
            <div className="settings-support-grid">
              <a href={supportWhatsAppUrl} target="_blank" rel="noreferrer">
                <strong>WhatsApp</strong>
                <span>{SUPPORT_PHONE}</span>
                <small>Per problemi durante il servizio o richieste urgenti.</small>
              </a>
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Supporto Ordynora`}>
                <strong>Email supporto</strong>
                <span>{SUPPORT_EMAIL}</span>
                <small>Per domande su account, abbonamento, QR o configurazione.</small>
              </a>
              <button type="button" onClick={() => window.location.href = "/errori"}>
                <strong>Diagnostica</strong>
                <span>Apri errori e log</span>
                <small>Utile se serve allegare dettagli tecnici alla richiesta.</small>
              </button>
            </div>
          </div>

          <div className="management-card settings-privacy-panel">
            <SectionHead title="Privacy e documenti" subtitle="Prima della vendita pubblica serve separare supporto tecnico, dati cliente e documentazione legale." />
            <div className="settings-privacy-layout">
              <div>
                <div className="settings-privacy-title">Privacy mode attivo</div>
                <p className="management-subtitle">Quando accedi come SuperAdmin dentro un ristorante, i valori economici sono oscurati per ridurre l'accesso non necessario ai dati operativi.</p>
                <ul className="settings-checklist">
                  {privacyItems.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div className="settings-doc-list">
                <div><strong>Privacy Policy</strong><span><a href="/privacy" target="_blank" rel="noreferrer">Apri pagina pubblica</a></span></div>
                <div><strong>Termini di servizio</strong><span><a href="/termini" target="_blank" rel="noreferrer">Apri pagina pubblica</a></span></div>
                <div><strong>DPA / Nomina responsabile</strong><span>Bozza in docs/legal da validare</span></div>
                <div><strong>Cookie policy</strong><span><a href="/cookie" target="_blank" rel="noreferrer">Apri pagina pubblica</a></span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={embedded ? { marginBottom: 16 } : glowPageStyle}>
      {!embedded ? <Navbar /> : null}
      <div style={embedded ? { padding: 0 } : appShellStyle}>
        <div className="app-shell management-os">
          <div className="management-hero">
            <div className="management-hero-main">
              <div className="management-kicker">Ordynora - gestione</div>
              <h1 className="management-hero-title">{pageTitle}</h1>
              <p className="management-hero-subtitle">{pageSubtitle}</p>
            </div>
          </div>

          {error ? <div className="management-card" style={{ borderColor: "#fecaca", color: "#b91c1c" }}>{error}</div> : null}
          {success ? <div className="management-card" style={{ borderColor: "#bbf7d0", color: "#166534" }}>{success}</div> : null}

          {loading ? <div className="management-card">Caricamento gestione...</div> : null}
          {!loading && activeTab === "menu" ? renderMenu() : null}
          {!loading && activeTab === "tables" ? renderTables() : null}
          {!loading && activeTab === "staff" ? renderStaff() : null}
          {!loading && activeTab === "settings" ? renderSettings() : null}
        </div>
      </div>
    </div>
  );
}

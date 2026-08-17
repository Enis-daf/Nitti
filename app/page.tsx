"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Organization = {
  id: string;
  name: string;
};

type ItemOption = {
  id: string;
  sku: string;
  name: string;
  item_type: "component" | "product";
};

type Supplier = {
  id: string;
  name: string;
};

type SupplierOrderStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

type SupplierOrderLine = {
  id: string;
  item_id: string;
  quantity_ordered: number;
  quantity_received: number;
  items: { sku: string; name: string };
};

type SupplierOrder = {
  id: string;
  order_number: string | null;
  expected_at: string | null;
  status: SupplierOrderStatus;
  supplier_id: string | null;
  supplier_order_lines: SupplierOrderLine[];
};

function supplierOrderStatusLabel(status: SupplierOrderStatus) {
  if (status === "draft") return "Brouillon";
  if (status === "ordered") return "Commandée";
  if (status === "partially_received") return "Partiellement reçue";
  if (status === "received") return "Reçue";
  return "Annulée";
}

type DraftOrderLine = {
  itemId: string;
  quantity: string;
};

type BomLine = {
  id: string;
  product_item_id: string;
  component_item_id: string;
  quantity_per: number;
};

type CustomerOrderStatus = "draft" | "confirmed" | "fulfilled" | "cancelled";

type CustomerOrderLine = {
  id: string;
  product_item_id: string;
  quantity: number;
  items: { sku: string; name: string };
};

type CustomerOrder = {
  id: string;
  order_number: string | null;
  customer_name: string;
  status: CustomerOrderStatus;
  customer_order_lines: CustomerOrderLine[];
};

type DraftCustomerOrderLine = {
  itemId: string;
  quantity: string;
};

type DashboardRow = {
  item_id: string;
  sku: string;
  name: string;
  item_type: "component" | "product";
  low_stock_threshold: number | string;
  quantity_physical: number | string;
  quantity_ordered: number | string;
  quantity_reserved: number | string;
  quantity_available: number | string;
  alert_status:
    | "missing_physical_stock"
    | "missing_physical_and_ordered_stock"
    | "low_physical_stock"
    | "ok";
};

function quantity(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0);
  return Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(2);
}

function alertLabel(status: DashboardRow["alert_status"]) {
  if (status === "missing_physical_stock") return "Stock physique insuffisant";
  if (status === "missing_physical_and_ordered_stock") {
    return "Stock physique + commandé insuffisant";
  }
  if (status === "low_physical_stock") return "Stock physique bas";
  return "OK";
}

export default function Home() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [organizationName, setOrganizationName] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [needsOrganization, setNeedsOrganization] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardRow[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);

  const [itemSku, setItemSku] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemType, setItemType] = useState<"component" | "product">("component");
  const [itemThreshold, setItemThreshold] = useState("0");

  const [movementItemId, setMovementItemId] = useState("");
  const [movementType, setMovementType] = useState<"initial_count" | "adjustment">(
    "initial_count",
  );
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementNote, setMovementNote] = useState("");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierOrders, setSupplierOrders] = useState<SupplierOrder[]>([]);

  const [supplierName, setSupplierName] = useState("");

  const [orderSupplierId, setOrderSupplierId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderExpectedAt, setOrderExpectedAt] = useState("");
  const [orderLines, setOrderLines] = useState<DraftOrderLine[]>([
    { itemId: "", quantity: "" },
  ]);

  const [receiptDrafts, setReceiptDrafts] = useState<
    Record<string, { quantity: string; note: string }>
  >({});

  const [bomLines, setBomLines] = useState<BomLine[]>([]);
  const [bomProducedItemId, setBomProducedItemId] = useState("");
  const [bomInputItemId, setBomInputItemId] = useState("");
  const [bomQuantityPer, setBomQuantityPer] = useState("");

  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerOrderNumber, setCustomerOrderNumber] = useState("");
  const [customerOrderLines, setCustomerOrderLines] = useState<DraftCustomerOrderLine[]>([
    { itemId: "", quantity: "" },
  ]);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const loadStockData = useCallback(async (organizationId: string) => {
    const [dashboardResult, itemsResult] = await Promise.all([
      supabase
        .from("stock_dashboard")
        .select("*")
        .eq("organization_id", organizationId)
        .order("sku"),
      supabase
        .from("items")
        .select("id, sku, name, item_type")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("sku"),
    ]);

    if (dashboardResult.error) {
      setMessage(dashboardResult.error.message);
    } else {
      setDashboard((dashboardResult.data ?? []) as DashboardRow[]);
    }

    if (itemsResult.error) {
      setMessage(itemsResult.error.message);
    } else {
      const nextItems = (itemsResult.data ?? []) as ItemOption[];
      setItems(nextItems);
      setMovementItemId((current) => current || nextItems[0]?.id || "");
    }
  }, []);

  const loadSupplierData = useCallback(async (organizationId: string) => {
    const [suppliersResult, ordersResult] = await Promise.all([
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("supplier_orders")
        .select(
          "id, order_number, expected_at, status, supplier_id, supplier_order_lines(id, item_id, quantity_ordered, quantity_received, items(sku, name))",
        )
        .eq("organization_id", organizationId)
        .in("status", ["ordered", "partially_received"])
        .order("created_at", { ascending: false }),
    ]);

    if (suppliersResult.error) {
      setMessage(suppliersResult.error.message);
    } else {
      setSuppliers((suppliersResult.data ?? []) as Supplier[]);
    }

    if (ordersResult.error) {
      setMessage(ordersResult.error.message);
    } else {
      setSupplierOrders((ordersResult.data ?? []) as unknown as SupplierOrder[]);
    }
  }, []);

  const loadCustomerData = useCallback(async (organizationId: string) => {
    const [bomResult, ordersResult] = await Promise.all([
      supabase
        .from("bom_lines")
        .select("id, product_item_id, component_item_id, quantity_per")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("customer_orders")
        .select(
          "id, order_number, customer_name, status, customer_order_lines(id, product_item_id, quantity, items(sku, name))",
        )
        .eq("organization_id", organizationId)
        .eq("status", "confirmed")
        .order("created_at", { ascending: false }),
    ]);

    if (bomResult.error) {
      setMessage(bomResult.error.message);
    } else {
      setBomLines((bomResult.data ?? []) as BomLine[]);
    }

    if (ordersResult.error) {
      setMessage(ordersResult.error.message);
    } else {
      setCustomerOrders((ordersResult.data ?? []) as unknown as CustomerOrder[]);
    }
  }, []);

  const loadOrganization = useCallback(async () => {
    setLoading(true);

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .limit(1);

    if (membershipError) {
      setMessage(membershipError.message);
      setLoading(false);
      return;
    }

    if (!memberships || memberships.length === 0) {
      setNeedsOrganization(true);
      setOrganization(null);
      setLoading(false);
      return;
    }

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", memberships[0].organization_id)
      .single();

    if (orgError) {
      setMessage(orgError.message);
    } else {
      setOrganization(org);
      setNeedsOrganization(false);
      await Promise.all([
        loadStockData(org.id),
        loadSupplierData(org.id),
        loadCustomerData(org.id),
      ]);
    }

    setLoading(false);
  }, [loadStockData, loadSupplierData, loadCustomerData]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;

      if (!user) {
        setLoading(false);
        return;
      }

      setUserEmail(user.email ?? null);
      void loadOrganization();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setUserEmail(user?.email ?? null);

      if (user) {
        void loadOrganization();
      } else {
        setOrganization(null);
        setNeedsOrganization(false);
        setDashboard([]);
        setItems([]);
        setSuppliers([]);
        setSupplierOrders([]);
        setBomLines([]);
        setCustomerOrders([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadOrganization]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        setMessage(error.message);
      } else if (data.session) {
        await createOrganization();
        setMessage("Compte créé.");
      } else {
        setMessage("Compte créé. Confirme l'email reçu avant de te connecter.");
      }

      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
    }
  }

  async function createOrganization() {
    const name = organizationName.trim() || "Mon entreprise";

    const { error } = await supabase.rpc("create_organization", {
      org_name: name,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    await loadOrganization();
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) return;

    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("items").insert({
      organization_id: organization.id,
      sku: itemSku.trim(),
      name: itemName.trim(),
      item_type: itemType,
      low_stock_threshold: Number(itemThreshold || 0),
    });

    if (error) {
      setMessage(error.message);
    } else {
      setItemSku("");
      setItemName("");
      setItemThreshold("0");
      await loadStockData(organization.id);
    }

    setLoading(false);
  }

  async function addStockMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !movementItemId) return;

    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("stock_movements").insert({
      organization_id: organization.id,
      item_id: movementItemId,
      movement_type: movementType,
      quantity: Number(movementQuantity),
      note: movementNote.trim() || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMovementQuantity("");
      setMovementNote("");
      await loadStockData(organization.id);
    }

    setLoading(false);
  }

  async function addSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) return;

    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("suppliers").insert({
      organization_id: organization.id,
      name: supplierName.trim(),
    });

    if (error) {
      setMessage(error.message);
    } else {
      setSupplierName("");
      await loadSupplierData(organization.id);
    }

    setLoading(false);
  }

  function updateOrderLine(index: number, patch: Partial<DraftOrderLine>) {
    setOrderLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function addOrderLine() {
    setOrderLines((current) => [...current, { itemId: "", quantity: "" }]);
  }

  function removeOrderLine(index: number) {
    setOrderLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  async function addSupplierOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) return;

    const validLines = orderLines
      .map((line) => ({ itemId: line.itemId, quantity: Number(line.quantity) }))
      .filter((line) => line.itemId && line.quantity > 0);

    if (validLines.length === 0) {
      setMessage("Ajoute au moins une ligne avec un article et une quantité.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { data: order, error: orderError } = await supabase
      .from("supplier_orders")
      .insert({
        organization_id: organization.id,
        supplier_id: orderSupplierId || null,
        order_number: orderNumber.trim() || null,
        expected_at: orderExpectedAt || null,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      setMessage(orderError?.message ?? "Erreur lors de la création de la commande.");
      setLoading(false);
      return;
    }

    const { error: linesError } = await supabase.from("supplier_order_lines").insert(
      validLines.map((line) => ({
        organization_id: organization.id,
        supplier_order_id: order.id,
        item_id: line.itemId,
        quantity_ordered: line.quantity,
      })),
    );

    if (linesError) {
      setMessage(linesError.message);
    } else {
      setOrderSupplierId("");
      setOrderNumber("");
      setOrderExpectedAt("");
      setOrderLines([{ itemId: "", quantity: "" }]);
      await Promise.all([
        loadSupplierData(organization.id),
        loadStockData(organization.id),
      ]);
    }

    setLoading(false);
  }

  async function receiveLine(lineId: string) {
    if (!organization) return;

    const draft = receiptDrafts[lineId];
    const receivedQuantity = Number(draft?.quantity ?? "");

    if (!receivedQuantity || receivedQuantity <= 0) {
      setMessage("Indique une quantité reçue valide.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.rpc("receive_supplier_order_line", {
      p_line_id: lineId,
      p_quantity: receivedQuantity,
      p_note: draft?.note?.trim() || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setReceiptDrafts((current) => {
        const next = { ...current };
        delete next[lineId];
        return next;
      });
      await Promise.all([
        loadSupplierData(organization.id),
        loadStockData(organization.id),
      ]);
    }

    setLoading(false);
  }

  async function addBomLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) return;

    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("bom_lines").insert({
      organization_id: organization.id,
      product_item_id: bomProducedItemId,
      component_item_id: bomInputItemId,
      quantity_per: Number(bomQuantityPer),
    });

    if (error) {
      setMessage(error.message);
    } else {
      setBomProducedItemId("");
      setBomInputItemId("");
      setBomQuantityPer("");
      await loadCustomerData(organization.id);
    }

    setLoading(false);
  }

  function updateCustomerOrderLine(index: number, patch: Partial<DraftCustomerOrderLine>) {
    setCustomerOrderLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function addCustomerOrderLine() {
    setCustomerOrderLines((current) => [...current, { itemId: "", quantity: "" }]);
  }

  function removeCustomerOrderLine(index: number) {
    setCustomerOrderLines((current) =>
      current.filter((_, lineIndex) => lineIndex !== index),
    );
  }

  async function addCustomerOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) return;

    if (!customerName.trim()) {
      setMessage("Indique le nom du client.");
      return;
    }

    const validLines = customerOrderLines
      .map((line) => ({ itemId: line.itemId, quantity: Number(line.quantity) }))
      .filter((line) => line.itemId && line.quantity > 0);

    if (validLines.length === 0) {
      setMessage("Ajoute au moins une ligne avec un produit et une quantité.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { data: order, error: orderError } = await supabase
      .from("customer_orders")
      .insert({
        organization_id: organization.id,
        customer_name: customerName.trim(),
        order_number: customerOrderNumber.trim() || null,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      setMessage(orderError?.message ?? "Erreur lors de la création de la commande.");
      setLoading(false);
      return;
    }

    const { error: linesError } = await supabase.from("customer_order_lines").insert(
      validLines.map((line) => ({
        organization_id: organization.id,
        customer_order_id: order.id,
        product_item_id: line.itemId,
        quantity: line.quantity,
      })),
    );

    if (linesError) {
      setMessage(linesError.message);
    } else {
      setCustomerName("");
      setCustomerOrderNumber("");
      setCustomerOrderLines([{ itemId: "", quantity: "" }]);
      await Promise.all([
        loadCustomerData(organization.id),
        loadStockData(organization.id),
      ]);
    }

    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const alertCount = dashboard.filter((row) => row.alert_status !== "ok").length;
  const productItems = items.filter((item) => item.item_type === "product");
  const componentItems = items.filter((item) => item.item_type === "component");

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <p>Chargement…</p>
      </main>
    );
  }

  if (!userEmail) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <form
          onSubmit={handleAuth}
          className="w-full max-w-sm flex flex-col gap-4 border rounded-lg p-6"
        >
          <h1 className="text-xl font-semibold">Nitti</h1>

          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded border px-3 py-1.5 ${
                mode === "signin" ? "bg-black text-white" : ""
              }`}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded border px-3 py-1.5 ${
                mode === "signup" ? "bg-black text-white" : ""
              }`}
            >
              Créer un compte
            </button>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="border rounded px-3 py-1.5"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Mot de passe
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="border rounded px-3 py-1.5"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded bg-black text-white px-3 py-2 disabled:opacity-50"
          >
            {mode === "signup" ? "Créer un compte" : "Se connecter"}
          </button>

          {message && <p className="text-sm text-red-600">{message}</p>}
        </form>
      </main>
    );
  }

  if (needsOrganization) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createOrganization();
          }}
          className="w-full max-w-sm flex flex-col gap-4 border rounded-lg p-6"
        >
          <h1 className="text-xl font-semibold">Créer ton organisation</h1>

          <label className="flex flex-col gap-1 text-sm">
            Nom de l'entreprise
            <input
              type="text"
              required
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="Nom de l'entreprise"
              className="border rounded px-3 py-1.5"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded bg-black text-white px-3 py-2 disabled:opacity-50"
          >
            Créer
          </button>

          {message && <p className="text-sm text-red-600">{message}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col gap-8 p-8 max-w-5xl mx-auto w-full">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{organization?.name}</h1>
          <p className="text-sm text-neutral-500">{userEmail}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded border px-3 py-1.5 text-sm"
        >
          Déconnexion
        </button>
      </header>

      {message && <p className="text-sm text-red-600">{message}</p>}

      <section className="grid gap-6 md:grid-cols-2">
        <form
          onSubmit={addItem}
          className="flex flex-col gap-3 border rounded-lg p-4"
        >
          <h2 className="font-medium">Nouvelle référence</h2>

          <label className="flex flex-col gap-1 text-sm">
            SKU
            <input
              type="text"
              required
              value={itemSku}
              onChange={(event) => setItemSku(event.target.value)}
              className="border rounded px-3 py-1.5"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Nom
            <input
              type="text"
              required
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
              className="border rounded px-3 py-1.5"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Type
            <select
              value={itemType}
              onChange={(event) =>
                setItemType(event.target.value as "component" | "product")
              }
              className="border rounded px-3 py-1.5"
            >
              <option value="component">Intrant</option>
              <option value="product">Produit fini</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Seuil d'alerte
            <input
              type="number"
              min="0"
              value={itemThreshold}
              onChange={(event) => setItemThreshold(event.target.value)}
              className="border rounded px-3 py-1.5"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded bg-black text-white px-3 py-2 disabled:opacity-50"
          >
            Ajouter la référence
          </button>
        </form>

        <form
          onSubmit={addStockMovement}
          className="flex flex-col gap-3 border rounded-lg p-4"
        >
          <h2 className="font-medium">Mouvement de stock</h2>

          <label className="flex flex-col gap-1 text-sm">
            Référence
            <select
              required
              value={movementItemId}
              onChange={(event) => setMovementItemId(event.target.value)}
              className="border rounded px-3 py-1.5"
            >
              <option value="" disabled>
                Sélectionner une référence
              </option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} — {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Type
            <select
              value={movementType}
              onChange={(event) =>
                setMovementType(
                  event.target.value as "initial_count" | "adjustment",
                )
              }
              className="border rounded px-3 py-1.5"
            >
              <option value="initial_count">Stock initial</option>
              <option value="adjustment">Ajustement</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Quantité
            <input
              type="number"
              required
              step="0.01"
              value={movementQuantity}
              onChange={(event) => setMovementQuantity(event.target.value)}
              className="border rounded px-3 py-1.5"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Note
            <input
              type="text"
              value={movementNote}
              onChange={(event) => setMovementNote(event.target.value)}
              className="border rounded px-3 py-1.5"
            />
          </label>

          <button
            type="submit"
            disabled={loading || !movementItemId}
            className="rounded bg-black text-white px-3 py-2 disabled:opacity-50"
          >
            Enregistrer le mouvement
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Commandes fournisseurs</h2>

        <div className="grid gap-6 md:grid-cols-2">
          <form
            onSubmit={addSupplier}
            className="flex flex-col gap-3 border rounded-lg p-4"
          >
            <h3 className="font-medium text-sm">Nouveau fournisseur</h3>

            <label className="flex flex-col gap-1 text-sm">
              Nom
              <input
                type="text"
                required
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
                className="border rounded px-3 py-1.5"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="rounded bg-black text-white px-3 py-2 disabled:opacity-50"
            >
              Ajouter le fournisseur
            </button>
          </form>

          <form
            onSubmit={addSupplierOrder}
            className="flex flex-col gap-3 border rounded-lg p-4"
          >
            <h3 className="font-medium text-sm">Nouvelle commande fournisseur</h3>

            <label className="flex flex-col gap-1 text-sm">
              Fournisseur (optionnel)
              <select
                value={orderSupplierId}
                onChange={(event) => setOrderSupplierId(event.target.value)}
                className="border rounded px-3 py-1.5"
              >
                <option value="">Aucun</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Numéro de commande
              <input
                type="text"
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
                className="border rounded px-3 py-1.5"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Date attendue
              <input
                type="date"
                value={orderExpectedAt}
                onChange={(event) => setOrderExpectedAt(event.target.value)}
                className="border rounded px-3 py-1.5"
              />
            </label>

            <div className="flex flex-col gap-2">
              <p className="text-sm">Lignes</p>
              {orderLines.map((line, index) => (
                <div key={index} className="flex gap-2">
                  <select
                    required
                    value={line.itemId}
                    onChange={(event) =>
                      updateOrderLine(index, { itemId: event.target.value })
                    }
                    className="border rounded px-3 py-1.5 flex-1"
                  >
                    <option value="" disabled>
                      Article
                    </option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sku} — {item.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    placeholder="Qté"
                    value={line.quantity}
                    onChange={(event) =>
                      updateOrderLine(index, { quantity: event.target.value })
                    }
                    className="border rounded px-3 py-1.5 w-24"
                  />
                  {orderLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeOrderLine(index)}
                      className="text-sm text-red-600 px-2"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addOrderLine}
                className="text-sm text-left underline w-fit"
              >
                + Ajouter une ligne
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="rounded bg-black text-white px-3 py-2 disabled:opacity-50"
            >
              Créer la commande
            </button>
          </form>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-sm">Commandes ouvertes</h3>

          {supplierOrders.length === 0 && (
            <p className="text-sm text-neutral-500">
              Aucune commande fournisseur ouverte.
            </p>
          )}

          {supplierOrders.map((order) => (
            <div key={order.id} className="border rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">
                    {order.order_number || "Sans numéro"}
                  </span>
                  {" — "}
                  {suppliers.find((supplier) => supplier.id === order.supplier_id)
                    ?.name ?? "Fournisseur non renseigné"}
                  {order.expected_at && ` — attendu le ${order.expected_at}`}
                </div>
                <span
                  className={
                    order.status === "partially_received" ? "text-orange-600" : ""
                  }
                >
                  {supplierOrderStatusLabel(order.status)}
                </span>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="py-1">Article</th>
                    <th className="py-1 text-right">Commandé</th>
                    <th className="py-1 text-right">Reçu</th>
                    <th className="py-1 text-right">Restant</th>
                    <th className="py-1">Réception</th>
                  </tr>
                </thead>
                <tbody>
                  {order.supplier_order_lines.map((line) => {
                    const remaining = line.quantity_ordered - line.quantity_received;
                    const draft = receiptDrafts[line.id];

                    return (
                      <tr key={line.id} className="border-t">
                        <td className="py-1">
                          {line.items.sku} — {line.items.name}
                        </td>
                        <td className="py-1 text-right">
                          {quantity(line.quantity_ordered)}
                        </td>
                        <td className="py-1 text-right">
                          {quantity(line.quantity_received)}
                        </td>
                        <td className="py-1 text-right">{quantity(remaining)}</td>
                        <td className="py-1">
                          {remaining > 0 ? (
                            <div className="flex gap-2 items-center">
                              <input
                                type="number"
                                min="0"
                                max={remaining}
                                step="0.01"
                                placeholder="Qté reçue"
                                value={draft?.quantity ?? ""}
                                onChange={(event) =>
                                  setReceiptDrafts((current) => ({
                                    ...current,
                                    [line.id]: {
                                      quantity: event.target.value,
                                      note: current[line.id]?.note ?? "",
                                    },
                                  }))
                                }
                                className="border rounded px-2 py-1 w-20"
                              />
                              <button
                                type="button"
                                onClick={() => void receiveLine(line.id)}
                                disabled={loading}
                                className="rounded border px-2 py-1 disabled:opacity-50"
                              >
                                Réceptionner
                              </button>
                            </div>
                          ) : (
                            "Complet"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Nomenclatures (BOM)</h2>

        <form
          onSubmit={addBomLine}
          className="flex flex-col gap-3 border rounded-lg p-4 max-w-md"
        >
          <label className="flex flex-col gap-1 text-sm">
            Référence produite
            <select
              required
              value={bomProducedItemId}
              onChange={(event) => setBomProducedItemId(event.target.value)}
              className="border rounded px-3 py-1.5"
            >
              <option value="" disabled>
                Sélectionner une référence
              </option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} — {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Intrant
            <select
              required
              value={bomInputItemId}
              onChange={(event) => setBomInputItemId(event.target.value)}
              className="border rounded px-3 py-1.5"
            >
              <option value="" disabled>
                Sélectionner un intrant
              </option>
              {componentItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} — {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Quantité par référence produite
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={bomQuantityPer}
              onChange={(event) => setBomQuantityPer(event.target.value)}
              className="border rounded px-3 py-1.5"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded bg-black text-white px-3 py-2 disabled:opacity-50"
          >
            Ajouter la ligne de nomenclature
          </button>
        </form>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr className="text-left">
                <th className="px-3 py-2">Référence produite</th>
                <th className="px-3 py-2">Intrant</th>
                <th className="px-3 py-2 text-right">Quantité par référence produite</th>
              </tr>
            </thead>
            <tbody>
              {bomLines.map((line) => {
                const product = items.find((item) => item.id === line.product_item_id);
                const component = items.find(
                  (item) => item.id === line.component_item_id,
                );

                return (
                  <tr key={line.id} className="border-t">
                    <td className="px-3 py-2">
                      {product ? `${product.sku} — ${product.name}` : line.product_item_id}
                    </td>
                    <td className="px-3 py-2">
                      {component
                        ? `${component.sku} — ${component.name}`
                        : line.component_item_id}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {quantity(line.quantity_per)}
                    </td>
                  </tr>
                );
              })}
              {bomLines.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-neutral-500" colSpan={3}>
                    Aucune nomenclature pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Commandes clients</h2>

        <form
          onSubmit={addCustomerOrder}
          className="flex flex-col gap-3 border rounded-lg p-4 max-w-md"
        >
          <label className="flex flex-col gap-1 text-sm">
            Client
            <input
              type="text"
              required
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              className="border rounded px-3 py-1.5"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Numéro de commande (optionnel)
            <input
              type="text"
              value={customerOrderNumber}
              onChange={(event) => setCustomerOrderNumber(event.target.value)}
              className="border rounded px-3 py-1.5"
            />
          </label>

          <div className="flex flex-col gap-2">
            <p className="text-sm">Lignes</p>
            {customerOrderLines.map((line, index) => (
              <div key={index} className="flex gap-2">
                <select
                  required
                  value={line.itemId}
                  onChange={(event) =>
                    updateCustomerOrderLine(index, { itemId: event.target.value })
                  }
                  className="border rounded px-3 py-1.5 flex-1"
                >
                  <option value="" disabled>
                    Produit fini
                  </option>
                  {productItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} — {item.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="Qté"
                  value={line.quantity}
                  onChange={(event) =>
                    updateCustomerOrderLine(index, { quantity: event.target.value })
                  }
                  className="border rounded px-3 py-1.5 w-24"
                />
                {customerOrderLines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCustomerOrderLine(index)}
                    className="text-sm text-red-600 px-2"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addCustomerOrderLine}
              className="text-sm text-left underline w-fit"
            >
              + Ajouter une ligne
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded bg-black text-white px-3 py-2 disabled:opacity-50"
          >
            Créer la commande confirmée
          </button>
        </form>

        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-sm">Commandes confirmées ouvertes</h3>

          {customerOrders.length === 0 && (
            <p className="text-sm text-neutral-500">
              Aucune commande client confirmée.
            </p>
          )}

          {customerOrders.map((order) => (
            <div key={order.id} className="border rounded-lg p-4 flex flex-col gap-3">
              <div className="text-sm">
                <span className="font-medium">{order.customer_name}</span>
                {order.order_number && ` — ${order.order_number}`}
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="py-1">Produit fini</th>
                    <th className="py-1 text-right">Quantité</th>
                  </tr>
                </thead>
                <tbody>
                  {order.customer_order_lines.map((line) => (
                    <tr key={line.id} className="border-t">
                      <td className="py-1">
                        {line.items.sku} — {line.items.name}
                      </td>
                      <td className="py-1 text-right">{quantity(line.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">
          Stock {alertCount > 0 && `— ${alertCount} alerte(s)`}
        </h2>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr className="text-left">
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Nom</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Stock physique</th>
                <th className="px-3 py-2 text-right">Commandé</th>
                <th className="px-3 py-2 text-right">Réservé</th>
                <th className="px-3 py-2 text-right">Disponible</th>
                <th className="px-3 py-2">Alerte</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.map((row) => (
                <tr key={row.item_id} className="border-t">
                  <td className="px-3 py-2">{row.sku}</td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">
                    {row.item_type === "component" ? "Intrant" : "Produit fini"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {quantity(row.quantity_physical)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {quantity(row.quantity_ordered)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {quantity(row.quantity_reserved)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {quantity(row.quantity_available)}
                  </td>
                  <td className="px-3 py-2">
                    {row.alert_status === "ok" ? (
                      "OK"
                    ) : (
                      <span className="text-red-600">
                        {alertLabel(row.alert_status)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {dashboard.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-neutral-500" colSpan={8}>
                    Aucune référence pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
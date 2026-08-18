"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
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

type ProductionOrderStatus = "draft" | "planned" | "completed" | "cancelled";

type ProductionOrder = {
  id: string;
  produced_item_id: string;
  quantity_planned: number;
  quantity_completed: number;
  status: ProductionOrderStatus;
  planned_at: string | null;
  note: string | null;
};

type ShortageLine = {
  itemId: string;
  label: string;
  required: number;
  available: number;
  missing: number;
};

type AvailabilityStatus = "ok" | "missing" | "too_late" | "not_ordered";

type IntrantAvailability = {
  itemId: string;
  label: string;
  required: number;
  availableAtDate: number;
  missing: number;
  nextArrival: string | null;
  status: AvailabilityStatus;
};

function availabilityStatusLabel(status: AvailabilityStatus) {
  if (status === "ok") return "OK";
  if (status === "missing") return "Stock insuffisant";
  if (status === "too_late") return "Arrive trop tard";
  return "À commander";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

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
  if (status === "missing_physical_stock") return "En stock insuffisant";
  if (status === "missing_physical_and_ordered_stock") {
    return "En stock + commandé insuffisant";
  }
  if (status === "low_physical_stock") return "En stock bas";
  return "OK";
}

function AlertBadge({ status }: { status: DashboardRow["alert_status"] }) {
  const classes =
    status === "ok"
      ? "bg-surface-mint text-foreground"
      : status === "low_physical_stock"
        ? "bg-surface-pink text-foreground"
        : "bg-accent text-white";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium leading-tight ${classes}`}
    >
      {alertLabel(status)}
    </span>
  );
}

function StockTable({ rows }: { rows: DashboardRow[] }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm table-fixed">
        <thead className="bg-background border-b-2 border-border">
          <tr className="text-left">
            <th className="px-2 py-2 font-semibold overflow-hidden w-[15%]">SKU</th>
            <th className="px-2 py-2 font-semibold overflow-hidden w-[23%]">Nom</th>
            <th className="px-2 py-2 font-semibold text-right overflow-hidden w-[10%]">
              Physique
            </th>
            <th className="px-2 py-2 font-semibold text-right overflow-hidden w-[11%]">
              Commandé
            </th>
            <th className="px-2 py-2 font-semibold text-right overflow-hidden w-[10%]">
              Réservé
            </th>
            <th className="px-2 py-2 font-semibold text-right overflow-hidden w-[11%]">
              Disponible
            </th>
            <th className="px-2 py-2 font-semibold overflow-hidden w-[20%]">Alerte</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.item_id} className="border-t border-border">
              <td className="px-2 py-2 overflow-hidden text-ellipsis whitespace-nowrap">
                {row.sku}
              </td>
              <td className="px-2 py-2 overflow-hidden text-ellipsis whitespace-nowrap">
                {row.name}
              </td>
              <td className="px-2 py-2 text-right">{quantity(row.quantity_physical)}</td>
              <td className="px-2 py-2 text-right">{quantity(row.quantity_ordered)}</td>
              <td className="px-2 py-2 text-right">{quantity(row.quantity_reserved)}</td>
              <td className="px-2 py-2 text-right">{quantity(row.quantity_available)}</td>
              <td className="px-2 py-2">
                <AlertBadge status={row.alert_status} />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-2 py-4 text-center text-muted" colSpan={7}>
                Aucune référence pour le moment.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CollapsibleSection({
  id,
  title,
  defaultOpen,
  children,
}: {
  id: string;
  title: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const stored = window.localStorage.getItem(`nitti-section-${id}`);
    if (stored !== null) setOpen(stored === "open");
  }, [id]);

  useEffect(() => {
    window.localStorage.setItem(`nitti-section-${id}`, open ? "open" : "closed");
  }, [id, open]);

  return (
    <section className="border border-border rounded-lg bg-background">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full flex items-center justify-between px-4 py-3 text-left rounded-lg transition-colors hover:bg-black/[0.02]"
      >
        <h2 className="font-medium">{title}</h2>
        <span
          className={`text-muted text-sm transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      {open && <div className="px-4 pb-4 flex flex-col gap-4">{children}</div>}
    </section>
  );
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

  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([]);
  const [productionItemId, setProductionItemId] = useState("");
  const [productionQuantity, setProductionQuantity] = useState("");
  const [productionPlannedAt, setProductionPlannedAt] = useState("");
  const [productionNote, setProductionNote] = useState("");

  const [shortageByOrder, setShortageByOrder] = useState<Record<string, ShortageLine[]>>({});
  const [overrideReasonByOrder, setOverrideReasonByOrder] = useState<Record<string, string>>({});

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

  const loadProductionData = useCallback(async (organizationId: string) => {
    const { data, error } = await supabase
      .from("production_orders")
      .select(
        "id, produced_item_id, quantity_planned, quantity_completed, status, planned_at, note",
      )
      .eq("organization_id", organizationId)
      .eq("status", "planned")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
    } else {
      setProductionOrders((data ?? []) as ProductionOrder[]);
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
        loadProductionData(org.id),
      ]);
    }

    setLoading(false);
  }, [loadStockData, loadSupplierData, loadCustomerData, loadProductionData]);

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
        setProductionOrders([]);
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

  async function updateSupplierOrder(
    orderId: string,
    patch: {
      supplier_id?: string | null;
      order_number?: string | null;
      expected_at?: string | null;
      status?: SupplierOrderStatus;
    },
  ) {
    if (!organization) return;

    const { error } = await supabase
      .from("supplier_orders")
      .update(patch)
      .eq("id", orderId);

    if (error) {
      setMessage(error.message);
    } else {
      await Promise.all([
        loadSupplierData(organization.id),
        loadStockData(organization.id),
      ]);
    }
  }

  async function updateSupplierOrderLineQuantity(
    lineId: string,
    quantityOrdered: number,
    currentReceived: number,
  ) {
    if (!organization) return;

    if (!quantityOrdered || quantityOrdered <= 0) {
      setMessage("La quantité commandée doit être positive.");
      return;
    }

    if (quantityOrdered < currentReceived) {
      setMessage(
        "La quantité commandée ne peut pas être inférieure à la quantité déjà reçue.",
      );
      return;
    }

    const { error } = await supabase
      .from("supplier_order_lines")
      .update({ quantity_ordered: quantityOrdered })
      .eq("id", lineId);

    if (error) {
      setMessage(error.message);
    } else {
      await Promise.all([
        loadSupplierData(organization.id),
        loadStockData(organization.id),
      ]);
    }
  }

  async function deleteSupplierOrderLine(lineId: string) {
    if (!organization) return;

    const { error } = await supabase.from("supplier_order_lines").delete().eq("id", lineId);

    if (error) {
      setMessage(error.message);
    } else {
      await Promise.all([
        loadSupplierData(organization.id),
        loadStockData(organization.id),
      ]);
    }
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

  async function updateBomLineQuantity(lineId: string, quantityPer: number) {
    if (!organization) return;

    if (!quantityPer || quantityPer <= 0) {
      setMessage("La quantité par référence produite doit être positive.");
      return;
    }

    const { error } = await supabase
      .from("bom_lines")
      .update({ quantity_per: quantityPer })
      .eq("id", lineId);

    if (error) {
      setMessage(error.message);
    } else {
      await loadCustomerData(organization.id);
    }
  }

  async function deleteBomLine(lineId: string) {
    if (!organization) return;

    const { error } = await supabase.from("bom_lines").delete().eq("id", lineId);

    if (error) {
      setMessage(error.message);
    } else {
      await loadCustomerData(organization.id);
    }
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

  async function updateCustomerOrder(
    orderId: string,
    patch: {
      customer_name?: string;
      order_number?: string | null;
      status?: CustomerOrderStatus;
    },
  ) {
    if (!organization) return;

    setLoading(true);
    setMessage("");

    const { error } = await supabase
      .from("customer_orders")
      .update(patch)
      .eq("id", orderId);

    if (error) {
      setMessage(error.message);
    } else {
      await Promise.all([
        loadCustomerData(organization.id),
        loadStockData(organization.id),
      ]);
    }

    setLoading(false);
  }

  async function updateCustomerOrderLineQuantity(lineId: string, quantityValue: number) {
    if (!organization) return;

    if (!quantityValue || quantityValue <= 0) {
      setMessage("La quantité doit être positive.");
      return;
    }

    const { error } = await supabase
      .from("customer_order_lines")
      .update({ quantity: quantityValue })
      .eq("id", lineId);

    if (error) {
      setMessage(error.message);
    } else {
      await Promise.all([
        loadCustomerData(organization.id),
        loadStockData(organization.id),
      ]);
    }
  }

  async function deleteCustomerOrderLine(lineId: string) {
    if (!organization) return;

    const { error } = await supabase.from("customer_order_lines").delete().eq("id", lineId);

    if (error) {
      setMessage(error.message);
    } else {
      await Promise.all([
        loadCustomerData(organization.id),
        loadStockData(organization.id),
      ]);
    }
  }

  async function addProductionOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) return;

    const plannedQuantity = Number(productionQuantity);
    if (!productionItemId || !plannedQuantity || plannedQuantity <= 0) {
      setMessage("Sélectionne une référence et une quantité valide.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("production_orders").insert({
      organization_id: organization.id,
      produced_item_id: productionItemId,
      quantity_planned: plannedQuantity,
      planned_at: productionPlannedAt || null,
      note: productionNote.trim() || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setProductionItemId("");
      setProductionQuantity("");
      setProductionPlannedAt("");
      setProductionNote("");
      await loadProductionData(organization.id);
    }

    setLoading(false);
  }

  async function updateProductionOrder(
    orderId: string,
    patch: {
      produced_item_id?: string;
      quantity_planned?: number;
      planned_at?: string | null;
      note?: string | null;
      status?: ProductionOrderStatus;
    },
  ) {
    if (!organization) return;

    const { error } = await supabase
      .from("production_orders")
      .update(patch)
      .eq("id", orderId);

    if (error) {
      setMessage(error.message);
    } else {
      await loadProductionData(organization.id);
    }
  }

  function computeAvailabilityAtDate(order: ProductionOrder): IntrantAvailability[] {
    const targetDate = order.planned_at || todayISO();
    const requiredInputs = bomLines.filter(
      (line) => line.product_item_id === order.produced_item_id,
    );

    return requiredInputs.map((line) => {
      const itemId = line.component_item_id;
      const required = line.quantity_per * order.quantity_planned;

      const physical = Number(
        dashboard.find((row) => row.item_id === itemId)?.quantity_physical ?? 0,
      );

      let incomingByDate = 0;
      let nextArrival: string | null = null;

      for (const supplierOrder of supplierOrders) {
        if (!supplierOrder.expected_at) continue;

        for (const supplierLine of supplierOrder.supplier_order_lines) {
          if (supplierLine.item_id !== itemId) continue;

          const remaining = supplierLine.quantity_ordered - supplierLine.quantity_received;
          if (remaining <= 0) continue;

          if (nextArrival === null || supplierOrder.expected_at < nextArrival) {
            nextArrival = supplierOrder.expected_at;
          }

          if (supplierOrder.expected_at <= targetDate) {
            incomingByDate += remaining;
          }
        }
      }

      for (const otherOrder of productionOrders) {
        if (otherOrder.id === order.id) continue;
        if (otherOrder.produced_item_id !== itemId) continue;
        if (otherOrder.planned_at === null) continue;

        if (nextArrival === null || otherOrder.planned_at < nextArrival) {
          nextArrival = otherOrder.planned_at;
        }

        if (otherOrder.planned_at <= targetDate) {
          incomingByDate += otherOrder.quantity_planned;
        }
      }

      let competing = 0;

      for (const otherOrder of productionOrders) {
        if (otherOrder.id === order.id) continue;
        if (otherOrder.planned_at !== null && otherOrder.planned_at > targetDate) continue;

        const otherBomLines = bomLines.filter(
          (otherLine) =>
            otherLine.product_item_id === otherOrder.produced_item_id &&
            otherLine.component_item_id === itemId,
        );

        for (const otherLine of otherBomLines) {
          competing += otherLine.quantity_per * otherOrder.quantity_planned;
        }
      }

      const availableAtDate = physical + incomingByDate - competing;
      const missing = Math.max(required - availableAtDate, 0);

      let status: AvailabilityStatus;
      if (required <= availableAtDate) {
        status = "ok";
      } else if (nextArrival === null) {
        status = "not_ordered";
      } else if (nextArrival > targetDate) {
        status = "too_late";
      } else {
        status = "missing";
      }

      const inputItem = items.find((item) => item.id === itemId);

      return {
        itemId,
        label: inputItem ? `${inputItem.sku} — ${inputItem.name}` : itemId,
        required,
        availableAtDate,
        missing,
        nextArrival,
        status,
      };
    });
  }

  function computeShortage(order: ProductionOrder): ShortageLine[] {
    const requiredInputs = bomLines.filter(
      (line) => line.product_item_id === order.produced_item_id,
    );
    const shortages: ShortageLine[] = [];

    for (const line of requiredInputs) {
      const required = line.quantity_per * order.quantity_planned;
      const dashboardRow = dashboard.find((row) => row.item_id === line.component_item_id);
      const available = Number(dashboardRow?.quantity_available ?? 0);

      if (required > available) {
        const inputItem = items.find((item) => item.id === line.component_item_id);
        shortages.push({
          itemId: line.component_item_id,
          label: inputItem ? `${inputItem.sku} — ${inputItem.name}` : line.component_item_id,
          required,
          available,
          missing: required - available,
        });
      }
    }

    return shortages;
  }

  function handleCompleteClick(order: ProductionOrder) {
    const shortages = computeShortage(order);

    if (shortages.length === 0) {
      void completeProductionOrder(order.id);
      return;
    }

    setShortageByOrder((current) => ({ ...current, [order.id]: shortages }));
  }

  function forceCompleteProductionOrder(orderId: string) {
    const reason = overrideReasonByOrder[orderId]?.trim();

    if (!reason) {
      setMessage("Indique une justification pour forcer la complétion.");
      return;
    }

    void completeProductionOrder(orderId, reason);
  }

  async function completeProductionOrder(orderId: string, overrideReason?: string) {
    if (!organization) return;

    setLoading(true);
    setMessage("");

    const { error } = await supabase.rpc("complete_production_order", {
      p_order_id: orderId,
      p_override_reason: overrideReason ?? null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setShortageByOrder((current) => {
        const next = { ...current };
        delete next[orderId];
        return next;
      });
      setOverrideReasonByOrder((current) => {
        const next = { ...current };
        delete next[orderId];
        return next;
      });
      await Promise.all([
        loadProductionData(organization.id),
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
  const finishedGoodRows = dashboard
    .filter((row) => row.item_type === "product")
    .sort((a, b) => a.name.localeCompare(b.name));
  const inputRows = dashboard
    .filter((row) => row.item_type === "component")
    .sort((a, b) => a.name.localeCompare(b.name));

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
          className="w-full max-w-sm flex flex-col gap-4 border border-border rounded-lg p-6 bg-background"
        >
          <h1 className="text-xl font-semibold">Nitti</h1>

          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md border border-border px-3 py-1.5 transition-colors ${
                mode === "signin" ? "bg-accent text-white border-accent" : ""
              }`}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md border border-border px-3 py-1.5 transition-colors ${
                mode === "signup" ? "bg-accent text-white border-accent" : ""
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
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
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
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent text-white px-3 py-2 font-medium transition-colors hover:bg-accent-dark disabled:opacity-50 disabled:hover:bg-accent"
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
          className="w-full max-w-sm flex flex-col gap-4 border border-border rounded-lg p-6 bg-background"
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
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent text-white px-3 py-2 font-medium transition-colors hover:bg-accent-dark disabled:opacity-50 disabled:hover:bg-accent"
          >
            Créer
          </button>

          {message && <p className="text-sm text-red-600">{message}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col gap-8 px-6 py-8 md:px-10 max-w-[1800px] mx-auto w-full">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{organization?.name}</h1>
          <p className="text-sm text-muted">{userEmail}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
        >
          Déconnexion
        </button>
      </header>

      {message && <p className="text-sm text-red-600">{message}</p>}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <aside className="w-full lg:w-[55%] lg:shrink-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto flex flex-col gap-5 border border-border rounded-lg p-5 bg-background">
          <div>
            <h2 className="font-medium">Dashboard & alertes</h2>
            <div className="flex gap-8 mt-3 text-sm">
              <div>
                <p className="text-muted text-xs">Références</p>
                <p className="text-2xl font-semibold">{dashboard.length}</p>
              </div>
              <div>
                <p className="text-muted text-xs">Alertes</p>
                <p className={`text-2xl font-semibold ${alertCount > 0 ? "text-accent" : ""}`}>
                  {alertCount}
                </p>
              </div>
            </div>
          </div>

          {alertCount > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">Alertes importantes</p>
              <div className="flex flex-col gap-1.5">
                {dashboard
                  .filter((row) => row.alert_status !== "ok")
                  .map((row) => (
                    <div
                      key={row.item_id}
                      className="flex items-center justify-between gap-3 rounded-md bg-surface-pink px-3 py-2 text-sm"
                    >
                      <span className="truncate min-w-0">
                        {row.sku} — {row.name}
                      </span>
                      <AlertBadge status={row.alert_status} />
                    </div>
                  ))}
              </div>
            </div>
          )}

        <div>
          <p className="text-sm font-medium text-foreground mb-2">
            Produits finis ({finishedGoodRows.length})
          </p>
          <StockTable rows={finishedGoodRows} />
        </div>

        <div>
          <p className="text-sm font-medium text-foreground mb-2">
            Intrants ({inputRows.length})
          </p>
          <StockTable rows={inputRows} />
        </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <CollapsibleSection id="references" title="Références" defaultOpen={true}>
        <form
          onSubmit={addItem}
          className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-background"
        >
          <label className="flex flex-col gap-1 text-sm">
            SKU
            <input
              type="text"
              required
              value={itemSku}
              onChange={(event) => setItemSku(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Nom
            <input
              type="text"
              required
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Type
            <select
              value={itemType}
              onChange={(event) =>
                setItemType(event.target.value as "component" | "product")
              }
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
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
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent text-white px-3 py-2 font-medium transition-colors hover:bg-accent-dark disabled:opacity-50 disabled:hover:bg-accent"
          >
            Ajouter la référence
          </button>
        </form>
          </CollapsibleSection>

          <CollapsibleSection id="movements" title="Mouvements de stock" defaultOpen={false}>
        <form
          onSubmit={addStockMovement}
          className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-background"
        >
          <label className="flex flex-col gap-1 text-sm">
            Référence
            <select
              required
              value={movementItemId}
              onChange={(event) => setMovementItemId(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
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
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
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
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Note
            <input
              type="text"
              value={movementNote}
              onChange={(event) => setMovementNote(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <button
            type="submit"
            disabled={loading || !movementItemId}
            className="rounded-md bg-accent text-white px-3 py-2 font-medium transition-colors hover:bg-accent-dark disabled:opacity-50 disabled:hover:bg-accent"
          >
            Enregistrer le mouvement
          </button>
        </form>
          </CollapsibleSection>

          <CollapsibleSection id="bom" title="Nomenclatures" defaultOpen={false}>
        <form
          onSubmit={addBomLine}
          className="flex flex-col gap-3 border border-border rounded-lg p-4 max-w-md bg-background"
        >
          <label className="flex flex-col gap-1 text-sm">
            Référence produite
            <select
              required
              value={bomProducedItemId}
              onChange={(event) => setBomProducedItemId(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
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
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
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
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent text-white px-3 py-2 font-medium transition-colors hover:bg-accent-dark disabled:opacity-50 disabled:hover:bg-accent"
          >
            Ajouter la ligne de nomenclature
          </button>
        </form>

        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-background border-b-2 border-border">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Référence produite</th>
                <th className="px-3 py-2 font-semibold">Intrant</th>
                <th className="px-3 py-2 font-semibold text-right">
                  Quantité par référence produite
                </th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {bomLines.map((line) => {
                const product = items.find((item) => item.id === line.product_item_id);
                const component = items.find(
                  (item) => item.id === line.component_item_id,
                );

                return (
                  <tr key={line.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      {product ? `${product.sku} — ${product.name}` : line.product_item_id}
                    </td>
                    <td className="px-3 py-2">
                      {component
                        ? `${component.sku} — ${component.name}`
                        : line.component_item_id}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        defaultValue={line.quantity_per}
                        onBlur={(event) =>
                          void updateBomLineQuantity(line.id, Number(event.target.value))
                        }
                        className="border border-border rounded-md px-2 py-1 w-20 text-right bg-background text-foreground focus:outline-none focus:border-accent"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void deleteBomLine(line.id)}
                        disabled={loading}
                        className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                );
              })}
              {bomLines.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-muted" colSpan={4}>
                    Aucune nomenclature pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
          </CollapsibleSection>

          <CollapsibleSection id="customer-orders" title="Commandes clients" defaultOpen={false}>
        <form
          onSubmit={addCustomerOrder}
          className="flex flex-col gap-3 border border-border rounded-lg p-4 max-w-md bg-background"
        >
          <label className="flex flex-col gap-1 text-sm">
            Client
            <input
              type="text"
              required
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Numéro de commande (optionnel)
            <input
              type="text"
              value={customerOrderNumber}
              onChange={(event) => setCustomerOrderNumber(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
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
                  className="border border-border rounded-md px-3 py-1.5 flex-1 bg-background text-foreground focus:outline-none focus:border-accent"
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
                  className="border border-border rounded-md px-3 py-1.5 w-24 bg-background text-foreground focus:outline-none focus:border-accent"
                />
                {customerOrderLines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCustomerOrderLine(index)}
                    className="text-sm text-red-600 hover:text-red-700 px-2"
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
            className="rounded-md bg-accent text-white px-3 py-2 font-medium transition-colors hover:bg-accent-dark disabled:opacity-50 disabled:hover:bg-accent"
          >
            Créer la commande confirmée
          </button>
        </form>

        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-sm">Commandes confirmées ouvertes</h3>

          {customerOrders.length === 0 && (
            <p className="text-sm text-muted">
              Aucune commande client confirmée.
            </p>
          )}

          {customerOrders.map((order) => (
            <div key={order.id} className="border border-border rounded-lg p-4 flex flex-col gap-3 bg-background">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    defaultValue={order.customer_name}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value) void updateCustomerOrder(order.id, { customer_name: value });
                    }}
                    className="border border-border rounded-md px-2 py-1 text-xs font-medium bg-background text-foreground focus:outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    defaultValue={order.order_number ?? ""}
                    placeholder="Numéro"
                    onBlur={(event) =>
                      void updateCustomerOrder(order.id, {
                        order_number: event.target.value.trim() || null,
                      })
                    }
                    className="border border-border rounded-md px-2 py-1 text-xs w-28 bg-background text-foreground focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void updateCustomerOrder(order.id, { status: "fulfilled" })}
                    disabled={loading}
                    className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    Marquée livrée
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateCustomerOrder(order.id, { status: "cancelled" })}
                    disabled={loading}
                    className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    Annuler
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="px-2 py-1">Produit fini</th>
                      <th className="px-2 py-1 text-right">Quantité</th>
                      <th className="px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.customer_order_lines.map((line) => (
                      <tr key={line.id} className="border-t border-border">
                        <td className="px-2 py-1">
                          {line.items.sku} — {line.items.name}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            defaultValue={line.quantity}
                            onBlur={(event) =>
                              void updateCustomerOrderLineQuantity(
                                line.id,
                                Number(event.target.value),
                              )
                            }
                            className="border border-border rounded-md px-2 py-1 w-20 text-right bg-background text-foreground focus:outline-none focus:border-accent"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            onClick={() => void deleteCustomerOrderLine(line.id)}
                            disabled={loading}
                            className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
          </CollapsibleSection>

          <CollapsibleSection id="supplier-orders" title="Commandes fournisseurs" defaultOpen={false}>
        <div className="grid gap-6 md:grid-cols-2">
          <form
            onSubmit={addSupplier}
            className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-background"
          >
            <h3 className="font-medium text-sm">Nouveau fournisseur</h3>

            <label className="flex flex-col gap-1 text-sm">
              Nom
              <input
                type="text"
                required
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
                className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-accent text-white px-3 py-2 font-medium transition-colors hover:bg-accent-dark disabled:opacity-50 disabled:hover:bg-accent"
            >
              Ajouter le fournisseur
            </button>
          </form>

          <form
            onSubmit={addSupplierOrder}
            className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-background"
          >
            <h3 className="font-medium text-sm">Nouvelle commande fournisseur</h3>

            <label className="flex flex-col gap-1 text-sm">
              Fournisseur (optionnel)
              <select
                value={orderSupplierId}
                onChange={(event) => setOrderSupplierId(event.target.value)}
                className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
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
                className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Date attendue
              <input
                type="date"
                value={orderExpectedAt}
                onChange={(event) => setOrderExpectedAt(event.target.value)}
                className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
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
                    className="border border-border rounded-md px-3 py-1.5 flex-1 bg-background text-foreground focus:outline-none focus:border-accent"
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
                    className="border border-border rounded-md px-3 py-1.5 w-24 bg-background text-foreground focus:outline-none focus:border-accent"
                  />
                  {orderLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeOrderLine(index)}
                      className="text-sm text-red-600 hover:text-red-700 px-2"
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
              className="rounded-md bg-accent text-white px-3 py-2 font-medium transition-colors hover:bg-accent-dark disabled:opacity-50 disabled:hover:bg-accent"
            >
              Créer la commande
            </button>
          </form>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-sm">Commandes ouvertes</h3>

          {supplierOrders.length === 0 && (
            <p className="text-sm text-muted">
              Aucune commande fournisseur ouverte.
            </p>
          )}

          {supplierOrders.map((order) => (
            <div key={order.id} className="border border-border rounded-lg p-4 flex flex-col gap-3 bg-background">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    defaultValue={order.order_number ?? ""}
                    placeholder="Numéro"
                    onBlur={(event) =>
                      void updateSupplierOrder(order.id, {
                        order_number: event.target.value.trim() || null,
                      })
                    }
                    className="border border-border rounded-md px-2 py-1 text-xs w-28 bg-background text-foreground focus:outline-none focus:border-accent"
                  />
                  <select
                    value={order.supplier_id ?? ""}
                    onChange={(event) =>
                      void updateSupplierOrder(order.id, {
                        supplier_id: event.target.value || null,
                      })
                    }
                    className="border border-border rounded-md px-2 py-1 text-xs bg-background text-foreground focus:outline-none focus:border-accent"
                  >
                    <option value="">Aucun fournisseur</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={order.expected_at ?? ""}
                    onChange={(event) =>
                      void updateSupplierOrder(order.id, {
                        expected_at: event.target.value || null,
                      })
                    }
                    className="border border-border rounded-md px-2 py-1 text-xs bg-background text-foreground focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      order.status === "partially_received" ? "text-orange-600" : ""
                    }
                  >
                    {supplierOrderStatusLabel(order.status)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void updateSupplierOrder(order.id, { status: "cancelled" })}
                    disabled={loading}
                    className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    Annuler
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="px-2 py-1">Article</th>
                      <th className="px-2 py-1 text-right">Commandé</th>
                      <th className="px-2 py-1 text-right">Reçu</th>
                      <th className="px-2 py-1 text-right">Restant</th>
                      <th className="px-2 py-1">Réception</th>
                      <th className="px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.supplier_order_lines.map((line) => {
                      const remaining = line.quantity_ordered - line.quantity_received;
                      const draft = receiptDrafts[line.id];
                      const isUntouched = line.quantity_received === 0;

                      return (
                        <tr key={line.id} className="border-t border-border">
                          <td className="px-2 py-1">
                            {line.items.sku} — {line.items.name}
                          </td>
                          <td className="px-2 py-1 text-right">
                            {isUntouched ? (
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                defaultValue={line.quantity_ordered}
                                onBlur={(event) =>
                                  void updateSupplierOrderLineQuantity(
                                    line.id,
                                    Number(event.target.value),
                                    line.quantity_received,
                                  )
                                }
                                className="border border-border rounded-md px-2 py-1 w-20 text-right bg-background text-foreground focus:outline-none focus:border-accent"
                              />
                            ) : (
                              quantity(line.quantity_ordered)
                            )}
                          </td>
                          <td className="px-2 py-1 text-right">
                            {quantity(line.quantity_received)}
                          </td>
                          <td className="px-2 py-1 text-right">{quantity(remaining)}</td>
                          <td className="px-2 py-1">
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
                                  className="border border-border rounded-md px-2 py-1 w-20 bg-background text-foreground focus:outline-none focus:border-accent"
                                />
                                <button
                                  type="button"
                                  onClick={() => void receiveLine(line.id)}
                                  disabled={loading}
                                  className="rounded-md border border-border px-2 py-1 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                                >
                                  Réceptionner
                                </button>
                              </div>
                            ) : (
                              "Complet"
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {isUntouched && (
                              <button
                                type="button"
                                onClick={() => void deleteSupplierOrderLine(line.id)}
                                disabled={loading}
                                className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                              >
                                Supprimer
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
          </CollapsibleSection>

          <CollapsibleSection id="production-orders" title="Ordres de production" defaultOpen={false}>
        <form
          onSubmit={addProductionOrder}
          className="flex flex-col gap-3 border border-border rounded-lg p-4 max-w-md bg-background"
        >
          <label className="flex flex-col gap-1 text-sm">
            Référence à produire
            <select
              required
              value={productionItemId}
              onChange={(event) => setProductionItemId(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
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
            Quantité à produire
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={productionQuantity}
              onChange={(event) => setProductionQuantity(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Date prévue
            <input
              type="date"
              value={productionPlannedAt}
              onChange={(event) => setProductionPlannedAt(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Note (optionnel)
            <input
              type="text"
              value={productionNote}
              onChange={(event) => setProductionNote(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent text-white px-3 py-2 font-medium transition-colors hover:bg-accent-dark disabled:opacity-50 disabled:hover:bg-accent"
          >
            Créer l&apos;ordre de production
          </button>
        </form>

        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-sm">Ordres planifiés</h3>

          {productionOrders.length === 0 && (
            <p className="text-sm text-muted">
              Aucun ordre de production en cours.
            </p>
          )}

          {productionOrders.map((order) => {
            const availability = computeAvailabilityAtDate(order);

            return (
              <div key={order.id} className="border border-border rounded-lg p-4 flex flex-col gap-3 bg-background">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={order.produced_item_id}
                        onChange={(event) =>
                          void updateProductionOrder(order.id, {
                            produced_item_id: event.target.value,
                          })
                        }
                        className="border border-border rounded-md px-2 py-1 text-xs font-medium bg-background text-foreground focus:outline-none focus:border-accent"
                      >
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.sku} — {item.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        defaultValue={order.quantity_planned}
                        onBlur={(event) => {
                          const value = Number(event.target.value);
                          if (!value || value <= 0) {
                            setMessage("La quantité planifiée doit être positive.");
                            return;
                          }
                          void updateProductionOrder(order.id, { quantity_planned: value });
                        }}
                        className="border border-border rounded-md px-2 py-1 text-xs w-20 bg-background text-foreground focus:outline-none focus:border-accent"
                      />
                      <input
                        type="text"
                        defaultValue={order.note ?? ""}
                        placeholder="Note"
                        onBlur={(event) =>
                          void updateProductionOrder(order.id, {
                            note: event.target.value.trim() || null,
                          })
                        }
                        className="border border-border rounded-md px-2 py-1 text-xs bg-background text-foreground focus:outline-none focus:border-accent"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted">
                      Date prévue
                      <input
                        type="date"
                        value={order.planned_at ?? ""}
                        onChange={(event) =>
                          void updateProductionOrder(order.id, {
                            planned_at: event.target.value || null,
                          })
                        }
                        className="border border-border rounded-md px-2 py-1 text-xs bg-background text-foreground focus:outline-none focus:border-accent"
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCompleteClick(order)}
                      disabled={loading}
                      className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      Terminer la production
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void updateProductionOrder(order.id, { status: "cancelled" })
                      }
                      disabled={loading}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      Annuler
                    </button>
                  </div>
                </div>

                {availability.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-muted">
                      Disponibilité des intrants à la date prévue
                      {!order.planned_at && " (aucune date définie — calcul à partir d'aujourd'hui)"}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="text-left text-muted">
                            <th className="px-2 py-1 min-w-[140px]">Intrant</th>
                            <th className="px-2 py-1 text-right min-w-[72px]">Besoin</th>
                            <th className="px-2 py-1 text-right min-w-[96px] whitespace-nowrap">
                              Disponible à date
                            </th>
                            <th className="px-2 py-1 text-right min-w-[80px]">Manquant</th>
                            <th className="px-2 py-1 min-w-[110px] whitespace-nowrap">
                              Prochaine arrivée
                            </th>
                            <th className="px-2 py-1 min-w-[130px] whitespace-nowrap">Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {availability.map((line) => (
                            <tr key={line.itemId} className="border-t border-border">
                              <td className="px-2 py-1">{line.label}</td>
                              <td className="px-2 py-1 text-right whitespace-nowrap">
                                {quantity(line.required)}
                              </td>
                              <td className="px-2 py-1 text-right whitespace-nowrap">
                                {quantity(line.availableAtDate)}
                              </td>
                              <td className="px-2 py-1 text-right whitespace-nowrap">
                                {line.missing > 0 ? quantity(line.missing) : "—"}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap">
                                {line.nextArrival ?? "Aucune"}
                              </td>
                              <td
                                className={
                                  line.status === "ok"
                                    ? "px-2 py-1 whitespace-nowrap"
                                    : line.status === "too_late"
                                      ? "px-2 py-1 whitespace-nowrap text-orange-600"
                                      : "px-2 py-1 whitespace-nowrap text-red-600"
                                }
                              >
                                {availabilityStatusLabel(line.status)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    Aucune nomenclature définie pour cette référence.
                  </p>
                )}

                {shortageByOrder[order.id] && (
                  <div className="border border-red-300 rounded-lg p-3 flex flex-col gap-2 bg-red-50">
                    <p className="text-sm font-medium text-red-700">
                      Stock intrant insuffisant
                    </p>

                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted">
                          <th className="px-2 py-1">Intrant</th>
                          <th className="px-2 py-1 text-right">Besoin</th>
                          <th className="px-2 py-1 text-right">Disponible</th>
                          <th className="px-2 py-1 text-right">Manquant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shortageByOrder[order.id].map((line) => (
                          <tr key={line.itemId} className="border-t border-border">
                            <td className="px-2 py-1">{line.label}</td>
                            <td className="px-2 py-1 text-right">{quantity(line.required)}</td>
                            <td className="px-2 py-1 text-right">{quantity(line.available)}</td>
                            <td className="px-2 py-1 text-right text-red-600">
                              {quantity(line.missing)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <label className="flex flex-col gap-1 text-sm">
                      Justification (obligatoire pour forcer)
                      <input
                        type="text"
                        required
                        value={overrideReasonByOrder[order.id] ?? ""}
                        onChange={(event) =>
                          setOverrideReasonByOrder((current) => ({
                            ...current,
                            [order.id]: event.target.value,
                          }))
                        }
                        className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => forceCompleteProductionOrder(order.id)}
                      disabled={loading}
                      className="rounded-md border border-red-600 text-red-600 px-3 py-2 font-medium transition-colors hover:bg-red-50 disabled:opacity-50 w-fit"
                    >
                      Terminer quand même
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
          </CollapsibleSection>
        </div>
      </div>
    </main>
  );
}
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
  default_location_id: string | null;
};

type Location = {
  id: string;
  name: string;
  active: boolean;
  note: string | null;
};

type StockPhysicalRow = {
  item_id: string;
  location_id: string | null;
  quantity_physical: number | string;
};

type StockTransferStatus = "planned" | "in_transit" | "received" | "cancelled";

type StockTransfer = {
  id: string;
  item_id: string;
  source_location_id: string;
  destination_location_id: string;
  quantity: number;
  planned_at: string | null;
  status: StockTransferStatus;
  note: string | null;
  items: { sku: string; name: string };
};

function stockTransferStatusLabel(status: StockTransferStatus) {
  if (status === "planned") return "Prévu";
  if (status === "in_transit") return "En transit";
  if (status === "received") return "Reçu";
  return "Annulé";
}

type MovementHistoryRow = {
  id: string;
  item_id: string;
  location_id: string | null;
  movement_type: "initial_count" | "receipt" | "adjustment" | "consumption";
  quantity: number;
  created_at: string;
  items: { sku: string; name: string };
};

type ReceivedTransferRow = {
  id: string;
  item_id: string;
  source_location_id: string;
  destination_location_id: string;
  quantity: number;
  created_at: string;
  items: { sku: string; name: string };
};

function movementTypeLabel(type: MovementHistoryRow["movement_type"]) {
  if (type === "initial_count") return "Stock initial";
  if (type === "receipt") return "Réception";
  if (type === "adjustment") return "Ajustement";
  return "Consommation";
}

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
  destination_location_id: string | null;
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
  location_id: string | null;
  note: string | null;
};

type ShortageLine = {
  itemId: string;
  label: string;
  required: number;
  available: number;
  missing: number;
};

type AvailabilityStatus = "ok" | "a_transferer" | "missing" | "too_late" | "not_ordered";

type ElsewhereStock = {
  locationId: string;
  locationName: string;
  quantity: number;
};

type IntrantAvailability = {
  itemId: string;
  label: string;
  required: number;
  onSite: number;
  elsewhere: ElsewhereStock[];
  elsewhereTotal: number;
  incoming: number;
  transferable: number;
  missing: number;
  nextArrival: string | null;
  status: AvailabilityStatus;
};

function availabilityActionLabel(line: IntrantAvailability): string {
  if (line.status === "ok") return "OK";
  if (line.status === "a_transferer") {
    const source = line.elsewhere.length === 1 ? ` depuis ${line.elsewhere[0].locationName}` : "";
    return `À transférer ${quantity(line.transferable)}${source}`;
  }
  if (line.status === "not_ordered") return `À commander ${quantity(line.missing)}`;
  if (line.status === "too_late") return "Arrive trop tard";
  return `Stock insuffisant (${quantity(line.missing)})`;
}

function availabilityActionClass(status: AvailabilityStatus): string {
  if (status === "ok") return "";
  if (status === "a_transferer") return "text-accent";
  if (status === "too_late") return "text-orange-600";
  return "text-red-600";
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

function StockTable({
  rows,
  locations,
  stockPhysical,
  bomProducedItemIds,
  expandedItemId,
  onToggleExpand,
  onViewBom,
}: {
  rows: DashboardRow[];
  locations: Location[];
  stockPhysical: StockPhysicalRow[];
  bomProducedItemIds: Set<string>;
  expandedItemId: string | null;
  onToggleExpand: (itemId: string) => void;
  onViewBom: (itemId: string) => void;
}) {
  const activeLocations = locations.filter((location) => location.active);
  const showLocationDetail = activeLocations.length > 1;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm table-fixed">
        <thead className="bg-background border-b border-[#030a16]">
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
          {rows.map((row) => {
            const hasBom = bomProducedItemIds.has(row.item_id);
            const canExpand = showLocationDetail || hasBom;
            const isExpanded = canExpand && expandedItemId === row.item_id;
            const detailRows = isExpanded
              ? activeLocations
                  .map((location) => ({
                    location,
                    qty: stockPhysical
                      .filter(
                        (physical) =>
                          physical.item_id === row.item_id &&
                          physical.location_id === location.id,
                      )
                      .reduce((sum, physical) => sum + Number(physical.quantity_physical ?? 0), 0),
                  }))
                  .filter((entry) => entry.qty !== 0)
              : [];

            return [
              <tr
                key={row.item_id}
                className={`border-t border-border ${canExpand ? "cursor-pointer hover:bg-black/[0.02]" : ""}`}
                onClick={canExpand ? () => onToggleExpand(row.item_id) : undefined}
              >
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
              </tr>,
              isExpanded && (
                <tr key={`${row.item_id}-detail`} className="bg-background">
                  <td colSpan={7} className="px-4 py-2">
                    <div className="flex flex-col gap-1 text-xs text-muted">
                      {showLocationDetail && detailRows.length === 0 && (
                        <span>Aucun stock localisé.</span>
                      )}
                      {showLocationDetail &&
                        detailRows.map(({ location, qty }) => (
                          <div key={location.id} className="flex justify-between gap-4">
                            <span>{location.name}</span>
                            <span>{quantity(qty)}</span>
                          </div>
                        ))}
                      {hasBom && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onViewBom(row.item_id);
                          }}
                          className="text-left underline w-fit"
                        >
                          Voir la recette →
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
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
  forceOpen,
  children,
}: {
  id: string;
  title: string;
  defaultOpen: boolean;
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [prevForceOpen, setPrevForceOpen] = useState(forceOpen ?? false);

  if ((forceOpen ?? false) !== prevForceOpen) {
    setPrevForceOpen(forceOpen ?? false);
    if (forceOpen) setOpen(true);
  }

  useEffect(() => {
    const stored = window.localStorage.getItem(`nitti-section-${id}`);
    if (stored !== null) setOpen(stored === "open");
  }, [id]);

  useEffect(() => {
    window.localStorage.setItem(`nitti-section-${id}`, open ? "open" : "closed");
  }, [id, open]);

  return (
    <section className="border border-border rounded-lg bg-background shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full text-left transition-colors bg-background hover:bg-black/[0.02]"
      >
        <div className={`flex items-center justify-between px-4 pt-3.5 ${open ? "pb-[3px]" : "pb-3.5"}`}>
          <h2 className="font-semibold text-foreground">{title}</h2>
          <span
            className={`text-foreground text-base transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            ▾
          </span>
        </div>
        {open && <div className="mx-4 border-b border-[#030a16]" />}
      </button>
      {open && <div className="px-4 py-4 flex flex-col gap-4 bg-background">{children}</div>}
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

  const [locations, setLocations] = useState<Location[]>([]);
  const [stockPhysical, setStockPhysical] = useState<StockPhysicalRow[]>([]);
  const [locationName, setLocationName] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [expandedStockItemId, setExpandedStockItemId] = useState<string | null>(null);

  const [itemSku, setItemSku] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemType, setItemType] = useState<"component" | "product">("component");
  const [itemThreshold, setItemThreshold] = useState("0");
  const [itemDefaultLocationId, setItemDefaultLocationId] = useState("");

  const [movementItemId, setMovementItemId] = useState("");
  const [movementType, setMovementType] = useState<"initial_count" | "adjustment" | "transfer">(
    "initial_count",
  );
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [movementLocationId, setMovementLocationId] = useState("");
  const [movementDestinationLocationId, setMovementDestinationLocationId] = useState("");
  const [movementHistory, setMovementHistory] = useState<MovementHistoryRow[]>([]);
  const [receivedTransfers, setReceivedTransfers] = useState<ReceivedTransferRow[]>([]);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierOrders, setSupplierOrders] = useState<SupplierOrder[]>([]);

  const [supplierName, setSupplierName] = useState("");

  const [orderSupplierId, setOrderSupplierId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderExpectedAt, setOrderExpectedAt] = useState("");
  const [orderDestinationLocationId, setOrderDestinationLocationId] = useState("");
  const [orderLines, setOrderLines] = useState<DraftOrderLine[]>([
    { itemId: "", quantity: "" },
  ]);

  const [receiptDrafts, setReceiptDrafts] = useState<
    Record<string, { quantity: string; note: string; locationId: string }>
  >({});

  const [bomLines, setBomLines] = useState<BomLine[]>([]);
  const [openBomProductId, setOpenBomProductId] = useState<string | null>(null);
  const [bomInputItemId, setBomInputItemId] = useState("");
  const [bomQuantityPer, setBomQuantityPer] = useState("");
  const [forceOpenBom, setForceOpenBom] = useState(false);

  const [newBomProductId, setNewBomProductId] = useState("");
  const [existingBomNoticeId, setExistingBomNoticeId] = useState<string | null>(null);
  const [newBomDraftLines, setNewBomDraftLines] = useState<
    { componentItemId: string; quantity: string }[]
  >([]);
  const [draftInputItemId, setDraftInputItemId] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("");

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
  const [productionLocationId, setProductionLocationId] = useState("");
  const [productionNote, setProductionNote] = useState("");

  const [shortageByOrder, setShortageByOrder] = useState<Record<string, ShortageLine[]>>({});
  const [overrideReasonByOrder, setOverrideReasonByOrder] = useState<Record<string, string>>({});

  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [transferItemId, setTransferItemId] = useState("");
  const [transferSourceLocationId, setTransferSourceLocationId] = useState("");
  const [transferDestinationLocationId, setTransferDestinationLocationId] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("");
  const [transferPlannedAt, setTransferPlannedAt] = useState("");
  const [forceOpenTransfers, setForceOpenTransfers] = useState(false);

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
        .select("id, sku, name, item_type, default_location_id")
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

  const loadLocationData = useCallback(async (organizationId: string) => {
    const [locationsResult, stockPhysicalResult] = await Promise.all([
      supabase
        .from("locations")
        .select("id, name, active, note")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("stock_physical")
        .select("item_id, location_id, quantity_physical")
        .eq("organization_id", organizationId),
    ]);

    if (locationsResult.error) {
      setMessage(locationsResult.error.message);
    } else {
      setLocations((locationsResult.data ?? []) as Location[]);
    }

    if (stockPhysicalResult.error) {
      setMessage(stockPhysicalResult.error.message);
    } else {
      setStockPhysical((stockPhysicalResult.data ?? []) as StockPhysicalRow[]);
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
          "id, order_number, expected_at, status, supplier_id, destination_location_id, supplier_order_lines(id, item_id, quantity_ordered, quantity_received, items(sku, name))",
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
        "id, produced_item_id, quantity_planned, quantity_completed, status, planned_at, location_id, note",
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

  const loadTransferData = useCallback(async (organizationId: string) => {
    const { data, error } = await supabase
      .from("stock_transfers")
      .select(
        "id, item_id, source_location_id, destination_location_id, quantity, planned_at, status, note, items(sku, name)",
      )
      .eq("organization_id", organizationId)
      .in("status", ["planned", "in_transit"])
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
    } else {
      setTransfers((data ?? []) as unknown as StockTransfer[]);
    }
  }, []);

  const loadMovementHistory = useCallback(async (organizationId: string) => {
    const [movementsResult, receivedTransfersResult] = await Promise.all([
      supabase
        .from("stock_movements")
        .select("id, item_id, location_id, movement_type, quantity, created_at, items(sku, name)")
        .eq("organization_id", organizationId)
        .neq("movement_type", "transfer")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("stock_transfers")
        .select(
          "id, item_id, source_location_id, destination_location_id, quantity, created_at, items(sku, name)",
        )
        .eq("organization_id", organizationId)
        .eq("status", "received")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    if (movementsResult.error) {
      setMessage(movementsResult.error.message);
    } else {
      setMovementHistory((movementsResult.data ?? []) as unknown as MovementHistoryRow[]);
    }

    if (receivedTransfersResult.error) {
      setMessage(receivedTransfersResult.error.message);
    } else {
      setReceivedTransfers(
        (receivedTransfersResult.data ?? []) as unknown as ReceivedTransferRow[],
      );
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
        loadLocationData(org.id),
        loadSupplierData(org.id),
        loadCustomerData(org.id),
        loadProductionData(org.id),
        loadTransferData(org.id),
        loadMovementHistory(org.id),
      ]);
    }

    setLoading(false);
  }, [
    loadStockData,
    loadLocationData,
    loadSupplierData,
    loadCustomerData,
    loadProductionData,
    loadTransferData,
    loadMovementHistory,
  ]);

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
        setLocations([]);
        setStockPhysical([]);
        setSuppliers([]);
        setSupplierOrders([]);
        setBomLines([]);
        setCustomerOrders([]);
        setProductionOrders([]);
        setTransfers([]);
        setMovementHistory([]);
        setReceivedTransfers([]);
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
      default_location_id: itemDefaultLocationId || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setItemSku("");
      setItemName("");
      setItemThreshold("0");
      setItemDefaultLocationId("");
      await loadStockData(organization.id);
    }

    setLoading(false);
  }

  function slugifyLocationCode(name: string) {
    const base = name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${base || "LIEU"}_${suffix}`;
  }

  async function addLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) return;

    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("locations").insert({
      organization_id: organization.id,
      code: slugifyLocationCode(locationName.trim()),
      name: locationName.trim(),
      note: locationNote.trim() || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setLocationName("");
      setLocationNote("");
      await loadLocationData(organization.id);
    }

    setLoading(false);
  }

  async function updateLocation(
    locationId: string,
    patch: { name?: string; note?: string | null; active?: boolean },
  ) {
    if (!organization) return;

    const { error } = await supabase.from("locations").update(patch).eq("id", locationId);

    if (error) {
      setMessage(error.message);
    } else {
      await loadLocationData(organization.id);
    }
  }

  async function addStockMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !movementItemId) return;

    const activeLocations = locations.filter((location) => location.active);

    if (movementType === "transfer") {
      const originId =
        movementLocationId || (activeLocations.length === 1 ? activeLocations[0].id : null);
      const destinationId = movementDestinationLocationId;
      const quantityValue = Number(movementQuantity);

      if (!originId || !destinationId) {
        setMessage("Sélectionne un lieu d'origine et un lieu de destination.");
        return;
      }

      if (originId === destinationId) {
        setMessage("Le lieu d'origine et le lieu de destination doivent être différents.");
        return;
      }

      if (!quantityValue || quantityValue <= 0) {
        setMessage("La quantité doit être positive.");
        return;
      }

      setLoading(true);
      setMessage("");

      const { data: transfer, error: transferError } = await supabase
        .from("stock_transfers")
        .insert({
          organization_id: organization.id,
          item_id: movementItemId,
          source_location_id: originId,
          destination_location_id: destinationId,
          quantity: quantityValue,
          note: movementNote.trim() || null,
        })
        .select("id")
        .single();

      if (transferError || !transfer) {
        setMessage(transferError?.message ?? "Erreur lors de la création du transfert.");
        setLoading(false);
        return;
      }

      const { error: receiveError } = await supabase.rpc("receive_stock_transfer", {
        p_transfer_id: transfer.id,
      });

      if (receiveError) {
        setMessage(receiveError.message);
      } else {
        setMovementQuantity("");
        setMovementNote("");
        setMovementDestinationLocationId("");
        await Promise.all([
          loadStockData(organization.id),
          loadLocationData(organization.id),
          loadMovementHistory(organization.id),
        ]);
      }

      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    const effectiveLocationId =
      movementLocationId || (activeLocations.length === 1 ? activeLocations[0].id : null);

    const { error } = await supabase.from("stock_movements").insert({
      organization_id: organization.id,
      item_id: movementItemId,
      location_id: effectiveLocationId,
      movement_type: movementType,
      quantity: Number(movementQuantity),
      note: movementNote.trim() || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMovementQuantity("");
      setMovementNote("");
      await Promise.all([
        loadStockData(organization.id),
        loadLocationData(organization.id),
        loadMovementHistory(organization.id),
      ]);
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

    const activeLocations = locations.filter((location) => location.active);
    const destinationLocationId =
      orderDestinationLocationId || (activeLocations.length === 1 ? activeLocations[0].id : null);

    const { data: order, error: orderError } = await supabase
      .from("supplier_orders")
      .insert({
        organization_id: organization.id,
        supplier_id: orderSupplierId || null,
        order_number: orderNumber.trim() || null,
        expected_at: orderExpectedAt || null,
        destination_location_id: destinationLocationId,
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
      setOrderDestinationLocationId("");
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
      p_location_id: draft?.locationId || null,
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
        loadLocationData(organization.id),
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
      destination_location_id?: string | null;
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

  function viewBomRecipe(producedItemId: string) {
    setOpenBomProductId(producedItemId);
    setBomInputItemId("");
    setBomQuantityPer("");
    setForceOpenBom(true);
    window.setTimeout(() => setForceOpenBom(false), 0);
  }

  function handleNewBomProductSelect(itemId: string) {
    if (!itemId) return;

    if (bomProducedItemIds.has(itemId)) {
      setExistingBomNoticeId(itemId);
      setNewBomProductId("");
      setNewBomDraftLines([]);
    } else {
      setExistingBomNoticeId(null);
      setNewBomProductId(itemId);
      setNewBomDraftLines([]);
      setDraftInputItemId("");
      setDraftQuantity("");
    }
  }

  function viewExistingBomFromNotice() {
    if (!existingBomNoticeId) return;
    setOpenBomProductId(existingBomNoticeId);
    setExistingBomNoticeId(null);
  }

  function cancelNewBomDraft() {
    setNewBomProductId("");
    setNewBomDraftLines([]);
    setDraftInputItemId("");
    setDraftQuantity("");
    setExistingBomNoticeId(null);
  }

  function addDraftBomLine() {
    const quantityValue = Number(draftQuantity);

    if (!draftInputItemId || !quantityValue || quantityValue <= 0) {
      setMessage("Sélectionne un intrant et une quantité valide.");
      return;
    }

    if (newBomDraftLines.some((line) => line.componentItemId === draftInputItemId)) {
      setMessage(
        "Cet intrant est déjà dans la recette — modifie sa quantité directement dans le tableau plutôt que de l'ajouter à nouveau.",
      );
      return;
    }

    setNewBomDraftLines((current) => [
      ...current,
      { componentItemId: draftInputItemId, quantity: draftQuantity },
    ]);
    setDraftInputItemId("");
    setDraftQuantity("");
    setMessage("");
  }

  function updateDraftBomLine(index: number, quantity: string) {
    setNewBomDraftLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, quantity } : line)),
    );
  }

  function removeDraftBomLine(index: number) {
    setNewBomDraftLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  async function saveNewBomRecipe() {
    if (!organization || !newBomProductId) return;

    if (newBomDraftLines.length === 0) {
      setMessage("Ajoute au moins un intrant avant d'enregistrer la nomenclature.");
      return;
    }

    const invalidLine = newBomDraftLines.find(
      (line) => !line.componentItemId || !(Number(line.quantity) > 0),
    );
    if (invalidLine) {
      setMessage("Chaque intrant doit avoir une quantité positive.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("bom_lines").insert(
      newBomDraftLines.map((line) => ({
        organization_id: organization.id,
        product_item_id: newBomProductId,
        component_item_id: line.componentItemId,
        quantity_per: Number(line.quantity),
      })),
    );

    if (error) {
      setMessage(error.message);
    } else {
      const savedProductId = newBomProductId;
      setNewBomProductId("");
      setNewBomDraftLines([]);
      await loadCustomerData(organization.id);
      setOpenBomProductId(savedProductId);
    }

    setLoading(false);
  }

  async function addBomLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !openBomProductId) return;

    const isDuplicate = bomLines.some(
      (line) =>
        line.product_item_id === openBomProductId &&
        line.component_item_id === bomInputItemId,
    );

    if (isDuplicate) {
      setMessage(
        "Cet intrant est déjà dans la nomenclature — modifie sa quantité directement dans le tableau plutôt que de l'ajouter à nouveau.",
      );
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("bom_lines").insert({
      organization_id: organization.id,
      product_item_id: openBomProductId,
      component_item_id: bomInputItemId,
      quantity_per: Number(bomQuantityPer),
    });

    if (error) {
      setMessage(error.message);
    } else {
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

    const activeLocations = locations.filter((location) => location.active);
    const productionLocation =
      productionLocationId || (activeLocations.length === 1 ? activeLocations[0].id : null);

    if (!productionLocation) {
      setMessage("Sélectionne un lieu de production.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("production_orders").insert({
      organization_id: organization.id,
      produced_item_id: productionItemId,
      quantity_planned: plannedQuantity,
      planned_at: productionPlannedAt || null,
      location_id: productionLocation,
      note: productionNote.trim() || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setProductionItemId("");
      setProductionQuantity("");
      setProductionPlannedAt("");
      setProductionLocationId("");
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
      location_id?: string | null;
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

  function physicalAt(itemId: string, locationId: string | null) {
    return stockPhysical
      .filter((row) => row.item_id === itemId && row.location_id === locationId)
      .reduce((sum, row) => sum + Number(row.quantity_physical ?? 0), 0);
  }

  function elsewhereStock(itemId: string, excludeLocationId: string | null): ElsewhereStock[] {
    const elsewhereMap = new Map<string, number>();
    for (const row of stockPhysical) {
      if (row.item_id !== itemId) continue;
      if (row.location_id === excludeLocationId) continue;
      if (row.location_id === null) continue;
      const qty = Number(row.quantity_physical ?? 0);
      if (qty <= 0) continue;
      elsewhereMap.set(row.location_id, (elsewhereMap.get(row.location_id) ?? 0) + qty);
    }
    return Array.from(elsewhereMap.entries()).map(([locationId, qty]) => ({
      locationId,
      locationName: locations.find((location) => location.id === locationId)?.name ?? locationId,
      quantity: qty,
    }));
  }

  type LocationAlert = {
    key: string;
    itemId: string;
    isLocal: boolean;
    sku: string;
    name: string;
    locationLabel: string;
    status: DashboardRow["alert_status"];
    actionText: string | null;
  };

  // stock_dashboard.alert_status stays exactly as-is (physical/ordered/reserved
  // summed globally) — untouched per the DB-migration-strictness rule, and
  // still used as a fallback below. But severity for "Alertes importantes" must
  // now be judged per (item, location), never from the global aggregate: a
  // location can be in real local shortage even while another location's
  // stock keeps the org-wide total looking fine. Local severity therefore only
  // ever looks at that location's own physical balance (from stock_physical)
  // against zero (rupture) and the item's low_stock_threshold (stock bas) —
  // reserved/ordered stay global-only concepts since they aren't tied to a
  // location without inventing an allocation model.
  function computeLocationAlerts(): LocationAlert[] {
    const entries: LocationAlert[] = [];

    for (const row of dashboard) {
      const itemLocationIds = Array.from(
        new Set(
          stockPhysical
            .filter((sp) => sp.item_id === row.item_id && sp.location_id !== null)
            .map((sp) => sp.location_id as string),
        ),
      );

      let hasLocalAlert = false;

      for (const locationId of itemLocationIds) {
        const localPhysical = physicalAt(row.item_id, locationId);
        const threshold = Number(row.low_stock_threshold ?? 0);

        let status: "missing_physical_stock" | "low_physical_stock" | null = null;
        if (localPhysical < 0) status = "missing_physical_stock";
        else if (localPhysical <= threshold) status = "low_physical_stock";

        if (!status) continue;

        hasLocalAlert = true;
        const locationName = locations.find((location) => location.id === locationId)?.name ?? locationId;

        let actionText: string | null = null;
        if (status === "missing_physical_stock") {
          const deficit = -localPhysical;
          const elsewhere = elsewhereStock(row.item_id, locationId);
          const elsewhereTotal = elsewhere.reduce((sum, entry) => sum + entry.quantity, 0);

          if (elsewhereTotal >= deficit && elsewhere.length > 0) {
            const sources = elsewhere
              .sort((a, b) => b.quantity - a.quantity)
              .map((entry) => entry.locationName)
              .join(", ");
            actionText = `À transférer depuis ${sources}`;
          } else {
            actionText = "À commander";
          }
        }

        entries.push({
          key: `${row.item_id}-${locationId}`,
          itemId: row.item_id,
          isLocal: true,
          sku: row.sku,
          name: row.name,
          locationLabel: locationName,
          status,
          actionText,
        });
      }

      // Fallback: a purely global issue (typically reservations/orders
      // outweighing physical stock) that doesn't show up as a rupture at any
      // single location still needs to surface somewhere — it must not
      // replace a local alert, only fill in when there isn't one.
      if (!hasLocalAlert && row.alert_status !== "ok") {
        entries.push({
          key: `${row.item_id}-global`,
          itemId: row.item_id,
          isLocal: false,
          sku: row.sku,
          name: row.name,
          locationLabel: "Tous les lieux",
          status: row.alert_status,
          actionText: null,
        });
      }
    }

    return entries;
  }

  function computeAvailabilityAtDate(order: ProductionOrder): IntrantAvailability[] {
    const targetDate = order.planned_at || todayISO();
    const orderLocationId = order.location_id;
    const requiredInputs = bomLines.filter(
      (line) => line.product_item_id === order.produced_item_id,
    );

    return requiredInputs.map((line) => {
      const itemId = line.component_item_id;
      const required = line.quantity_per * order.quantity_planned;

      const localPhysical = physicalAt(itemId, orderLocationId);

      let incoming = 0;
      let nextArrival: string | null = null;

      for (const supplierOrder of supplierOrders) {
        if (!supplierOrder.expected_at) continue;
        if (supplierOrder.destination_location_id !== orderLocationId) continue;

        for (const supplierLine of supplierOrder.supplier_order_lines) {
          if (supplierLine.item_id !== itemId) continue;

          const remaining = supplierLine.quantity_ordered - supplierLine.quantity_received;
          if (remaining <= 0) continue;

          if (nextArrival === null || supplierOrder.expected_at < nextArrival) {
            nextArrival = supplierOrder.expected_at;
          }

          if (supplierOrder.expected_at <= targetDate) {
            incoming += remaining;
          }
        }
      }

      for (const otherOrder of productionOrders) {
        if (otherOrder.id === order.id) continue;
        if (otherOrder.produced_item_id !== itemId) continue;
        if (otherOrder.location_id !== orderLocationId) continue;
        if (otherOrder.planned_at === null) continue;

        if (nextArrival === null || otherOrder.planned_at < nextArrival) {
          nextArrival = otherOrder.planned_at;
        }

        if (otherOrder.planned_at <= targetDate) {
          incoming += otherOrder.quantity_planned;
        }
      }

      for (const transfer of transfers) {
        if (transfer.item_id !== itemId) continue;
        if (transfer.destination_location_id !== orderLocationId) continue;
        if (transfer.status !== "planned" && transfer.status !== "in_transit") continue;
        if (!transfer.planned_at) continue;

        if (nextArrival === null || transfer.planned_at < nextArrival) {
          nextArrival = transfer.planned_at;
        }

        if (transfer.planned_at <= targetDate) {
          incoming += transfer.quantity;
        }
      }

      let competing = 0;

      for (const otherOrder of productionOrders) {
        if (otherOrder.id === order.id) continue;
        if (otherOrder.location_id !== orderLocationId) continue;
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

      const onSite = localPhysical - competing;

      const elsewhere = elsewhereStock(itemId, orderLocationId);
      const elsewhereTotal = elsewhere.reduce((sum, entry) => sum + entry.quantity, 0);

      const missingBeforeTransfer = Math.max(required - onSite - incoming, 0);
      const transferable = Math.min(missingBeforeTransfer, elsewhereTotal);
      const stillMissing = missingBeforeTransfer - transferable;

      let status: AvailabilityStatus;
      if (missingBeforeTransfer === 0) {
        status = "ok";
      } else if (stillMissing === 0) {
        status = "a_transferer";
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
        onSite,
        elsewhere,
        elsewhereTotal,
        incoming,
        transferable,
        missing: stillMissing,
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
      const localPhysical = physicalAt(line.component_item_id, order.location_id);
      const reserved = Number(
        dashboard.find((row) => row.item_id === line.component_item_id)?.quantity_reserved ?? 0,
      );
      const available = localPhysical - reserved;

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

  function openTransferDraft(order: ProductionOrder, line: IntrantAvailability) {
    if (!order.location_id || line.elsewhere.length === 0) return;

    setTransferItemId(line.itemId);
    setTransferSourceLocationId(line.elsewhere[0].locationId);
    setTransferDestinationLocationId(order.location_id);
    setTransferQuantity(String(line.transferable));
    setTransferPlannedAt(order.planned_at ?? "");
    setForceOpenTransfers(true);
    window.setTimeout(() => setForceOpenTransfers(false), 0);
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
        loadLocationData(organization.id),
      ]);
    }

    setLoading(false);
  }

  async function addTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) return;

    const transferQuantityValue = Number(transferQuantity);
    if (
      !transferItemId ||
      !transferSourceLocationId ||
      !transferDestinationLocationId ||
      !transferQuantityValue ||
      transferQuantityValue <= 0
    ) {
      setMessage("Sélectionne une référence, deux lieux différents et une quantité valide.");
      return;
    }

    if (transferSourceLocationId === transferDestinationLocationId) {
      setMessage("Le lieu source et le lieu de destination doivent être différents.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("stock_transfers").insert({
      organization_id: organization.id,
      item_id: transferItemId,
      source_location_id: transferSourceLocationId,
      destination_location_id: transferDestinationLocationId,
      quantity: transferQuantityValue,
      planned_at: transferPlannedAt || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setTransferItemId("");
      setTransferSourceLocationId("");
      setTransferDestinationLocationId("");
      setTransferQuantity("");
      setTransferPlannedAt("");
      await loadTransferData(organization.id);
    }

    setLoading(false);
  }

  async function departTransfer(transferId: string) {
    if (!organization) return;

    setLoading(true);
    setMessage("");

    const { error } = await supabase.rpc("depart_stock_transfer", {
      p_transfer_id: transferId,
    });

    if (error) {
      setMessage(error.message);
    } else {
      await loadTransferData(organization.id);
    }

    setLoading(false);
  }

  async function receiveTransfer(transferId: string) {
    if (!organization) return;

    setLoading(true);
    setMessage("");

    const { error } = await supabase.rpc("receive_stock_transfer", {
      p_transfer_id: transferId,
    });

    if (error) {
      setMessage(error.message);
    } else {
      await Promise.all([
        loadTransferData(organization.id),
        loadStockData(organization.id),
        loadLocationData(organization.id),
      ]);
    }

    setLoading(false);
  }

  async function cancelTransfer(transferId: string) {
    if (!organization) return;

    const { error } = await supabase
      .from("stock_transfers")
      .update({ status: "cancelled" })
      .eq("id", transferId);

    if (error) {
      setMessage(error.message);
    } else {
      await loadTransferData(organization.id);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const locationAlerts = computeLocationAlerts();
  const alertCount = locationAlerts.length;
  const productItems = items.filter((item) => item.item_type === "product");
  const componentItems = items.filter((item) => item.item_type === "component");

  // The summary tables below are one row per reference (not per reference ×
  // location), so their badge needs a single status per item. Using the raw
  // global stock_dashboard.alert_status here would let stock sitting at
  // another location mask a real local rupture — exactly the bug this fixes.
  // Take the worst LOCAL status (from computeLocationAlerts' real per-location
  // entries, never its "Tous les lieux" fallback) when one exists, and only
  // fall back to the global status when no location is actually in trouble.
  const worstLocalStatusByItem = new Map<string, DashboardRow["alert_status"]>();
  for (const alert of locationAlerts) {
    if (!alert.isLocal) continue;
    const current = worstLocalStatusByItem.get(alert.itemId);
    if (current === "missing_physical_stock") continue;
    if (current === "low_physical_stock" && alert.status !== "missing_physical_stock") continue;
    worstLocalStatusByItem.set(alert.itemId, alert.status);
  }

  const finishedGoodRows = dashboard
    .filter((row) => row.item_type === "product")
    .map((row) => ({
      ...row,
      alert_status: worstLocalStatusByItem.get(row.item_id) ?? row.alert_status,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const inputRows = dashboard
    .filter((row) => row.item_type === "component")
    .map((row) => ({
      ...row,
      alert_status: worstLocalStatusByItem.get(row.item_id) ?? row.alert_status,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const bomProducedItemIds = new Set(bomLines.map((line) => line.product_item_id));
  const bomRecipes = Array.from(bomProducedItemIds)
    .map((producedItemId) => ({
      producedItemId,
      producedItem: items.find((item) => item.id === producedItemId),
      lines: bomLines.filter((line) => line.product_item_id === producedItemId),
    }))
    .sort((a, b) => (a.producedItem?.name ?? "").localeCompare(b.producedItem?.name ?? ""));

  const combinedMovementHistory = [
    ...movementHistory.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      kind: "movement" as const,
      itemLabel: `${row.items.sku} — ${row.items.name}`,
      typeLabel: movementTypeLabel(row.movement_type),
      locationLabel: locations.find((location) => location.id === row.location_id)?.name ?? "—",
      quantity: Number(row.quantity),
    })),
    ...receivedTransfers.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      kind: "transfer" as const,
      itemLabel: `${row.items.sku} — ${row.items.name}`,
      typeLabel: "Transfert entre lieux",
      originLabel:
        locations.find((location) => location.id === row.source_location_id)?.name ?? "—",
      destinationLabel:
        locations.find((location) => location.id === row.destination_location_id)?.name ?? "—",
      quantity: Number(row.quantity),
    })),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 20);

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
    <main className="flex-1 flex flex-col gap-8 px-6 py-8 md:px-10 max-w-[1800px] mx-auto w-full bg-app-bg">
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
        <aside className="w-full lg:w-[55%] lg:shrink-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto flex flex-col gap-5 border border-border rounded-lg p-6 bg-background shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Dashboard & alertes</h2>
            <div className="flex gap-3 mt-3">
              <div className="flex-1 rounded-lg bg-[#030a16] px-4 py-3">
                <p className="text-xs font-medium text-[#fffefa]">Références</p>
                <p className="text-3xl font-semibold text-[#fffefa]">{dashboard.length}</p>
              </div>
              <div className="flex-1 rounded-lg bg-accent px-4 py-3">
                <p className="text-xs font-medium text-[#fffefa]">Alertes</p>
                <p className="text-3xl font-semibold text-[#fffefa]">{alertCount}</p>
              </div>
            </div>
          </div>

          {alertCount > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">Alertes importantes</p>
              <div className="flex flex-col gap-1.5">
                {locationAlerts.map((alert) => (
                  <div
                    key={alert.key}
                    className={`flex flex-col gap-0.5 rounded-md bg-surface-pink px-3 py-2 text-sm ${
                      alert.status !== "low_physical_stock" ? "border-l-2 border-accent" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate min-w-0">
                        {alert.sku} — {alert.name} — {alert.locationLabel}
                      </span>
                      <AlertBadge status={alert.status} />
                    </div>
                    {alert.actionText && (
                      <span className="text-xs text-muted">{alert.actionText}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        <div>
          <p className="text-base font-semibold text-foreground mt-2 mb-2">
            Produits finis <span className="text-muted font-normal">({finishedGoodRows.length})</span>
          </p>
          <StockTable
            rows={finishedGoodRows}
            locations={locations}
            stockPhysical={stockPhysical}
            bomProducedItemIds={bomProducedItemIds}
            expandedItemId={expandedStockItemId}
            onToggleExpand={(itemId) =>
              setExpandedStockItemId((current) => (current === itemId ? null : itemId))
            }
            onViewBom={viewBomRecipe}
          />
        </div>

        <div>
          <p className="text-base font-semibold text-foreground mt-2 mb-2">
            Intrants <span className="text-muted font-normal">({inputRows.length})</span>
          </p>
          <StockTable
            rows={inputRows}
            locations={locations}
            stockPhysical={stockPhysical}
            bomProducedItemIds={bomProducedItemIds}
            expandedItemId={expandedStockItemId}
            onToggleExpand={(itemId) =>
              setExpandedStockItemId((current) => (current === itemId ? null : itemId))
            }
            onViewBom={viewBomRecipe}
          />
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

          {locations.length > 1 && (
            <label className="flex flex-col gap-1 text-sm">
              Lieu par défaut (optionnel)
              <select
                value={itemDefaultLocationId}
                onChange={(event) => setItemDefaultLocationId(event.target.value)}
                className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
              >
                <option value="">Aucun</option>
                {locations
                  .filter((location) => location.active)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent text-white px-3 py-2 font-medium transition-colors hover:bg-accent-dark disabled:opacity-50 disabled:hover:bg-accent"
          >
            Ajouter la référence
          </button>
        </form>
          </CollapsibleSection>

          <CollapsibleSection id="locations" title="Lieux de stock" defaultOpen={false}>
        <form
          onSubmit={addLocation}
          className="flex flex-col gap-3 border border-border rounded-lg p-4 max-w-md bg-background"
        >
          <label className="flex flex-col gap-1 text-sm">
            Nom
            <input
              type="text"
              required
              value={locationName}
              onChange={(event) => setLocationName(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Note (optionnel)
            <input
              type="text"
              value={locationNote}
              onChange={(event) => setLocationNote(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent text-white px-3 py-2 font-medium transition-colors hover:bg-accent-dark disabled:opacity-50 disabled:hover:bg-accent"
          >
            Ajouter le lieu
          </button>
        </form>

        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-surface-header border-b-2 border-border">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Nom</th>
                <th className="px-3 py-2 font-semibold">Note</th>
                <th className="px-3 py-2 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => (
                <tr key={location.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      defaultValue={location.name}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value) void updateLocation(location.id, { name: value });
                      }}
                      className="border border-border rounded-md px-2 py-1 bg-background text-foreground focus:outline-none focus:border-accent"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      defaultValue={location.note ?? ""}
                      placeholder="Note"
                      onBlur={(event) =>
                        void updateLocation(location.id, {
                          note: event.target.value.trim() || null,
                        })
                      }
                      className="border border-border rounded-md px-2 py-1 w-full bg-background text-foreground focus:outline-none focus:border-accent"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void updateLocation(location.id, { active: !location.active })}
                      disabled={loading}
                      className={`rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
                        location.active
                          ? "border-border hover:border-accent hover:text-accent"
                          : "border-red-300 text-red-600 hover:bg-red-50"
                      }`}
                    >
                      {location.active ? "Actif" : "Inactif"}
                    </button>
                  </td>
                </tr>
              ))}
              {locations.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-muted" colSpan={3}>
                    Aucun lieu de stock pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
              onChange={(event) => {
                const nextItemId = event.target.value;
                setMovementItemId(nextItemId);
                const nextItem = items.find((item) => item.id === nextItemId);
                if (nextItem?.default_location_id) {
                  setMovementLocationId(nextItem.default_location_id);
                }
              }}
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
              onChange={(event) => {
                const nextType = event.target.value as "initial_count" | "adjustment" | "transfer";
                setMovementType(nextType);
                setMovementDestinationLocationId("");
              }}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            >
              <option value="initial_count">Stock initial</option>
              <option value="adjustment">Ajustement</option>
              {locations.filter((location) => location.active).length > 1 && (
                <option value="transfer">Transfert entre lieux</option>
              )}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Quantité
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={movementQuantity}
              onChange={(event) => setMovementQuantity(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          {movementType === "transfer" ? (
            <>
              <label className="flex flex-col gap-1 text-sm">
                Lieu origine
                <select
                  required
                  value={movementLocationId}
                  onChange={(event) => setMovementLocationId(event.target.value)}
                  className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
                >
                  <option value="" disabled>
                    Sélectionner un lieu
                  </option>
                  {locations
                    .filter((location) => location.active)
                    .map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                Lieu destination
                <select
                  required
                  value={movementDestinationLocationId}
                  onChange={(event) => setMovementDestinationLocationId(event.target.value)}
                  className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
                >
                  <option value="" disabled>
                    Sélectionner un lieu
                  </option>
                  {locations
                    .filter(
                      (location) => location.active && location.id !== movementLocationId,
                    )
                    .map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          ) : (
            locations.filter((location) => location.active).length > 1 && (
              <label className="flex flex-col gap-1 text-sm">
                Lieu
                <select
                  required
                  value={movementLocationId}
                  onChange={(event) => setMovementLocationId(event.target.value)}
                  className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
                >
                  <option value="" disabled>
                    Sélectionner un lieu
                  </option>
                  {locations
                    .filter((location) => location.active)
                    .map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                </select>
              </label>
            )
          )}

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
            {movementType === "transfer" ? "Créer le transfert" : "Enregistrer le mouvement"}
          </button>
        </form>

        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-sm">Historique des mouvements</h3>

          {combinedMovementHistory.length === 0 && (
            <p className="text-sm text-muted">Aucun mouvement pour le moment.</p>
          )}

          {combinedMovementHistory.length > 0 && (
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-surface-header border-b border-[#030a16]">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">Produit</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Lieu</th>
                    <th className="px-3 py-2 font-semibold text-right">Quantité</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedMovementHistory.map((entry) => (
                    <tr key={entry.id} className="border-t border-border">
                      <td className="px-3 py-2">{entry.itemLabel}</td>
                      <td className="px-3 py-2">{entry.typeLabel}</td>
                      <td className="px-3 py-2">
                        {entry.kind === "transfer"
                          ? `${entry.originLabel} → ${entry.destinationLabel}`
                          : entry.locationLabel}
                      </td>
                      <td className="px-3 py-2 text-right">{quantity(entry.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="bom"
            title="Nomenclatures"
            defaultOpen={false}
            forceOpen={forceOpenBom}
          >
        <div className="flex flex-col gap-3 border border-border rounded-lg p-4 max-w-md bg-background">
          <label className="flex flex-col gap-1 text-sm">
            Nouvelle nomenclature
            <select
              value={newBomProductId}
              onChange={(event) => handleNewBomProductSelect(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
            >
              <option value="">Produit à fabriquer…</option>
              <optgroup label="Produits finis">
                {productItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} — {item.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Intrants">
                {componentItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} — {item.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          {existingBomNoticeId && (
            <div className="flex items-center justify-between gap-3 rounded-md bg-surface-header px-3 py-2 text-sm">
              <span>Cette référence possède déjà une nomenclature.</span>
              <button
                type="button"
                onClick={viewExistingBomFromNotice}
                className="text-xs underline shrink-0"
              >
                Voir / Modifier
              </button>
            </div>
          )}

          {newBomProductId && (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              {(() => {
                const producedItem = items.find((item) => item.id === newBomProductId);
                const label = producedItem
                  ? `${producedItem.sku} — ${producedItem.name}`
                  : newBomProductId;

                return (
                  <>
                    <p className="font-medium text-foreground">Nomenclature de {label}</p>

                    {newBomDraftLines.length === 0 ? (
                      <p className="text-sm text-muted">Aucun intrant ajouté.</p>
                    ) : (
                      <div className="overflow-x-auto border border-border rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="bg-surface-header border-b border-[#030a16]">
                            <tr className="text-left">
                              <th className="px-3 py-2 font-semibold">Intrant</th>
                              <th className="px-3 py-2 font-semibold text-right">Quantité</th>
                              <th className="px-3 py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {newBomDraftLines.map((line, index) => {
                              const component = items.find(
                                (item) => item.id === line.componentItemId,
                              );

                              return (
                                <tr key={line.componentItemId} className="border-t border-border">
                                  <td className="px-3 py-2">
                                    {component
                                      ? `${component.sku} — ${component.name}`
                                      : line.componentItemId}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <input
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      value={line.quantity}
                                      onChange={(event) =>
                                        updateDraftBomLine(index, event.target.value)
                                      }
                                      className="border border-border rounded-md px-2 py-1 w-20 text-right bg-background text-foreground focus:outline-none focus:border-accent"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <button
                                      type="button"
                                      onClick={() => removeDraftBomLine(index)}
                                      className="text-xs text-red-600 hover:text-red-700"
                                    >
                                      Supprimer
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1 text-sm flex-1 min-w-[160px]">
                        Intrant
                        <select
                          value={draftInputItemId}
                          onChange={(event) => setDraftInputItemId(event.target.value)}
                          className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
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
                      <label className="flex flex-col gap-1 text-sm w-24">
                        Quantité
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={draftQuantity}
                          onChange={(event) => setDraftQuantity(event.target.value)}
                          className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={addDraftBomLine}
                        className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
                      >
                        + Ajouter un intrant
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void saveNewBomRecipe()}
                        disabled={loading || newBomDraftLines.length === 0}
                        className="rounded-md bg-accent text-white px-3 py-2 text-sm font-medium transition-colors hover:bg-accent-dark disabled:opacity-50 disabled:hover:bg-accent"
                      >
                        Enregistrer la nomenclature
                      </button>
                      <button
                        type="button"
                        onClick={cancelNewBomDraft}
                        className="text-sm text-muted hover:text-foreground"
                      >
                        Annuler
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {bomRecipes.length === 0 && (
            <p className="text-sm text-muted">Aucune nomenclature pour le moment.</p>
          )}

          {bomRecipes.map(({ producedItemId, producedItem, lines }) => {
            const isOpen = openBomProductId === producedItemId;
            const label = producedItem
              ? `${producedItem.sku} — ${producedItem.name}`
              : producedItemId;

            return (
              <div
                key={producedItemId}
                className="border border-border rounded-lg bg-background overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenBomProductId(isOpen ? null : producedItemId)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-black/[0.02]"
                >
                  <span className="font-medium text-foreground">{label}</span>
                  <span className="text-sm text-muted">
                    {lines.length} intrant{lines.length > 1 ? "s" : ""} · {isOpen ? "Masquer" : "Voir"}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-3 border-t border-border flex flex-col gap-3">
                    <div>
                      <p className="text-xs text-muted">Produit fabriqué</p>
                      <p className="font-medium text-foreground">{label}</p>
                    </div>

                    <div className="overflow-x-auto border border-border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-surface-header border-b border-[#030a16]">
                          <tr className="text-left">
                            <th className="px-3 py-2 font-semibold">Intrant</th>
                            <th className="px-3 py-2 font-semibold text-right">Quantité</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line) => {
                            const component = items.find(
                              (item) => item.id === line.component_item_id,
                            );

                            return (
                              <tr key={line.id} className="border-t border-border">
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
                                      void updateBomLineQuantity(
                                        line.id,
                                        Number(event.target.value),
                                      )
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
                          {lines.length === 0 && (
                            <tr>
                              <td className="px-3 py-4 text-center text-muted" colSpan={3}>
                                Aucun intrant pour le moment — ajoute le premier ci-dessous.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <p className="text-xs text-muted">Nombre d&apos;intrants : {lines.length}</p>

                    <form onSubmit={addBomLine} className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1 text-sm flex-1 min-w-[160px]">
                        Intrant
                        <select
                          required
                          value={bomInputItemId}
                          onChange={(event) => setBomInputItemId(event.target.value)}
                          className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
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
                      <label className="flex flex-col gap-1 text-sm w-24">
                        Quantité
                        <input
                          type="number"
                          required
                          min="0.01"
                          step="0.01"
                          value={bomQuantityPer}
                          onChange={(event) => setBomQuantityPer(event.target.value)}
                          className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={loading}
                        className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                      >
                        + Ajouter un intrant
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
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

            {locations.filter((location) => location.active).length > 1 && (
              <label className="flex flex-col gap-1 text-sm">
                Lieu de destination
                <select
                  required
                  value={orderDestinationLocationId}
                  onChange={(event) => setOrderDestinationLocationId(event.target.value)}
                  className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
                >
                  <option value="" disabled>
                    Sélectionner un lieu
                  </option>
                  {locations
                    .filter((location) => location.active)
                    .map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                </select>
              </label>
            )}

            <div className="flex flex-col gap-2">
              <p className="text-sm">Lignes</p>
              {orderLines.map((line, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 border border-border rounded-lg p-3"
                >
                  <label className="flex flex-col gap-1 text-sm">
                    Produit
                    <select
                      required
                      value={line.itemId}
                      onChange={(event) =>
                        updateOrderLine(index, { itemId: event.target.value })
                      }
                      className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
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
                  </label>

                  <label className="flex flex-col gap-1 text-sm">
                    Quantité
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
                      className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
                    />
                  </label>

                  {orderLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeOrderLine(index)}
                      className="text-sm text-red-600 hover:text-red-700 text-left w-fit"
                    >
                      Supprimer la ligne
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
                  {locations.filter((location) => location.active).length > 1 && (
                    <select
                      value={order.destination_location_id ?? ""}
                      onChange={(event) =>
                        void updateSupplierOrder(order.id, {
                          destination_location_id: event.target.value || null,
                        })
                      }
                      className="border border-border rounded-md px-2 py-1 text-xs bg-background text-foreground focus:outline-none focus:border-accent"
                    >
                      <option value="">Aucun lieu</option>
                      {locations
                        .filter((location) => location.active)
                        .map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                    </select>
                  )}
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
                                        locationId:
                                          current[line.id]?.locationId ??
                                          order.destination_location_id ??
                                          "",
                                      },
                                    }))
                                  }
                                  className="border border-border rounded-md px-2 py-1 w-20 bg-background text-foreground focus:outline-none focus:border-accent"
                                />
                                {locations.filter((location) => location.active).length > 1 && (
                                  <select
                                    value={draft?.locationId ?? order.destination_location_id ?? ""}
                                    onChange={(event) =>
                                      setReceiptDrafts((current) => ({
                                        ...current,
                                        [line.id]: {
                                          quantity: current[line.id]?.quantity ?? "",
                                          note: current[line.id]?.note ?? "",
                                          locationId: event.target.value,
                                        },
                                      }))
                                    }
                                    className="border border-border rounded-md px-2 py-1 text-xs bg-background text-foreground focus:outline-none focus:border-accent"
                                  >
                                    <option value="" disabled>
                                      Lieu
                                    </option>
                                    {locations
                                      .filter((location) => location.active)
                                      .map((location) => (
                                        <option key={location.id} value={location.id}>
                                          {location.name}
                                        </option>
                                      ))}
                                  </select>
                                )}
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

          {locations.filter((location) => location.active).length > 1 && (
            <label className="flex flex-col gap-1 text-sm">
              Lieu de production
              <select
                required
                value={productionLocationId}
                onChange={(event) => setProductionLocationId(event.target.value)}
                className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
              >
                <option value="" disabled>
                  Sélectionner un lieu
                </option>
                {locations
                  .filter((location) => location.active)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </label>
          )}

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
                    {locations.filter((location) => location.active).length > 1 && (
                      <label className="flex items-center gap-2 text-xs text-muted">
                        Lieu
                        <select
                          value={order.location_id ?? ""}
                          onChange={(event) =>
                            void updateProductionOrder(order.id, {
                              location_id: event.target.value || null,
                            })
                          }
                          className="border border-border rounded-md px-2 py-1 text-xs bg-background text-foreground focus:outline-none focus:border-accent"
                        >
                          {locations
                            .filter((location) => location.active)
                            .map((location) => (
                              <option key={location.id} value={location.id}>
                                {location.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
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
                      {!order.location_id && " — aucun lieu de production défini"}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="text-left text-muted">
                            <th className="px-2 py-1 min-w-[140px]">Intrant</th>
                            <th className="px-2 py-1 text-right min-w-[72px]">Besoin</th>
                            <th className="px-2 py-1 text-right min-w-[96px] whitespace-nowrap">
                              Sur site à date
                            </th>
                            <th className="px-2 py-1 min-w-[120px] whitespace-nowrap">Ailleurs</th>
                            <th className="px-2 py-1 text-right min-w-[100px] whitespace-nowrap">
                              Arrivées à temps
                            </th>
                            <th className="px-2 py-1 text-right min-w-[80px]">Manquant</th>
                            <th className="px-2 py-1 min-w-[160px] whitespace-nowrap">Action</th>
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
                                {quantity(line.onSite)}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap">
                                {line.elsewhere.length > 0
                                  ? line.elsewhere
                                      .map((entry) => `${quantity(entry.quantity)} à ${entry.locationName}`)
                                      .join(", ")
                                  : "—"}
                              </td>
                              <td className="px-2 py-1 text-right whitespace-nowrap">
                                {line.incoming > 0 ? quantity(line.incoming) : "—"}
                              </td>
                              <td className="px-2 py-1 text-right whitespace-nowrap">
                                {line.missing > 0 ? quantity(line.missing) : "—"}
                              </td>
                              <td
                                className={`px-2 py-1 whitespace-nowrap ${availabilityActionClass(line.status)}`}
                              >
                                <div className="flex items-center gap-2">
                                  <span>{availabilityActionLabel(line)}</span>
                                  {line.status === "a_transferer" && (
                                    <button
                                      type="button"
                                      onClick={() => openTransferDraft(order, line)}
                                      className="text-xs underline shrink-0"
                                    >
                                      Créer un transfert
                                    </button>
                                  )}
                                </div>
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

          <CollapsibleSection
            id="transfers"
            title="Transferts"
            defaultOpen={false}
            forceOpen={forceOpenTransfers}
          >
        <form
          onSubmit={addTransfer}
          className="flex flex-col gap-3 border border-border rounded-lg p-4 max-w-md bg-background"
        >
          <label className="flex flex-col gap-1 text-sm">
            Référence
            <select
              required
              value={transferItemId}
              onChange={(event) => setTransferItemId(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
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
            Lieu source
            <select
              required
              value={transferSourceLocationId}
              onChange={(event) => setTransferSourceLocationId(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
            >
              <option value="" disabled>
                Sélectionner un lieu
              </option>
              {locations
                .filter((location) => location.active)
                .map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Lieu de destination
            <select
              required
              value={transferDestinationLocationId}
              onChange={(event) => setTransferDestinationLocationId(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-accent"
            >
              <option value="" disabled>
                Sélectionner un lieu
              </option>
              {locations
                .filter((location) => location.active && location.id !== transferSourceLocationId)
                .map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Quantité
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={transferQuantity}
              onChange={(event) => setTransferQuantity(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Date prévue
            <input
              type="date"
              value={transferPlannedAt}
              onChange={(event) => setTransferPlannedAt(event.target.value)}
              className="border border-border rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent text-white px-3 py-2 font-medium transition-colors hover:bg-accent-dark disabled:opacity-50 disabled:hover:bg-accent"
          >
            Créer le transfert
          </button>
        </form>

        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-sm">Transferts ouverts</h3>

          {transfers.length === 0 && (
            <p className="text-sm text-muted">Aucun transfert en cours.</p>
          )}

          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-surface-header border-b-2 border-border">
                <tr className="text-left text-muted">
                  <th className="px-2 py-1">Référence</th>
                  <th className="px-2 py-1">De</th>
                  <th className="px-2 py-1">Vers</th>
                  <th className="px-2 py-1 text-right">Quantité</th>
                  <th className="px-2 py-1">Date prévue</th>
                  <th className="px-2 py-1">Statut</th>
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((transfer) => {
                  const sourceName =
                    locations.find((location) => location.id === transfer.source_location_id)
                      ?.name ?? transfer.source_location_id;
                  const destinationName =
                    locations.find(
                      (location) => location.id === transfer.destination_location_id,
                    )?.name ?? transfer.destination_location_id;

                  return (
                    <tr key={transfer.id} className="border-t border-border">
                      <td className="px-2 py-1">
                        {transfer.items.sku} — {transfer.items.name}
                      </td>
                      <td className="px-2 py-1">{sourceName}</td>
                      <td className="px-2 py-1">{destinationName}</td>
                      <td className="px-2 py-1 text-right">{quantity(transfer.quantity)}</td>
                      <td className="px-2 py-1">{transfer.planned_at ?? "—"}</td>
                      <td className="px-2 py-1">{stockTransferStatusLabel(transfer.status)}</td>
                      <td className="px-2 py-1">
                        <div className="flex gap-2">
                          {transfer.status === "planned" && (
                            <button
                              type="button"
                              onClick={() => void departTransfer(transfer.id)}
                              disabled={loading}
                              className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                            >
                              Marquer en transit
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void receiveTransfer(transfer.id)}
                            disabled={loading}
                            className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                          >
                            Marquer reçu
                          </button>
                          <button
                            type="button"
                            onClick={() => void cancelTransfer(transfer.id)}
                            disabled={loading}
                            className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                          >
                            Annuler
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
          </CollapsibleSection>
        </div>
      </div>
    </main>
  );
}
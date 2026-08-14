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
      await loadStockData(org.id);
    }

    setLoading(false);
  }, [loadStockData]);

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

  async function signOut() {
    await supabase.auth.signOut();
  }

  const alertCount = dashboard.filter((row) => row.alert_status !== "ok").length;

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
              <option value="component">Composant</option>
              <option value="product">Produit</option>
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
                    {row.item_type === "component" ? "Composant" : "Produit"}
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
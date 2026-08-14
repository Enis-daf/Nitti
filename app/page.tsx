"use client";

import { type FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Organization = {
  id: string;
  name: string;
};

export default function Home() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [needsOrganization, setNeedsOrganization] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;

      if (!user) {
        setLoading(false);
        return;
      }

      setUserEmail(user.email ?? null);
      loadOrganization();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setUserEmail(user?.email ?? null);

      if (user) {
        loadOrganization();
      } else {
        setOrganization(null);
        setNeedsOrganization(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadOrganization() {
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
    }

    setLoading(false);
  }

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

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (userEmail) {
    return (
      <main className="min-h-screen bg-zinc-950 px-6 py-10 text-white">
        <section className="mx-auto flex max-w-3xl flex-col gap-8">
          <div>
            <p className="text-sm text-zinc-400">Nitti</p>
            <h1 className="mt-2 text-4xl font-semibold">Gestion des stocks</h1>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm text-zinc-400">Connecté avec</p>
            <p className="mt-1 font-medium">{userEmail}</p>

            {organization && (
              <div className="mt-6">
                <p className="text-sm text-zinc-400">Organisation</p>
                <p className="mt-1 text-xl font-semibold">{organization.name}</p>
              </div>
            )}

            {needsOrganization && (
              <div className="mt-6 flex flex-col gap-3">
                <label className="text-sm text-zinc-300">
                  Nom de l'entreprise
                </label>
                <input
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-white"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  placeholder="Entreprise"
                />
                <button
                  className="rounded-md bg-white px-4 py-2 font-medium text-zinc-950 disabled:opacity-50"
                  onClick={createOrganization}
                  disabled={loading}
                >
                  Créer l'espace
                </button>
              </div>
            )}

            <button
              className="mt-8 rounded-md border border-zinc-700 px-4 py-2 text-sm"
              onClick={signOut}
            >
              Se déconnecter
            </button>

            {message && <p className="mt-4 text-sm text-zinc-300">{message}</p>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-white">
      <form
        onSubmit={handleAuth}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6"
      >
        <div>
          <p className="text-sm text-zinc-400">Nitti</p>
          <h1 className="mt-2 text-3xl font-semibold">
            {mode === "signin" ? "Connexion" : "Créer un compte"}
          </h1>
        </div>

        <input
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-white"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          required
        />

        <input
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-white"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Mot de passe"
          required
        />

        {mode === "signup" && (
          <input
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-white"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            placeholder="Nom de l'entreprise"
          />
        )}

        <button
          className="rounded-md bg-white px-4 py-2 font-medium text-zinc-950 disabled:opacity-50"
          disabled={loading}
        >
          {loading
            ? "Chargement..."
            : mode === "signin"
              ? "Se connecter"
              : "Créer le compte"}
        </button>

        <button
          type="button"
          className="text-sm text-zinc-400"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMessage("");
          }}
        >
          {mode === "signin"
            ? "Créer un compte"
            : "J'ai déjà un compte"}
        </button>

        {message && <p className="text-sm text-zinc-300">{message}</p>}
      </form>
    </main>
  );
}
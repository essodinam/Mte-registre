import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase n'est pas configuré : renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (voir README.md)."
    );
  }
}

/**
 * Reproduit l'API du stockage d'artifact Claude (get/set/delete) pour que le
 * reste de l'application n'ait presque rien à changer.
 * - shared = false → donnée propre à cet appareil (localStorage). Utilisé
 *   uniquement pour retenir le code du commerce sur ce téléphone/ordinateur.
 * - shared = true  → donnée du commerce, synchronisée pour tous les
 *   appareils via une table Supabase (produits, ventes, vendeurs, etc.).
 */
async function get(key, shared = false) {
  if (!shared) {
    const value = localStorage.getItem(key);
    return value === null ? null : { key, value, shared: false };
  }
  requireSupabase();
  const { data, error } = await supabase.from("kv_store").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { key, value: JSON.stringify(data.value), shared: true };
}

async function set(key, value, shared = false) {
  if (!shared) {
    localStorage.setItem(key, value);
    return { key, value, shared: false };
  }
  requireSupabase();
  const { error } = await supabase
    .from("kv_store")
    .upsert({ key, value: JSON.parse(value), updated_at: new Date().toISOString() });
  if (error) throw error;
  return { key, value, shared: true };
}

async function del(key, shared = false) {
  if (!shared) {
    localStorage.removeItem(key);
    return { key, deleted: true, shared: false };
  }
  requireSupabase();
  const { error } = await supabase.from("kv_store").delete().eq("key", key);
  if (error) throw error;
  return { key, deleted: true, shared: true };
}

export const storage = { get, set, delete: del };

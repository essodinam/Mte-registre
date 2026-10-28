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

/**
 * Photos des articles : stockées dans un espace Supabase Storage dédié
 * (bucket "product-photos", public en lecture) plutôt que dans les données
 * du produit elles-mêmes, pour ne jamais ralentir la synchronisation des
 * ventes/stock. L'image est redimensionnée côté appareil avant l'envoi pour
 * rester légère même avec une connexion lente.
 */
const PHOTOS_BUCKET = "product-photos";

function resizeImage(file, maxSize = 480, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture de l'image impossible."));
    reader.onload = () => {
      img.onerror = () => reject(new Error("Image invalide."));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Compression impossible."))), "image/jpeg", quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadToPhotosBucket(file, path) {
  requireSupabase();
  const blob = await resizeImage(file);
  const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function uploadProductPhoto(file, shopId, productId) {
  return uploadToPhotosBucket(file, `${shopId}/${productId}-${Date.now()}.jpg`);
}

/**
 * Logo du commerce (quincaillerie, boutique, bar, menuiserie...) : réutilise le
 * même espace de stockage que les photos d'articles (bucket "product-photos"),
 * sous un chemin dédié par commerce, pour éviter d'avoir à créer un deuxième
 * bucket Supabase.
 */
async function uploadShopLogo(file, shopId) {
  return uploadToPhotosBucket(file, `${shopId}/_logo-${Date.now()}.jpg`);
}

async function deletePhoto(url) {
  if (!supabase || !url) return;
  try {
    const marker = `/${PHOTOS_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const path = url.slice(idx + marker.length).split("?")[0];
    await supabase.storage.from(PHOTOS_BUCKET).remove([path]);
  } catch (e) {
    // La suppression de l'ancienne photo n'est pas bloquante.
  }
}

/**
 * Suppression complète d'un commerce (réservée au panneau développeur) :
 * toutes les lignes "nom:CODE" de la base + le dossier de photos du commerce.
 */
function assertShopCode(code) {
  if (!/^[A-Za-z0-9-]+$/.test(code || "")) throw new Error("Code de commerce invalide.");
}

async function deleteShopData(code) {
  requireSupabase();
  assertShopCode(code);
  const { error } = await supabase.from("kv_store").delete().like("key", `%:${code}`);
  if (error) throw error;
  try {
    const { data: files } = await supabase.storage.from(PHOTOS_BUCKET).list(code, { limit: 1000 });
    if (files && files.length) await supabase.storage.from(PHOTOS_BUCKET).remove(files.map((f) => `${code}/${f.name}`));
  } catch (e) {
    // Le nettoyage des photos n'est pas bloquant.
  }
}

async function listCodesWithPrefix(prefix) {
  requireSupabase();
  const { data, error } = await supabase.from("kv_store").select("key").like("key", `%:${prefix}%`).limit(5000);
  if (error) throw error;
  const codes = new Set();
  (data || []).forEach((r) => {
    const code = r.key.slice(r.key.lastIndexOf(":") + 1);
    if (code.startsWith(prefix)) codes.add(code);
  });
  return [...codes];
}

export const storage = {
  get,
  set,
  delete: del,
  uploadProductPhoto,
  deleteProductPhoto: deletePhoto,
  uploadShopLogo,
  deleteShopLogo: deletePhoto,
  deleteShopData,
  listCodesWithPrefix,
};

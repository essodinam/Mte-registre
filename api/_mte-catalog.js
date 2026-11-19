// Moïse Tech & Énergie — catalogue de la boutique en ligne (les PRIX sont fixés ICI, côté serveur :
// un client ne peut jamais les modifier depuis son navigateur).
// Pour ajouter un produit payable en ligne : ajoute une ligne { id, name, price } (prix en FCFA), puis ajoute le même id dans index.html.
export const CATALOG = [
  { id: "camera", name: "Caméra de vidéosurveillance", price: 25000 },
  { id: "solaire", name: "Panneau solaire", price: 20000 },
];
// Frais de livraison à Lomé (0 = gratuit). Le retrait en magasin est toujours gratuit.
export const DELIVERY_FEE = 0;
export const SHOP_ID = "MTE-WEB";

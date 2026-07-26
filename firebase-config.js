// ============================================
// APNA BAZAR — Firebase Configuration
// ============================================
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (e.g. "apna-bazar")
// 3. Add a Web App inside it, copy the config it gives you, paste below
// 4. In the Firebase Console, enable "Firestore Database" (start in test mode
//    for now — lock it down with security rules before you launch for real)
//
// This ONE file is shared by all three apps (store, shopkeeper, delivery)
// so you only ever configure Firebase in one place.

const firebaseConfig = {
  apiKey: "AIzaSyDCY85GKNbwusroVzOOvTEkInHlrIz19TI",
  authDomain: "apna-bazar-bb91d.firebaseapp.com",
  projectId: "apna-bazar-bb91d",
  storageBucket: "apna-bazar-bb91d.firebasestorage.app",
  messagingSenderId: "707116485598",
  appId: "1:707116485598:web:f4da0e623592afeb702b4f"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth ? firebase.auth() : null; // only pages that load firebase-auth-compat.js will have this

// ---------- Shared helpers used by all three apps ----------

// Collections:
//   shops       { id, name, phone, area, lat, lng, createdAt }
//   products    { id, shopId, shopName, name, price, unit, category, stock, area, imageUrl, createdAt }
//   customers   { id = auth uid, name, phone, address, area, lat, lng, email, photoURL (small compressed data URL, stored free in Firestore), createdAt }
//   orders      { id, customerUid, customerName, customerPhone, address, area, customerLat, customerLng,
//                 items:[{productId,name,price,qty,shopId,shopName}], total, status,
//                 deliveryPersonName, deliveryPersonPhone,
//                 shopId, shopName (the delivery's "primary" shop — see note below),
//                 deliveryCharge, deliveryDistanceKm,
//                 deliveryLat, deliveryLng, deliveryLocationUpdatedAt (delivery person's live location while out_for_delivery),
//                 settled, pendingSettlement,
//                 createdAt, updatedAt }
//   delivery    { id, name, phone, createdAt }
//   deliveryWallets { id = deliveryPersonPhone, name, phone, cashHeld, totalEarned, totalDeliveries, updatedAt }
//   settlements { id, deliveryPersonName, deliveryPersonPhone, shopId, shopName, orderIds:[...],
//                 cashAmount, deliveryChargeAmount, netAmount, status: 'pending'|'accepted', createdAt, acceptedAt }
//
// Order status flow:
//   pending  ->  packed  ->  out_for_delivery  ->  delivered
//
// NOTE on multi-shop orders: an order's `items` can technically come from more than one
// shop. For delivery-charge/wallet purposes we treat items[0]'s shop as the order's
// "primary" shop (this app is built for small single-shop-per-order local orders — if you
// start getting real multi-shop carts, split settlement by each shop's share of the total
// instead of using a single primary shop).

function formatRupees(n) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

// Straight-line distance in km between two lat/lng points (Haversine formula).
// Good enough for "within the same pincode" delivery distances. Returns null if
// either point is missing (e.g. customer or shop never shared their location).
function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => v === null || v === undefined || isNaN(v))) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Delivery charge rule:
//   Order total >= ₹600  -> free delivery (₹0)
//   Order total <  ₹600  -> ₹10 base charge, rising with distance up to ₹50 max
//   Distance bands (straight-line — deliveries stay within one pincode):
//     unknown distance -> ₹10 (base, can't tell how far it is)
//     <= 1.5 km  -> ₹10
//     <= 3 km    -> ₹20
//     <= 4.5 km  -> ₹35
//     >  4.5 km  -> ₹50
function computeDeliveryCharge(orderTotal, distanceKm) {
  if (orderTotal >= 600) return 0;
  if (distanceKm === null || distanceKm === undefined) return 10;
  if (distanceKm <= 1.5) return 10;
  if (distanceKm <= 3) return 20;
  if (distanceKm <= 4.5) return 35;
  return 50;
}

function timeAgo(ts) {
  if (!ts) return "";
  const seconds = Math.floor((Date.now() - ts.toDate().getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.floor(hrs / 24) + "d ago";
}

// assets/js/firebase/firestore.js
// ─────────────────────────────────────────────────────────────
// Firestore data layer
// - Generic CRUD helpers (single-source timestamps)
// - Cached queries (30s TTL)
// - Sequential codes: SHP / PRD / DLV
// - Random codes: ORD / TXN
// - Atomic order + payment + shop-stats writes
// ─────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  increment,
  getCountFromServer,
  onSnapshot,
  runTransaction,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { db } from "./config.js";
import { cacheGet, cacheSet, cacheClear } from "../utils/helpers.js";

/* ═══════════════════════════════════════════════════════
   RE-EXPORTS
   ═══════════════════════════════════════════════════════ */
export {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  increment,
  onSnapshot,
  runTransaction,
  writeBatch,
  cacheClear,
};

/* ═══════════════════════════════════════════════════════
   GENERIC CRUD
   NOTE: These helpers own the createdAt/updatedAt timestamps.
   Do NOT add them in the payload — pass business fields only.
   ═══════════════════════════════════════════════════════ */

export async function createDocument(collectionName, data) {
  const payload = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, collectionName), payload);
  return { id: ref.id };
}

export async function createDocumentWithId(collectionName, id, data) {
  const payload = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, collectionName, id), payload);
  return { id };
}

export async function getDocumentById(collectionName, id) {
  const snap = await getDoc(doc(db, collectionName, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function queryCollection(collectionName, opts = {}) {
  const { filters = [], order = [], limitCount = 20, cursor = null } = opts;
  const constraints = [];
  filters.forEach(([field, op, value]) => constraints.push(where(field, op, value)));
  order.forEach(([field, dir]) => constraints.push(orderBy(field, dir)));
  constraints.push(limit(limitCount + 1));
  if (cursor) constraints.push(startAfter(cursor));

  const q = query(collection(db, collectionName), ...constraints);
  const snap = await getDocs(q);
  const docs = snap.docs;
  const hasMore = docs.length > limitCount;
  const pageDocs = hasMore ? docs.slice(0, limitCount) : docs;

  return {
    items: pageDocs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: pageDocs[pageDocs.length - 1] || null,
    hasMore,
  };
}

export async function queryCollectionCached(collectionName, opts = {}) {
  const { skipCache = false, cacheTtlMs = 30000, ...rest } = opts;
  const cacheKey = `q:${collectionName}:${JSON.stringify({
    filters: rest.filters || [],
    order: rest.order || [],
    limitCount: rest.limitCount || 20,
    cursorId: rest.cursor?.id || null,
  })}`;
  if (!skipCache) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }
  const result = await queryCollection(collectionName, rest);
  cacheSet(cacheKey, result, cacheTtlMs);
  return result;
}

export async function countDocuments(collectionName, filters = []) {
  const constraints = filters.map(([field, op, value]) => where(field, op, value));
  const q = query(collection(db, collectionName), ...constraints);
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

export async function updateDocument(collectionName, id, data) {
  await updateDoc(doc(db, collectionName, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDocument(collectionName, id) {
  await deleteDoc(doc(db, collectionName, id));
}

export function subscribeCollection(collectionName, opts = {}, callback) {
  const { filters = [], order = [], limitCount = 20 } = opts;
  const constraints = [];
  filters.forEach(([f, op, v]) => constraints.push(where(f, op, v)));
  order.forEach(([f, d]) => constraints.push(orderBy(f, d)));
  if (limitCount) constraints.push(limit(limitCount));

  const q = query(collection(db, collectionName), ...constraints);
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(items);
  });
}

/* ═══════════════════════════════════════════════════════
   SEQUENTIAL CODE GENERATORS
   ═══════════════════════════════════════════════════════ */

async function generateSequentialCode(counterName, prefix) {
  const counterRef = doc(db, "counters", counterName);
  const nextValue = await runTransaction(db, async (txn) => {
    const snap = await txn.get(counterRef);
    const current = snap.exists() ? snap.data().value || 0 : 0;
    const next = current + 1;
    txn.set(counterRef, { value: next }, { merge: true });
    return next;
  });
  return `${prefix}-${String(nextValue).padStart(5, "0")}`;
}

export const generateShopCode     = () => generateSequentialCode("shopCounter", "SHP");
export const generateProductCode  = () => generateSequentialCode("productCounter", "PRD");
export const generateDeliveryCode = () => generateSequentialCode("deliveryCode", "DLV");

/* ═══════════════════════════════════════════════════════
   RANDOM CODE GENERATOR — orders/transactions
   ═══════════════════════════════════════════════════════ */

export function generateRandomCode(prefix, length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${code}`;
}

/* ═══════════════════════════════════════════════════════
   SHOP — create / update
   ═══════════════════════════════════════════════════════ */

export async function createShopAtomic(shopData, uid) {
  if (!shopData?.name) throw new Error("shop-name-required");

  const code = await generateShopCode();

  // ⚠️ Only business fields — timestamps added by createDocument()
  const payload = {
    code,
    name: shopData.name.trim(),
    ownerName: shopData.ownerName?.trim() || null,
    ownerPhone: shopData.ownerPhone?.trim() || null,
    ownerAltPhone: shopData.ownerAltPhone?.trim() || null,
    address: shopData.address?.trim() || null,
    area: shopData.area?.trim() || null,
    district: shopData.district?.trim() || null,
    status: "active",
    stats: {
      totalOrders: 0,
      totalSales: 0,
      totalPaid: 0,
      totalDue: 0,
      lastOrderAt: null,
    },
    createdBy: uid,
  };

  const { id } = await createDocument("shops", payload);
  return { shopId: id, code, shop: { id, ...payload } };
}

export async function updateShopAtomic(shopId, data) {
  const payload = {
    name: data.name?.trim(),
    ownerName: data.ownerName?.trim() || null,
    ownerPhone: data.ownerPhone?.trim() || null,
    ownerAltPhone: data.ownerAltPhone?.trim() || null,
    address: data.address?.trim() || null,
    area: data.area?.trim() || null,
    district: data.district?.trim() || null,
  };
  await updateDocument("shops", shopId, payload);
}

/* ═══════════════════════════════════════════════════════
   PRODUCT — create / update
   ═══════════════════════════════════════════════════════ */

export async function createProductAtomic(productData, uid) {
  if (!productData?.name) throw new Error("product-name-required");

  const code = await generateProductCode();

  const payload = {
    code,
    name: productData.name.trim(),
    sku: productData.sku?.trim() || null,
    category: productData.category?.trim() || null,
    purchasePrice: Number(productData.purchasePrice) || 0,
    sellingPrice: Number(productData.sellingPrice) || 0,
    stock: Number(productData.stock) || 0,
    unit: productData.unit?.trim() || "pcs",
    lowStockThreshold: Number(productData.lowStockThreshold) || 10,
    imageUrl: productData.imageUrl || null,
    status: productData.status || "active",
    createdBy: uid,
  };

  const { id } = await createDocument("products", payload);
  return { productId: id, code, product: { id, ...payload } };
}

export async function updateProductAtomic(productId, updates) {
  const patch = {
    name: updates.name?.trim(),
    sku: updates.sku?.trim() || null,
    category: updates.category?.trim() || null,
    purchasePrice: Number(updates.purchasePrice) || 0,
    sellingPrice: Number(updates.sellingPrice) || 0,
    stock: Number(updates.stock) || 0,
    unit: updates.unit?.trim() || "pcs",
    lowStockThreshold: Number(updates.lowStockThreshold) || 10,
    status: updates.status || "active",
  };
  await updateDocument("products", productId, patch);
}

/* ═══════════════════════════════════════════════════════
   DELIVERY MAN — create / update
   ═══════════════════════════════════════════════════════ */

export async function createDeliveryManAtomic(data, uid) {
  if (!data?.name) throw new Error("delivery-name-required");

  const code = await generateDeliveryCode();

  // ⚠️ Only business fields + joinedAt (semantic).
  // createdAt/updatedAt added by createDocument().
  const payload = {
    code,
    name: data.name.trim(),
    phone: data.phone?.trim() || null,
    altPhone: data.altPhone?.trim() || null,
    address: data.address?.trim() || null,
    area: data.area?.trim() || null,
    district: data.district?.trim() || null,
    vehicleType: data.vehicleType || "Motorcycle",
    vehicleNumber: data.vehicleNumber?.trim() || null,
    status: data.status || "active",
    stats: {
      totalAssigned: 0,
      totalDelivered: 0,
      totalFailed: 0,
      totalReturned: 0,
      totalCollected: 0,
    },
    joinedAt: serverTimestamp(),
    createdBy: uid,
  };

  const { id } = await createDocument("deliveryMen", payload);
  return { deliveryManId: id, code, data: { id, ...payload } };
}

export async function updateDeliveryManAtomic(id, data) {
  const payload = {
    name: data.name?.trim(),
    phone: data.phone?.trim() || null,
    altPhone: data.altPhone?.trim() || null,
    address: data.address?.trim() || null,
    area: data.area?.trim() || null,
    district: data.district?.trim() || null,
    vehicleType: data.vehicleType || "Motorcycle",
    vehicleNumber: data.vehicleNumber?.trim() || null,
    status: data.status || "active",
  };
  await updateDocument("deliveryMen", id, payload);
}

/* ═══════════════════════════════════════════════════════
   ORDER — atomic create (with initial payment + shop stats)
   ═══════════════════════════════════════════════════════ */

export async function createOrderAtomic(orderData, opts) {
  const { uid, shopId, paidAmount = 0, paymentMethod = "Cash" } = opts;
  if (!shopId) throw new Error("shop-id-required");

  const orderCode = generateRandomCode("ORD");
  const txnCode = paidAmount > 0 ? generateRandomCode("TXN") : null;

  const orderRef = doc(collection(db, "orders"));
  const txnRef = txnCode ? doc(collection(db, "transactions")) : null;
  const shopRef = doc(db, "shops", shopId);

  await runTransaction(db, async (txn) => {
    const shopSnap = await txn.get(shopRef);
    if (!shopSnap.exists()) throw new Error("shop-not-found");
    const shop = shopSnap.data();

    const grandTotal = Number(orderData.grandTotal) || 0;
    const paid = Math.max(0, Number(paidAmount) || 0);
    const due = Math.max(0, grandTotal - paid);

    txn.set(orderRef, {
      ...orderData,
      orderCode,
      shopId,
      shopCode: shop.code || null,
      shopName: shop.name || null,
      payment: {
        paid,
        due,
        method: paymentMethod,
        status: paid === 0 ? "Unpaid" : paid >= grandTotal ? "Paid" : "Partial",
      },
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const stats = shop.stats || {};
    const newTotalSales = (stats.totalSales || 0) + grandTotal;
    const newTotalPaid = (stats.totalPaid || 0) + paid;

    txn.update(shopRef, {
      "stats.totalOrders": (stats.totalOrders || 0) + 1,
      "stats.totalSales": newTotalSales,
      "stats.totalPaid": newTotalPaid,
      "stats.totalDue": Math.max(0, newTotalSales - newTotalPaid),
      "stats.lastOrderAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (paid > 0 && txnRef) {
      txn.set(txnRef, {
        code: txnCode,
        shopId,
        shopCode: shop.code || null,
        shopName: shop.name || null,
        orderId: orderRef.id,
        orderCode,
        type: "payment",
        amount: paid,
        method: paymentMethod,
        reference: null,
        note: "Initial payment",
        orderPaidAfter: paid,
        orderDueAfter: due,
        createdBy: uid,
        createdAt: serverTimestamp(),
      });
    }
  });

  return {
    orderId: orderRef.id,
    orderCode,
    txnId: txnRef?.id || null,
    txnCode: txnCode || null,
  };
}

export async function addPaymentAtomic(opts) {
  const { uid, orderId, amount, method = "Cash", note = "", reference = null } = opts;
  const amt = Number(amount);
  if (!orderId) throw new Error("order-id-required");
  if (!amt || amt <= 0) throw new Error("invalid-amount");

  const txnCode = generateRandomCode("TXN");
  const orderRef = doc(db, "orders", orderId);
  const txnRef = doc(collection(db, "transactions"));

  let newPaid = 0;
  let newDue = 0;

  await runTransaction(db, async (txn) => {
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists()) throw new Error("order-not-found");
    const order = orderSnap.data();

    const grandTotal = Number(order.grandTotal) || 0;
    const currentPaid = Number(order.payment?.paid) || 0;
    const currentDue = Math.max(0, grandTotal - currentPaid);
    const appliedAmount = Math.min(amt, currentDue);
    if (appliedAmount <= 0) throw new Error("nothing-to-pay");

    newPaid = currentPaid + appliedAmount;
    newDue = Math.max(0, grandTotal - newPaid);
    const newStatus = newPaid >= grandTotal ? "Paid" : "Partial";

    const shopRef = doc(db, "shops", order.shopId);
    const shopSnap = await txn.get(shopRef);

    txn.update(orderRef, {
      "payment.paid": newPaid,
      "payment.due": newDue,
      "payment.method": method,
      "payment.status": newStatus,
      updatedAt: serverTimestamp(),
    });

    if (shopSnap.exists()) {
      const stats = shopSnap.data().stats || {};
      const newTotalPaid = (stats.totalPaid || 0) + appliedAmount;
      txn.update(shopRef, {
        "stats.totalPaid": newTotalPaid,
        "stats.totalDue": Math.max(0, (stats.totalSales || 0) - newTotalPaid),
        updatedAt: serverTimestamp(),
      });
    }

    txn.set(txnRef, {
      code: txnCode,
      shopId: order.shopId,
      shopCode: order.shopCode || null,
      shopName: order.shopName || null,
      orderId,
      orderCode: order.orderCode || null,
      type: "payment",
      amount: appliedAmount,
      method,
      reference,
      note: note || "Payment received",
      orderPaidAfter: newPaid,
      orderDueAfter: newDue,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
  });

  return { txnId: txnRef.id, txnCode, newPaid, newDue };
}

export async function deleteOrderAtomic(orderId) {
  if (!orderId) throw new Error("order-id-required");
  const orderRef = doc(db, "orders", orderId);

  await runTransaction(db, async (txn) => {
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists()) throw new Error("order-not-found");
    const order = orderSnap.data();

    if (order.shopId) {
      const shopRef = doc(db, "shops", order.shopId);
      const shopSnap = await txn.get(shopRef);
      if (shopSnap.exists()) {
        const stats = shopSnap.data().stats || {};
        const newTotalSales = Math.max(0, (stats.totalSales || 0) - (order.grandTotal || 0));
        const newTotalPaid = Math.max(0, (stats.totalPaid || 0) - (order.payment?.paid || 0));
        txn.update(shopRef, {
          "stats.totalOrders": Math.max(0, (stats.totalOrders || 0) - 1),
          "stats.totalSales": newTotalSales,
          "stats.totalPaid": newTotalPaid,
          "stats.totalDue": Math.max(0, newTotalSales - newTotalPaid),
          updatedAt: serverTimestamp(),
        });
      }
    }
    txn.delete(orderRef);
  });
}

/* ═══════════════════════════════════════════════════════
   HELPER QUERIES
   ═══════════════════════════════════════════════════════ */

export async function getOrderTransactions(orderId, limitCount = 50) {
  return queryCollection("transactions", {
    filters: [["orderId", "==", orderId]],
    order: [["createdAt", "desc"]],
    limitCount,
  });
}

export async function getShopTransactions(shopId, opts = {}) {
  const { limitCount = 50, cursor = null } = opts;
  return queryCollection("transactions", {
    filters: [["shopId", "==", shopId]],
    order: [["createdAt", "desc"]],
    limitCount,
    cursor,
  });
}

export async function getShopOrders(shopId, opts = {}) {
  const { limitCount = 20, cursor = null, cacheTtlMs = 30000 } = opts;
  return queryCollectionCached("orders", {
    filters: [["shopId", "==", shopId]],
    order: [["createdAt", "desc"]],
    limitCount,
    cursor,
    cacheTtlMs,
  });
}

export async function getShopByCode(code) {
  const result = await queryCollection("shops", {
    filters: [["code", "==", code]],
    limitCount: 1,
  });
  return result.items[0] || null;
}
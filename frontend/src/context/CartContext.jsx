import { createContext, useContext, useEffect, useState } from "react";

const CartCtx = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem("canteenx.cart"));
      return Array.isArray(v) ? v.filter((i) => i && i.id && i.qty > 0 && typeof i.price === "number") : [];
    } catch { return []; }
  });
  useEffect(() => { localStorage.setItem("canteenx.cart", JSON.stringify(items)); }, [items]);

  const add = (food, qty = 1) =>
    setItems((cur) => {
      const found = cur.find((i) => i.id === food.id);
      if (found) return cur.map((i) => (i.id === food.id ? { ...i, qty: Math.min(20, i.qty + qty) } : i));
      return [...cur, { id: food.id, name: food.name, price: food.price, image_url: food.image_url, category: food.category, is_veg: food.is_veg, qty }];
    });
  const setQty = (id, qty) => setItems((cur) => (qty <= 0 ? cur.filter((i) => i.id !== id) : cur.map((i) => (i.id === id ? { ...i, qty: Math.min(20, qty) } : i))));
  const remove = (id) => setItems((cur) => cur.filter((i) => i.id !== id));
  const clear = () => setItems([]);
  /** Refresh name / price / image from the live menu (MongoDB) and drop dishes that were deleted.
      Returns true when something changed so the page can tell the student. */
  const sync = (foods) => {
    if (!Array.isArray(foods)) return false;
    const byId = Object.fromEntries(foods.map((f) => [f.id, f]));
    const next = items.filter((i) => byId[i.id]).map((i) => {
      const f = byId[i.id];
      return { ...i, name: f.name, price: f.price, image_url: f.image_url, category: f.category, is_veg: f.is_veg };
    });
    const changed = next.length !== items.length || next.some((n, k) => n.price !== items[k].price || n.name !== items[k].name || n.image_url !== items[k].image_url);
    if (changed) setItems(next);
    return changed;
  };
  const count = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);
  const payload = items.map((i) => ({ food_id: i.id, qty: i.qty }));

  return <CartCtx.Provider value={{ items, add, setQty, remove, clear, sync, count, total, payload }}>{children}</CartCtx.Provider>;
}

export const useCart = () => useContext(CartCtx);

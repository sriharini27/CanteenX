import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useFetch from "../../hooks/useFetch";
import { Foods } from "../../services/api";
import { useCart } from "../../context/CartContext";
import { PageHeader, Loading, ErrorBox, Empty, Icon, VegDot, rupee, toast } from "../../components/ui";
import { FoodImage } from "../../components/canteen";

const CATS = ["ALL", "Breakfast", "Meals", "Snacks", "Beverages"];
const TYPES = [["ALL", "All"], ["VEG", "Veg"], ["NON_VEG", "Non-veg"]];

export default function Menu() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [onlyAvail, setOnlyAvail] = useState(false);
  // Everything on this page comes from MongoDB via GET /api/foods; refreshed every 20 s and when the tab regains focus,
  // so admin edits (name, price, photo, availability) show up without a manual reload.
  const { data, loading, error, reload } = useFetch(() => Foods.list({ search, category, type }), [search, category, type], { interval: 20000 });
  const cart = useCart();
  useEffect(() => {
    const onFocus = () => reload(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);
  useEffect(() => {
    if (data && search === "" && category === "ALL" && type === "ALL" && cart.sync(data)) toast("Cart updated with the latest menu prices");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const foods = (data || []).filter((f) => !onlyAvail || f.in_stock);

  return (
    <>
      <PageHeader eyebrow="Student" title="Menu" subtitle="Freshly prepared every day. Prices, photos and stock update live from the canteen.">
        <Link to="/student/cart" className="btn-primary"><Icon name="cart" />Cart · {cart.count}</Link>
      </PageHeader>

      <div className="card p-3 mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input className="input !pl-9" placeholder="Search dishes…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATS.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition ${category === c ? "bg-ink text-white border-ink" : "bg-white border-paper-300 hover:border-ink-300"}`}>{c === "ALL" ? "All" : c}</button>
          ))}
        </div>
        <div className="flex rounded-lg border border-paper-300 overflow-hidden">
          {TYPES.map(([v, l]) => (
            <button key={v} onClick={() => setType(v)} className={`px-3 py-1.5 text-xs font-semibold ${type === v ? "bg-saffron text-white" : "bg-white hover:bg-paper"}`}>{l}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-700"><input type="checkbox" checked={onlyAvail} onChange={(e) => setOnlyAvail(e.target.checked)} className="accent-saffron" />Available only</label>
      </div>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : foods.length === 0 ? <Empty title="No dishes match" text="Try a different search or filter." icon="search" /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {foods.map((f) => {
            const inCart = cart.items.find((i) => i.id === f.id);
            const rem = f.stock.remaining;
            return (
              <div key={f.id} className={`card overflow-hidden flex flex-col group ${f.in_stock ? "" : "opacity-60"}`}>
                <div className="relative overflow-hidden">
                  <div className="transition duration-500 group-hover:scale-[1.03]"><FoodImage food={f} className="aspect-[4/3]" /></div>
                  <span className="absolute top-2 left-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold">{f.category}</span>
                  <span className="absolute top-2 right-2 rounded-full bg-ink/80 text-white px-2 py-0.5 text-[11px] font-semibold flex items-center gap-1"><Icon name="clock" className="w-3 h-3" />{f.prep_time} min</span>
                  {!f.in_stock && <span className="absolute inset-0 bg-ink/55 flex items-center justify-center text-white font-semibold">{f.available ? "Sold out today" : "Unavailable"}</span>}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5"><VegDot veg={f.is_veg} /></span>
                    <h3 className="font-sans font-semibold leading-tight flex-1">{f.name}</h3>
                    <span className="num font-semibold">{rupee(f.price)}</span>
                  </div>
                  <p className="text-xs text-ink-500 mt-1.5 line-clamp-2 flex-1">{f.description}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className={`text-[11px] font-semibold ${!f.in_stock ? "text-before" : rem != null && rem <= 10 ? "text-before" : "text-after"}`}>
                      {!f.available ? "Not available" : rem == null ? "Available" : rem === 0 ? "Sold out" : `${rem} left today`}
                    </span>
                    {inCart ? (
                      <div className="flex items-center gap-1">
                        <button className="btn-outline !px-2 !py-1" onClick={() => cart.setQty(f.id, inCart.qty - 1)} aria-label="Decrease"><Icon name="minus" className="w-3 h-3" /></button>
                        <span className="num w-6 text-center text-sm font-semibold">{inCart.qty}</span>
                        <button className="btn-outline !px-2 !py-1" disabled={!f.in_stock || (rem != null && inCart.qty >= rem)} onClick={() => cart.setQty(f.id, inCart.qty + 1)} aria-label="Increase"><Icon name="plus" className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button className="btn-accent !px-3 !py-1.5 text-xs" disabled={!f.in_stock} onClick={() => { cart.add(f); toast(`${f.name} added to cart`); }}>
                        <Icon name="plus" className="w-3.5 h-3.5" />Add
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

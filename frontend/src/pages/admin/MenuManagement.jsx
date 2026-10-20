import { useEffect, useRef, useState } from "react";
import useFetch from "../../hooks/useFetch";
import { Foods, Uploads, errMsg } from "../../services/api";
import { PageHeader, Card, Kpi, Loading, ErrorBox, Empty, Modal, Field, Icon, VegDot, ConfirmButton, Spinner, rupee, toast } from "../../components/ui";
import { FoodImage } from "../../components/canteen";

const CATS = ["Breakfast", "Meals", "Snacks", "Beverages"];
const PERIODS = ["BREAKFAST", "LUNCH", "SNACKS", "ALL_DAY"];
const EMPTY = { name: "", description: "", category: "Meals", meal_period: "LUNCH", price: "", prep_cost: "", prep_time: 3, is_veg: true, available: true, image_url: "" };
const MAX_MB = 5;

export default function MenuManagement() {
  const { data, loading, error, reload } = useFetch(() => Foods.list(), []);
  const [form, setForm] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ALL");
  const [avail, setAvail] = useState("ALL");

  const foods = (data || []).filter((f) =>
    (!q || f.name.toLowerCase().includes(q.toLowerCase())) && (cat === "ALL" || f.category === cat) &&
    (avail === "ALL" || (avail === "ON" ? f.available : !f.available)));
  const toggle = async (f) => { await Foods.toggle(f.id); toast(`${f.name} is now ${f.available ? "unavailable" : "available"}`); reload(true); };
  const remove = async (f) => { try { await Foods.remove(f.id); toast(`${f.name} deleted`); reload(true); } catch (e) { toast(errMsg(e), "error"); } };
  const all = data || [];

  return (
    <>
      <PageHeader eyebrow="Administrator" title="Menu management" subtitle="Everything students see on the menu (names, photos, prices, availability) comes from here. Changes reach the student menu within seconds; past orders keep the price they were bought at.">
        <button className="btn-accent" onClick={() => setForm(EMPTY)}><Icon name="plus" />Add food</button>
      </PageHeader>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Dishes" value={all.length} icon="menu" />
        <Kpi label="Available" value={all.filter((f) => f.available).length} tone="good" icon="check" />
        <Kpi label="Unavailable" value={all.filter((f) => !f.available).length} tone="bad" icon="x" />
        <Kpi label="Without photo" value={all.filter((f) => !f.image_url).length} tone="accent" icon="box" />
      </div>

      <div className="card p-3 mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input className="input !pl-9" placeholder="Search dishes…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input !w-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="ALL">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <select className="input !w-auto" value={avail} onChange={(e) => setAvail(e.target.value)}><option value="ALL">Any availability</option><option value="ON">Available</option><option value="OFF">Unavailable</option></select>
      </div>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : foods.length === 0 ? <div className="card"><Empty title="No dishes match" icon="search" /></div> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {foods.map((f) => (
            <div key={f.id} className={`card overflow-hidden flex flex-col ${f.available ? "" : "opacity-70"}`}>
              <div className="relative">
                <FoodImage food={f} className="aspect-[16/10]" />
                <span className="absolute top-2 left-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold">{f.category}</span>
                {!f.available && <span className="absolute top-2 right-2 rounded-full bg-before text-white px-2 py-0.5 text-[11px] font-semibold">Hidden from students</span>}
              </div>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5"><VegDot veg={f.is_veg} /></span>
                  <div className="flex-1 min-w-0"><div className="font-semibold leading-tight truncate">{f.name}</div><div className="text-[11px] text-ink-500">{f.meal_period.replace("_", " ")}</div></div>
                  <span className="num text-lg font-semibold">{rupee(f.price)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <Mini label="Prep cost" value={rupee(f.prep_cost)} />
                  <Mini label="Margin" value={`${Math.round((1 - f.prep_cost / f.price) * 100)}%`} />
                  <Mini label="Serve time" value={`${f.prep_time} min`} />
                </div>
                <div className="flex items-center justify-between pt-2 mt-auto border-t border-paper-200">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <button onClick={() => toggle(f)} className={`relative h-6 w-11 rounded-full transition ${f.available ? "bg-after" : "bg-paper-300"}`} aria-label="Toggle availability">
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${f.available ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                    {f.available ? "Available" : "Unavailable"}
                  </label>
                  <div className="flex gap-1">
                    <button className="btn-outline !px-2.5 !py-1 text-xs" onClick={() => setForm({ ...EMPTY, ...f, image_url: f.image_url || "" })}><Icon name="edit" className="w-3.5 h-3.5" />Edit</button>
                    <ConfirmButton className="btn-ghost !px-2 !py-1 text-xs text-before" title={`Delete ${f.name}?`} message="The dish is removed from the menu. Past orders keep their own snapshot (name and price), so history and SMT analytics are not affected." confirmLabel="Delete" danger onConfirm={() => remove(f)}>
                      <Icon name="trash" className="w-3.5 h-3.5" />
                    </ConfirmButton>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {form && <FoodForm initial={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(true); }} />}
    </>
  );
}

const Mini = ({ label, value }) => (
  <div className="rounded-md bg-paper/70 px-2 py-1"><div className="text-ink-500">{label}</div><div className="num font-semibold text-ink">{value}</div></div>
);

/* ---------- add / edit dialog with image upload + preview ---------- */
function FoodForm({ initial, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef();
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const pick = (fl) => {
    if (!fl) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(fl.type)) return setErr("Choose a JPG, PNG, WEBP or GIF image");
    if (fl.size > MAX_MB * 1024 * 1024) return setErr(`Image must be smaller than ${MAX_MB} MB`);
    setErr(""); setFile(fl); setPreview(URL.createObjectURL(fl));
  };

  const save = async () => {
    if (!f.name.trim()) return setErr("Food name is required");
    if (!(+f.price > 0)) return setErr("Price must be greater than 0");
    if (+f.prep_cost > +f.price) return setErr("Preparation cost cannot exceed the price");
    setBusy(true); setErr("");
    try {
      const image_url = file ? await Uploads.foodImage(file) : f.image_url;   // 1. upload file → URL
      const body = { name: f.name, description: f.description, category: f.category, meal_period: f.meal_period, price: +f.price,
        prep_cost: +f.prep_cost || 0, prep_time: +f.prep_time || 3, is_veg: f.is_veg, available: f.available, image_url };
      if (f.id) await Foods.update(f.id, body); else await Foods.create(body);   // 2. save food with the URL in MongoDB
      toast(f.id ? `${f.name} updated` : `${f.name} added to the menu`);
      onSaved();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const shown = preview || f.image_url;
  return (
    <Modal open wide title={f.id ? `Edit ${initial.name}` : "Add food item"} onClose={onClose}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner className="w-4 h-4" />}{file ? "Upload & save" : "Save"}</button></>}>
      <div className="grid md:grid-cols-[240px_1fr] gap-5">
        <div>
          <span className="label">Food image</span>
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
            className={`rounded-xl overflow-hidden border-2 ${drag ? "border-saffron" : "border-paper-300"} relative`}>
            <FoodImage food={f} src={shown} className="aspect-[4/3]" />
            {preview && <span className="absolute top-2 left-2 rounded-full bg-saffron text-white px-2 py-0.5 text-[10px] font-bold">NEW — not saved yet</span>}
            {!preview && f.image_url && <span className="absolute top-2 left-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold">CURRENT</span>}
          </div>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <div className="flex gap-2 mt-2">
            <button type="button" className="btn-outline flex-1 !py-1.5 text-xs" onClick={() => input.current.click()}><Icon name="download" className="w-3.5 h-3.5 rotate-180" />{shown ? "Choose new image" : "Choose image"}</button>
            {shown && <button type="button" className="btn-ghost !py-1.5 text-xs text-before" onClick={() => { setFile(null); setPreview(""); set("image_url", ""); }}>Remove</button>}
          </div>
          <p className="text-[11px] text-ink-500 mt-1.5">JPG, PNG, WEBP or GIF up to {MAX_MB} MB. Drag & drop works too.</p>
          {file && <p className="text-[11px] text-ink-700 mt-1 truncate">Selected: {file.name} ({Math.round(file.size / 1024)} KB)</p>}
        </div>
        <div className="grid grid-cols-2 gap-4 content-start">
          <div className="col-span-2"><Field label="Food name"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field></div>
          <div className="col-span-2"><Field label="Description"><textarea className="input" rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
          <Field label="Category"><select className="input" value={f.category} onChange={(e) => set("category", e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Meal period"><select className="input" value={f.meal_period} onChange={(e) => set("meal_period", e.target.value)}>{PERIODS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Selling price (₹)" hint="Applies to new orders only"><input className="input num" type="number" min="1" value={f.price} onChange={(e) => set("price", e.target.value)} /></Field>
          <Field label="Preparation cost (₹)" hint="Used for waste-loss figures"><input className="input num" type="number" min="0" value={f.prep_cost} onChange={(e) => set("prep_cost", e.target.value)} /></Field>
          <Field label="Preparation time (min / portion)" hint="Feeds the waiting-time estimate"><input className="input num" type="number" min="0.5" step="0.5" value={f.prep_time} onChange={(e) => set("prep_time", e.target.value)} /></Field>
          <div className="flex flex-col justify-center gap-2 pt-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-saffron" checked={f.is_veg} onChange={(e) => set("is_veg", e.target.checked)} /><VegDot veg={f.is_veg} />{f.is_veg ? "Vegetarian" : "Non-vegetarian"}</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-saffron" checked={f.available} onChange={(e) => set("available", e.target.checked)} />Available to students</label>
          </div>
          {err && <div className="col-span-2 text-sm text-before flex items-center gap-2"><Icon name="alert" />{err}</div>}
        </div>
      </div>
    </Modal>
  );
}

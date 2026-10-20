import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Foods } from "../../services/api";
import { useCart } from "../../context/CartContext";
import { PageHeader, Card, Empty, Icon, VegDot, rupee, ConfirmButton, toast } from "../../components/ui";
import { FoodImage } from "../../components/canteen";

export default function Cart() {
  const cart = useCart();
  const nav = useNavigate();
  // prices/names/photos always come from the live menu (MongoDB), not from what was saved in the browser
  useEffect(() => {
    Foods.list().then((f) => cart.sync(f) && toast("Cart updated with the latest menu prices")).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <PageHeader eyebrow="Student" title="Your cart" subtitle="Adjust quantities, then continue to checkout." />
      {cart.items.length === 0 ? (
        <div className="card"><Empty title="Your cart is empty" text="Add a few dishes from the menu." icon="cart"><Link className="btn-accent" to="/student/menu">Browse menu</Link></Empty></div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2" bodyClass="divide-y divide-paper-200">
            {cart.items.map((i) => (
              <div key={i.id} className="flex items-center gap-4 p-4">
                <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0"><FoodImage food={i} className="h-16" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><VegDot veg={i.is_veg} /><span className="font-semibold truncate">{i.name}</span></div>
                  <div className="text-xs text-ink-500 num mt-0.5">{rupee(i.price)} each</div>
                </div>
                <div className="flex items-center gap-1">
                  <button className="btn-outline !px-2 !py-1" onClick={() => cart.setQty(i.id, i.qty - 1)}><Icon name="minus" className="w-3 h-3" /></button>
                  <span className="num w-7 text-center font-semibold">{i.qty}</span>
                  <button className="btn-outline !px-2 !py-1" onClick={() => cart.setQty(i.id, i.qty + 1)}><Icon name="plus" className="w-3 h-3" /></button>
                </div>
                <div className="num w-20 text-right font-semibold">{rupee(i.qty * i.price)}</div>
                <button className="btn-ghost !p-2 text-ink-500 hover:text-before" onClick={() => cart.remove(i.id)} aria-label="Remove"><Icon name="trash" /></button>
              </div>
            ))}
          </Card>
          <Card title="Summary">
            <div className="flex justify-between text-sm py-1"><span className="text-ink-500">Items</span><span className="num">{cart.count}</span></div>
            <div className="flex justify-between text-lg font-semibold py-2 border-t border-paper-200 mt-2"><span>Total</span><span className="num">{rupee(cart.total)}</span></div>
            <p className="text-xs text-ink-500">Birthday, subscription and reward-point discounts are applied at checkout.</p>
            <button className="btn-accent w-full mt-4" onClick={() => nav("/student/checkout")}>Proceed to checkout</button>
            <ConfirmButton className="btn-ghost w-full mt-2 text-ink-500" title="Clear cart?" message="This removes every item from your cart." confirmLabel="Clear" danger onConfirm={cart.clear}>Clear cart</ConfirmButton>
          </Card>
        </div>
      )}
    </>
  );
}

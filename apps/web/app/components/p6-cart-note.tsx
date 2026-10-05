"use client";

import { useEffect, useState } from "react";
import { p6ItemCount, P6_CART_EVENT } from "../../lib/p6-cart";

export function P6CartNote() {
  const [trip, setTrip] = useState(0);
  const [direct, setDirect] = useState(0);

  useEffect(() => {
    const read = () => {
      setTrip(p6ItemCount("CLUSTER"));
      setDirect(p6ItemCount("STORE"));
    };
    read();
    window.addEventListener(P6_CART_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(P6_CART_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  if (trip === 0 && direct === 0) return null;
  return (
    <p className="stat" style={{ margin: "0 0 12px" }}>
      Giỏ chợ: {trip} món · Giỏ cửa hàng: {direct} món
    </p>
  );
}

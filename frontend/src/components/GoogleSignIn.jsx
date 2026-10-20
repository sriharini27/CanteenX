import { useEffect, useRef, useState } from "react";
import { Auth, errMsg } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "./ui";

const GIS_SRC = "https://accounts.google.com/gsi/client";

function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let s = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (!s) {
      s = Object.assign(document.createElement("script"), { src: GIS_SRC, async: true, defer: true });
      document.head.appendChild(s);
    }
    s.addEventListener("load", resolve);
    s.addEventListener("error", () => reject(new Error("Could not load Google sign-in (check your internet connection)")));
  });
}

/**
 * Official Google Identity Services button.
 * Flow: Google returns an ID token (credential) → POST /api/auth/google → Flask verifies it with Google's
 * public keys → finds / links / creates a STUDENT account → returns the app's JWT.
 * The client ID is read from the backend (GOOGLE_CLIENT_ID in backend/.env) so it is configured in one place.
 */
export default function GoogleSignIn({ onError }) {
  const { googleLogin } = useAuth();
  const box = useRef(null);
  const [state, setState] = useState("loading"); // loading | ready | disabled | error | busy
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { google_client_id } = await Auth.config();
        if (!google_client_id) { alive && setState("disabled"); return; }
        await loadGis();
        if (!alive || !box.current) return;
        window.google.accounts.id.initialize({
          client_id: google_client_id,
          callback: async ({ credential }) => {
            setState("busy");
            try { await googleLogin(credential); }        // AuthContext stores the JWT; router redirects to /student/dashboard
            catch (e) { setState("ready"); onError?.(errMsg(e)); }
          },
          ux_mode: "popup",
        });
        window.google.accounts.id.renderButton(box.current, {
          theme: "outline", size: "large", text: "continue_with", shape: "rectangular",
          width: Math.min(384, box.current.offsetWidth || 384), logo_alignment: "center",
        });
        setState("ready");
      } catch (e) {
        if (alive) { setState("error"); setMsg(e.message); }
      }
    })();
    return () => { alive = false; };
  }, [googleLogin, onError]);

  return (
    <div>
      <div className={`flex justify-center ${state === "ready" || state === "busy" ? "" : "hidden"}`}><div ref={box} className="w-full flex justify-center" /></div>
      {state === "loading" && <div className="h-10 flex items-center justify-center text-sm text-ink-500 gap-2"><Spinner className="w-4 h-4" />Loading Google sign-in…</div>}
      {state === "busy" && <div className="text-xs text-ink-500 text-center mt-2">Signing you in with Google…</div>}
      {state === "disabled" && (
        <div className="rounded-lg border border-dashed border-paper-300 px-3 py-2.5 text-xs text-ink-500 text-center">
          Google sign-in isn't set up yet — add <code className="num">GOOGLE_CLIENT_ID</code> to <code className="num">backend/.env</code> (see README).
        </div>
      )}
      {state === "error" && <div className="text-xs text-before text-center">{msg}</div>}
    </div>
  );
}

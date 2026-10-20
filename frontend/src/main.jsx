import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { Toaster } from "./components/ui";
import "./index.css";

// Shows a readable error (and a reset button) instead of a blank page if anything crashes while rendering.
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  reset = () => {
    Object.keys(localStorage).filter((k) => k.startsWith("canteenx.")).forEach((k) => localStorage.removeItem(k));
    location.href = "/login";
  };
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ maxWidth: 560, margin: "15vh auto", padding: 24, fontFamily: "system-ui" }}>
        <h2>Something went wrong</h2>
        <pre style={{ whiteSpace: "pre-wrap", background: "#fff", padding: 12, borderRadius: 8, fontSize: 13 }}>{String(this.state.error?.message || this.state.error)}</pre>
        <button onClick={this.reset} style={{ padding: "8px 16px", background: "#151A21", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer" }}>Reset app &amp; go to login</button>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <App />
          <Toaster />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

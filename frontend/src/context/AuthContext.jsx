import { createContext, useContext, useState } from "react";
import { Auth } from "../services/api";

const AuthCtx = createContext(null);
export const HOME = { STUDENT: "/student/dashboard", STAFF: "/staff/dashboard", ADMIN: "/admin/dashboard" };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem("canteenx.user"));
      return u && HOME[u.role] && localStorage.getItem("canteenx.token") ? u : null;   // ignore stale / foreign data
    } catch { return null; }
  });

  const save = ({ token, user }) => {
    localStorage.setItem("canteenx.token", token);
    localStorage.setItem("canteenx.user", JSON.stringify(user));
    setUser(user);
    return user;
  };
  const login = async (username, password) => save(await Auth.login({ username, password }));
  const register = async (body) => save(await Auth.register(body));
  const googleLogin = async (credential) => save(await Auth.google(credential));
  const logout = () => {
    localStorage.removeItem("canteenx.token");
    localStorage.removeItem("canteenx.user");
    localStorage.removeItem("canteenx.cart");
    setUser(null);
  };
  return <AuthCtx.Provider value={{ user, login, register, googleLogin, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

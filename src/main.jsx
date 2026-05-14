import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { AppDataProvider } from "./data/AppDataContext";
import { setupHotReloadIndicator } from "./lib/dev";
import "./styles.css";

setupHotReloadIndicator();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <AppDataProvider>
          <App />
        </AppDataProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);

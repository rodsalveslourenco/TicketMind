import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { AppDataProvider } from "./data/AppDataContext";
import { setupHotReloadIndicator } from "./lib/dev";
import { UiPreferencesProvider } from "./ui/UiPreferencesContext";
import "./styles.css";

setupHotReloadIndicator();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <UiPreferencesProvider>
          <AppDataProvider>
            <App />
          </AppDataProvider>
        </UiPreferencesProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);

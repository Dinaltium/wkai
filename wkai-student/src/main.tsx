import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { initTheme } from "./lib/theme";
import { SettingsFab } from "./components/shared/SettingsFab";
import "./index.css";

// Apply persisted theme (mode + accent) before first paint to avoid a flash.
initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <>
    <RouterProvider router={router} />
    <SettingsFab />
  </>
);

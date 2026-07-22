import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./components/shared/AppShell";
import { SetupPage } from "./pages/SetupPage";
import { SessionPage } from "./pages/SessionPage";
import { SettingsPage } from "./pages/SettingsPage";
import { NativeCaptureTest } from "./pages/NativeCaptureTest";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <SetupPage /> },
      { path: "session", element: <SessionPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "native-capture-test", element: <NativeCaptureTest /> },
    ],
  },
]);

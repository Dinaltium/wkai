import { createBrowserRouter } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { DownloadPage } from "./pages/DownloadPage";
import { JoinPage }    from "./pages/JoinPage";
import { RoomPage }    from "./pages/RoomPage";
import { NotFound }    from "./pages/NotFound";

export const router = createBrowserRouter([
  { path: "/",              element: <LandingPage /> },
  { path: "/download",      element: <DownloadPage /> },
  { path: "/join",          element: <JoinPage /> },
  { path: "/room/:code",    element: <RoomPage /> },
  { path: "*",              element: <NotFound /> },
]);

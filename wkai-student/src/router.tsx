import { createBrowserRouter, Outlet } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { DownloadPage } from "./pages/DownloadPage";
import { JoinPage }    from "./pages/JoinPage";
import { RoomPage }    from "./pages/RoomPage";
import { ErrorPage }   from "./pages/ErrorPage";

// Everything hangs off one pathless layout route so a render error anywhere in
// the app is caught by a single errorElement instead of blanking the page.
export const router = createBrowserRouter([
  {
    element: <Outlet />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/",           element: <LandingPage /> },
      { path: "/download",   element: <DownloadPage /> },
      { path: "/join",       element: <JoinPage /> },
      { path: "/room/:code", element: <RoomPage /> },
      { path: "*",           element: <ErrorPage notFound /> },
    ],
  },
]);

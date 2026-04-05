import { createBrowserRouter } from "react-router-dom";
import { JoinPage }    from "./pages/JoinPage";
import { RoomPage }    from "./pages/RoomPage";
import { NotFound }    from "./pages/NotFound";

export const router = createBrowserRouter([
  { path: "/",              element: <JoinPage /> },
  { path: "/room/:code",    element: <RoomPage /> },
  { path: "*",              element: <NotFound /> },
]);

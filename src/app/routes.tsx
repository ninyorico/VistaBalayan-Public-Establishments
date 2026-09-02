import { createBrowserRouter, Navigate } from "react-router";
import TourismHome from "./pages/public/TourismHome";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: TourismHome,
  },
  {
    path: "/explore",
    Component: TourismHome,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);

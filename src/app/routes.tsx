import { createBrowserRouter, Navigate } from "react-router";
import TourismHome from "./pages/public/TourismHome";
import LegalPage from "./pages/LegalPages";

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
    path: "/privacy-policy",
    element: <LegalPage document="privacy" />,
  },
  {
    path: "/terms-and-conditions",
    element: <LegalPage document="terms" />,
  },
  {
    path: "/cookie-policy",
    element: <LegalPage document="cookies" />,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);

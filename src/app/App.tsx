import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "sonner";
import CookieConsent from "./components/CookieConsent";

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <CookieConsent />
      <Toaster position="top-right" richColors />
    </>
  );
}

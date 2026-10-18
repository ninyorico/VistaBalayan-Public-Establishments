const CONSENT_KEY = "vistabalayan_cookie_consent_v1";

type StoredConsent = {
  preferences?: boolean;
  analytics?: boolean;
};

export const hasPreferencesConsent = () => {
  if (typeof window === "undefined") return false;
  try {
    const stored = JSON.parse(window.localStorage.getItem(CONSENT_KEY) || "null") as StoredConsent | null;
    return stored?.preferences === true;
  } catch {
    return false;
  }
};

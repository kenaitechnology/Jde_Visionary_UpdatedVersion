export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  // Allow forcing dev login in production for testing.
  const allowDevLogin = import.meta.env.VITE_ALLOW_DEV_LOGIN === "true";

  // Use local dev login when no external OAuth portal is configured,
  // or when explicitly allowed.
  if (!oauthPortalUrl || oauthPortalUrl === window.location.origin || allowDevLogin) {
    return "/api/dev/login";
  }

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

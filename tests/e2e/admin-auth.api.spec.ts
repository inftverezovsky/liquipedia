import { expect, test } from "@playwright/test";

test("admin auth protects settings endpoints and creates a usable session cookie", async ({ request }) => {
  const unauthenticated = await request.get("/api/settings/global");
  expect(unauthenticated.status()).toBe(401);

  const publicCacheClear = await request.post("/api/settings/clear-search-cache");
  await expect(publicCacheClear).toBeOK();
  await expect(await publicCacheClear.json()).toMatchObject({ ok: true });

  const badLogin = await request.post("/api/admin-auth/login", {
    data: { password: "wrong-password" },
  });
  expect(badLogin.status()).toBe(401);

  const login = await request.post("/api/admin-auth/login", {
    data: { password: "63016" },
  });
  expect(login.status()).toBe(200);

  const setCookie = login.headers()["set-cookie"];
  expect(setCookie).toContain("tcyber_admin_session=");

  const cookie = setCookie.split(";")[0];
  const session = await request.get("/api/admin-auth/session", {
    headers: { cookie },
  });
  await expect(session).toBeOK();
  await expect(await session.json()).toMatchObject({ authenticated: true });

  const settings = await request.get("/api/settings/global", {
    headers: { cookie },
  });
  await expect(settings).toBeOK();
});

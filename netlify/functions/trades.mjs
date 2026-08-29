import { getStore } from "@netlify/blobs";

const store = getStore("two-three-trades");

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

function validTrade(t) {
  return (
    t &&
    typeof t.id === "string" &&
    typeof t.date === "string" &&
    typeof t.ticker === "string" &&
    ["buy", "add", "trim", "sell"].includes(t.action) &&
    Number.isFinite(Number(t.size)) &&
    Number.isFinite(Number(t.price)) &&
    typeof t.currency === "string" &&
    typeof t.thesis === "string"
  );
}

function isAdmin(request) {
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error("ADMIN_PASSWORD is not configured.");
    return false;
  }

  const auth = request.headers.get("authorization");

  if (!auth || !auth.startsWith("Bearer ")) {
    return false;
  }

  const suppliedPassword = auth.slice(7);

  return suppliedPassword === password;
}

export default async (request) => {
  try {
    /*
     * Authentication check.
     *
     * GET remains public.
     * If ?action=auth is supplied, verify the password
     * without exposing the password itself.
     */
    if (request.method === "GET") {
      const url = new URL(request.url);

      if (url.searchParams.get("action") === "auth") {
        if (!isAdmin(request)) {
          return json({ authenticated: false }, 401);
        }

        return json({ authenticated: true });
      }

      /*
       * Public journal.
       */
      const { blobs } = await store.list();
      const trades = [];

      for (const blob of blobs) {
        const trade = await store.get(blob.key, { type: "json" });

        if (trade && validTrade(trade)) {
          trades.push(trade);
        }
      }

      return json(trades);
    }

    /*
     * POST is admin-only.
     */
    if (request.method === "POST") {
      if (!isAdmin(request)) {
        return json({ error: "Unauthorised." }, 401);
      }

      const trade = await request.json();

      if (!validTrade(trade)) {
        return json({ error: "Invalid trade data." }, 400);
      }

      await store.setJSON(trade.id, trade);

      return json(trade, 201);
    }

    /*
     * DELETE is admin-only.
     */
    if (request.method === "DELETE") {
      if (!isAdmin(request)) {
        return json({ error: "Unauthorised." }, 401);
      }

      const url = new URL(request.url);
      const id = url.searchParams.get("id");

      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        return json({ error: "Missing or invalid trade id." }, 400);
      }

      await store.delete(id);

      return json({ ok: true });
    }

    return json({ error: "Method not allowed." }, 405);

  } catch (error) {
    console.error("Trades function error:", error);

    return json(
      { error: "Unable to access trade storage." },
      500
    );
  }
};

import { currentUser, db } from "@/server/app";
import { log } from "@/server/log";
import { payeeHistory } from "@/server/services/entries";

// What the signed-in user paid a payee for before, and how those lines were
// tagged: /api/payee-history?payee=Madan%20Stores&direction=out
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "Sign in again to see suggestions." }, { status: 401, headers: NO_STORE });

  const params = new URL(request.url).searchParams;
  const payee = (params.get("payee") ?? "").slice(0, 200);
  const direction = params.get("direction");
  try {
    const data = await payeeHistory({ db: db(), userId: user.id, tz: user.timezone }, payee, {
      direction: direction === "in" || direction === "out" ? direction : undefined,
    });
    return Response.json({ ok: true, data }, { headers: NO_STORE });
  } catch (error) {
    log.error("payee_history.failed", { userId: user.id, error });
    return Response.json({ ok: false, error: "Couldn't look up past payments." }, { status: 500, headers: NO_STORE });
  }
}

const NO_STORE = { "Cache-Control": "private, no-store" };

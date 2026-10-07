import { authedJson } from "./subscription";

/**
 * Permanently delete the signed-in account (POST /api/me/delete). The
 * backend removes the profile and everything personal; canvas orders are
 * kept as anonymous financial records. Throws with the server's message when
 * deletion is blocked (e.g. a print order still being prepared).
 */
export async function deleteAccount(): Promise<void> {
  await authedJson<{ deleted: boolean }>("/api/me/delete", { method: "POST" });
}

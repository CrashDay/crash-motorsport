import { redirect } from "next/navigation";
import { isAdminAuthConfigured, isAdminAuthenticated } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function getErrorMessage(error) {
  if (error === "invalid") return "That password did not match.";
  if (error === "not-configured") return "Admin authentication is not configured yet.";
  return "";
}

function getSafeNext(value) {
  const next = String(value || "").trim();
  if (!next.startsWith("/admin") || next.startsWith("/admin/login")) return "/admin/maps";
  return next;
}

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const next = getSafeNext(params?.next);
  if (await isAdminAuthenticated()) redirect(next);

  const errorMessage = getErrorMessage(String(params?.error || ""));
  const isConfigured = isAdminAuthConfigured();

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(900px 600px at 12% 8%, rgba(54,109,255,0.18), transparent 55%), linear-gradient(160deg, #04070e, #091322 50%, #05080f)",
        color: "#eef6ff",
        fontFamily: "system-ui",
        padding: 18,
      }}
    >
      <form
        action="/api/admin/login"
        method="post"
        style={{
          width: "min(420px, 100%)",
          background: "linear-gradient(145deg, rgba(9,18,32,0.96), rgba(8,14,26,0.9))",
          border: "1px solid rgba(137, 179, 255, 0.35)",
          borderRadius: 8,
          boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
          padding: 18,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>Admin Sign In</h1>
        <p style={{ margin: "8px 0 16px", color: "#b8c4d8", fontSize: 13, lineHeight: 1.45 }}>
          Enter the admin password to manage maps and track tools.
        </p>
        <input type="hidden" name="next" value={next} />
        <label style={{ display: "block", color: "#dfe8ff", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
          Password
        </label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          disabled={!isConfigured}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#101827",
            border: "1px solid #2a3a57",
            color: "#fff",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 14,
          }}
        />
        {errorMessage ? (
          <div style={{ marginTop: 10, color: "#ffb0b0", fontSize: 12, lineHeight: 1.4 }}>{errorMessage}</div>
        ) : null}
        {!isConfigured ? (
          <div style={{ marginTop: 10, color: "#ffd1a6", fontSize: 12, lineHeight: 1.4 }}>
            Set ADMIN_PASSWORD before using the admin page.
          </div>
        ) : null}
        <button
          type="submit"
          disabled={!isConfigured}
          style={{
            width: "100%",
            marginTop: 14,
            background: "linear-gradient(150deg, #ff6a2e, #ff3d00)",
            border: "1px solid #ffb18f",
            color: "#fff",
            padding: "10px 12px",
            borderRadius: 8,
            cursor: isConfigured ? "pointer" : "default",
            opacity: isConfigured ? 1 : 0.62,
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 0.25,
          }}
        >
          Sign In
        </button>
      </form>
    </main>
  );
}

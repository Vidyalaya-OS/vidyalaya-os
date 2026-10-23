"use client";

// Used only when the root layout itself fails, so it brings its own <html>
// and plain styles instead of the app's.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f4f6fb", color: "#111827" }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
          <p style={{ color: "#556070" }}>The app could not start. Check your connection and try again.</p>
          <button onClick={retry} style={{ marginTop: 16, padding: "10px 18px", borderRadius: 12, border: 0, background: "#2f5bea", color: "white", fontSize: 15, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

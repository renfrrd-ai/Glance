/*
 * A stand-in for an app area that has not been rebuilt yet.
 *
 * The control center frames these by path, so each one has to answer with a
 * real page — an empty route would leave a broken frame in the rail rather
 * than an obvious gap.
 */
export function Placeholder({ title, lede }: { title: string; lede: string }) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "48px 16px",
        background: "#f1ebdd",
        color: "#1e2b40",
        fontFamily: "var(--font-saans), system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>{title}</h1>
        <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, opacity: 0.72 }}>{lede}</p>
        <p style={{ marginTop: 18, fontSize: 13, opacity: 0.5 }}>
          Not rebuilt yet — the control center frames this page at its own path.
        </p>
      </div>
    </main>
  );
}

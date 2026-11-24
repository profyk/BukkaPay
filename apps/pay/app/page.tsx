export default function Home() {
  return (
    <div className="card hero">
      <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Secure BukkaPay payments</h1>
      <p className="muted">Open the payment link you were sent to pay, claim money, or view an invoice.</p>
      <a className="btn primary" href="https://bukkapay.com" rel="noopener">About BukkaPay</a>
      <a className="btn ghost" href="https://app.bukkapay.com" rel="noopener">Open my BukkaPay</a>
    </div>
  );
}

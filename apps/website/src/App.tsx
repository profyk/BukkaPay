export default function App() {
  return (
    <main className="shell landing-shell">
      <section className="hero">
        <span className="eyebrow">BukkaPay</span>
        <h1>Trusted money movement for Africa and global commerce.</h1>
        <p>
          Secure wallets, merchant onboarding, and transfers built for speed, compliance,
          and trust.
        </p>
        <div className="actions">
          <button>Open app</button>
          <button className="secondary">Become a merchant</button>
        </div>
      </section>

      <section className="metrics">
        <div>
          <strong>USD</strong>
          <span>Customer wallet</span>
        </div>
        <div>
          <strong>ZAR</strong>
          <span>Local rails</span>
        </div>
        <div>
          <strong>BWP</strong>
          <span>Regional support</span>
        </div>
      </section>
    </main>
  )
}

export default function App() {
  return (
    <main className="merchant-shell">
      <aside className="sidebar">
        <div className="brand">BukkaPay Merchant</div>
        <nav>
          <a href="#">Overview</a>
          <a href="#">Payouts</a>
          <a href="#">Transactions</a>
          <a href="#">Disputes</a>
          <a href="#">Settings</a>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <h1>Merchant dashboard</h1>
          <button>New payout</button>
        </header>

        <div className="cards">
          <article>
            <span>Available balance</span>
            <strong>$84,260.00</strong>
          </article>
          <article>
            <span>Pending settlements</span>
            <strong>$12,410.00</strong>
          </article>
          <article>
            <span>Dispute rate</span>
            <strong>0.32%</strong>
          </article>
        </div>
      </section>
    </main>
  )
}

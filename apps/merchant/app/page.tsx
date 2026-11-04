import './globals.css';

export default function MerchantHomePage() {
  return (
    <main className="merchant-shell">
      <aside className="merchant-sidebar">
        <div className="brand">BukkaPay Merchant</div>
        <nav>
          <a href="#">Overview</a>
          <a href="#">Onboarding</a>
          <a href="#">Payouts</a>
          <a href="#">Transactions</a>
          <a href="#">Settings</a>
        </nav>
      </aside>

      <section className="merchant-content">
        <header className="merchant-header">
          <div>
            <p className="eyebrow">Merchant dashboard</p>
            <h1>Operations overview</h1>
          </div>
          <button className="primary-button">New payout</button>
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

        <section className="panel">
          <h2>Merchant onboarding</h2>
          <div className="onboarding-flow">
            <div className="check"><span>1</span><p>Business profile</p></div>
            <div className="check"><span>2</span><p>Password and PIN confirmation</p></div>
            <div className="check"><span>3</span><p>OTP verification</p></div>
          </div>
        </section>
      </section>
    </main>
  );
}

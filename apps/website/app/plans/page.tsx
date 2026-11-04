export default function PlansPage() {
  return (
    <main className="website-shell">
      <h1>Pricing plans</h1>
      <div className="plan-grid">
        <article className="plan-card">
          <h3>Starter</h3>
          <div className="price">$0</div>
          <p>For individuals and early wallet access.</p>
        </article>
        <article className="plan-card">
          <h3>Business</h3>
          <div className="price">$29</div>
          <p>For merchants and growing startups.</p>
        </article>
        <article className="plan-card">
          <h3>Enterprise</h3>
          <div className="price">Custom</div>
          <p>For high-volume treasury and compliance operations.</p>
        </article>
      </div>
    </main>
  );
}

import './globals.css';

const plans = [
  { name: 'Starter', price: '$0', description: 'For customers and personal wallets.' },
  { name: 'Business', price: '$29', description: 'For SMEs and online sellers.' },
  { name: 'Enterprise', price: 'Custom', description: 'For large-volume treasury and risk teams.' },
];

const legalLinks = [
  { label: 'Privacy Policy', href: '/legal/privacy-policy' },
  { label: 'Terms of Service', href: '/legal/terms' },
  { label: 'Cookie Policy', href: '/legal/cookies' },
  { label: 'AML Risk', href: '/legal/aml-risk' },
];

export default function WebsiteHomePage() {
  return (
    <main className="website-shell">
      <section className="hero">
        <div className="eyebrow">BukkaPay</div>
        <h1>Trusted money movement for Africa and global commerce.</h1>
        <p>
          Secure wallets, merchant onboarding, and transfers built for speed, compliance,
          and trust.
        </p>
        <div className="actions">
          <a href="/" className="primary">Open app</a>
          <a href="/plans" className="secondary">View plans</a>
        </div>
      </section>

      <section className="metrics">
        <div><strong>USD</strong><span>Customer wallet</span></div>
        <div><strong>ZAR</strong><span>Local rails</span></div>
        <div><strong>BWP</strong><span>Regional support</span></div>
      </section>

      <section className="plans">
        <h2>Pricing plans</h2>
        <div className="plan-grid">
          {plans.map((plan) => (
            <article key={plan.name} className="plan-card">
              <h3>{plan.name}</h3>
              <div className="price">{plan.price}</div>
              <p>{plan.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="legal-links">
        <h2>Legal & compliance</h2>
        <ul>
          {legalLinks.map((link) => (
            <li key={link.href}><a href={link.href}>{link.label}</a></li>
          ))}
        </ul>
      </section>
    </main>
  );
}

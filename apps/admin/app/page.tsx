import './globals.css';

const staticSections = [
  {
    title: 'Website controls',
    items: [
      'Hero copy and product messaging',
      'Legal docs and policy management',
      'Pricing and plan configuration',
      'Merchant onboarding and compliance state',
    ],
  },
  {
    title: 'Legal document library',
    items: [
      'Privacy Policy',
      'Terms of Service',
      'Cookie Policy',
      'Risk and AML disclosures',
    ],
  },
  {
    title: 'Plans and pricing',
    items: [
      'Starter',
      'Business',
      'Enterprise',
      'Merchant growth',
    ],
  },
];

export default function AdminHomePage() {
  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand">BukkaPay Admin</div>
        <nav>
          <a href="#">Dashboard</a>
          <a href="#">Website</a>
          <a href="#">Legal</a>
          <a href="#">Plans</a>
          <a href="#">Merchants</a>
        </nav>
      </aside>

      <section className="admin-content">
        <header className="admin-header">
          <div>
            <p className="eyebrow">Operations centre</p>
            <h1>Website and commerce configuration</h1>
          </div>
          <button className="primary-button">Publish changes</button>
        </header>

        <div className="stats-grid">
          <article><span>Live site pages</span><strong>18</strong></article>
          <article><span>Legal docs</span><strong>8</strong></article>
          <article><span>Pricing plans</span><strong>4</strong></article>
          <article><span>Merchant applicants</span><strong>136</strong></article>
        </div>

        <div className="section-grid">
          {staticSections.map((section) => (
            <section key={section.title} className="panel">
              <h2>{section.title}</h2>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}

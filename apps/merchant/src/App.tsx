import { useState } from 'react'

type TabName = 'overview' | 'onboarding' | 'payouts' | 'transactions'

type FormState = {
  businessName: string
  representative: string
  email: string
  password: string
  pin: string
}

const initialForm: FormState = {
  businessName: '',
  representative: '',
  email: '',
  password: '',
  pin: '',
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabName>('onboarding')
  const [form, setForm] = useState<FormState>(initialForm)
  const [otp, setOtp] = useState('')
  const [otpRequested, setOtpRequested] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const setField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const readyForOtp =
    form.businessName.trim() &&
    form.representative.trim() &&
    form.email.trim() &&
    form.password.trim() &&
    form.pin.trim()

  const requestOtp = () => {
    if (!readyForOtp) return
    setOtpRequested(true)
    setSubmitted(false)
  }

  const confirmOnboarding = () => {
    if (!otpRequested || !otp.trim()) return
    setSubmitted(true)
  }

  const navItems: Array<{ key: TabName; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'onboarding', label: 'Onboarding' },
    { key: 'payouts', label: 'Payouts' },
    { key: 'transactions', label: 'Transactions' },
  ]

  return (
    <main className="merchant-shell">
      <aside className="sidebar">
        <div className="brand">BukkaPay Merchant</div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={activeTab === item.key ? 'nav-link active' : 'nav-link'}
              onClick={() => setActiveTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="content">
        {activeTab === 'overview' && (
          <>
            <header className="topbar">
              <h1>Merchant dashboard</h1>
              <button type="button">New payout</button>
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
          </>
        )}

        {activeTab === 'onboarding' && (
          <div className="onboarding-panel">
            <header className="topbar">
              <div>
                <p className="eyebrow">Merchant onboarding</p>
                <h1>Set up your business</h1>
              </div>
              <button type="button" className="secondary-button">Save draft</button>
            </header>

            <div className="onboarding-card">
              <div className="field-grid">
                <label>
                  <span>Business name</span>
                  <input value={form.businessName} onChange={(e) => setField('businessName', e.target.value)} placeholder="BukkaPay Foods" />
                </label>

                <label>
                  <span>Account owner</span>
                  <input value={form.representative} onChange={(e) => setField('representative', e.target.value)} placeholder="Jane Doe" />
                </label>

                <label>
                  <span>Business email</span>
                  <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="ops@business.com" />
                </label>

                <label>
                  <span>Security password</span>
                  <input type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} placeholder="Create a password" />
                </label>

                <label>
                  <span>PIN confirmation</span>
                  <input type="password" value={form.pin} onChange={(e) => setField('pin', e.target.value)} placeholder="Enter a 4–6 digit PIN" />
                </label>
              </div>

              <div className="confirmation-block">
                <p>Enter your password or PIN to continue. The OTP screen appears only after this confirmation step.</p>
                {!otpRequested ? (
                  <button type="button" onClick={requestOtp} disabled={!readyForOtp}>Continue to OTP</button>
                ) : (
                  <>
                    <label className="otp-field">
                      <span>OTP verification</span>
                      <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" />
                    </label>
                    <button type="button" onClick={confirmOnboarding} disabled={!otp.trim()}>Verify and submit</button>
                  </>
                )}
              </div>

              {submitted && (
                <div className="success-state">
                  <strong>Merchant account submitted</strong>
                  <span>Your onboarding has been accepted and is awaiting KYC review.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'payouts' && (
          <div className="empty-state">
            <h2>Payouts</h2>
            <p>Settlement schedules and payouts will appear here.</p>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="empty-state">
            <h2>Transactions</h2>
            <p>Incoming and outgoing merchant transactions will appear here.</p>
          </div>
        )}
      </section>
    </main>
  )
}

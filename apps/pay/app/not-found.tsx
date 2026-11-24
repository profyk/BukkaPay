export default function NotFound() {
  return (
    <div className="card hero">
      <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>This link doesn't work</h1>
      <p className="muted">Check that you copied the whole link, or ask the person who sent it for a new one.</p>
      <a className="btn ghost" href="https://bukkapay.com" rel="noopener">Go to BukkaPay</a>
    </div>
  );
}

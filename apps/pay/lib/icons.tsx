/* Small inline icons: no icon font or third-party script needed. */
type P = { size?: number };
const base = (size = 18) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

export const Lock = ({ size }: P) => <svg {...base(size)}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
export const Shield = ({ size }: P) => <svg {...base(size)}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>;
export const Bolt = ({ size }: P) => <svg {...base(size)}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>;
export const Bank = ({ size }: P) => <svg {...base(size)}><path d="M3 10l9-6 9 6" /><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18" /></svg>;
export const Wallet = ({ size }: P) => <svg {...base(size)}><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M16 13h2M3 10h18" /></svg>;
export const Check = ({ size }: P) => <svg {...base(size)} strokeWidth={3}><path d="M5 12l5 5 9-10" /></svg>;
export const Badge = ({ size }: P) => <svg {...base(size)}><circle cx="12" cy="9" r="5" /><path d="M8.5 13.5L7 21l5-3 5 3-1.5-7.5" /></svg>;
export const Doc = ({ size }: P) => <svg {...base(size)}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>;

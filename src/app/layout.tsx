import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";

export const metadata: Metadata = {
  title: "AI Brand & Market Inspiration Pool",
  description: "Internal inspiration pool for AI brand and market social cases"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const navItems = [
    { href: "/", label: "Dashboard" },
    { href: "/collect", label: "Live Collect" },
    { href: "/library", label: "Local Inspiration Library" },
    { href: "/ask", label: "Search / Ask" }
  ];

  return (
    <html lang="zh-CN">
      <body>
        <div className="appFrame">
          <aside className="sidebar">
            <Link className="brandMark" href="/">
              <span>AI</span>
              <strong>Brand Pool</strong>
            </Link>
            <nav className="mainNav" aria-label="Primary navigation">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <div className="contentFrame">{children}</div>
        </div>
      </body>
    </html>
  );
}

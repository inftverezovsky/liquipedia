import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "liquipedia",
  description: "Manual Liquipedia Dota 2 tournament loader"
};

const navItems = [
  { href: "/", label: "Главная" },
  { href: "/dota2", label: "Dota 2" },
  { href: "/history", label: "История загрузок" },
  { href: "/settings", label: "Настройки API" }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
              <Link href="/" className="text-xl font-bold tracking-tight text-slate-950">
                liquipedia
              </Link>
              <nav className="flex flex-wrap gap-2 text-sm">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}

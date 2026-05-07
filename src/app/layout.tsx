import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "TCyber",
  description: "Manual TCyber tournament loader",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-slate-100 text-slate-900 selection:bg-indigo-100">
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
                  T
                </div>
                <span className="text-xl font-bold tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
                  TCyber
                </span>
              </Link>
              
              <Navbar />

              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.5)]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stable</span>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10 animate-in">
            {children}
          </main>
          
          <footer className="border-t border-slate-200 bg-white py-8 text-center text-sm font-medium text-slate-400">
            &copy; {new Date().getFullYear()} TCyber Admin Hub. All rights reserved.
          </footer>
        </div>
      </body>
    </html>
  );
}

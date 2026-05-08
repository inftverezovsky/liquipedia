"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const navItems = [
  { href: "/", label: "Главная" },
  { href: "/dota2", label: "Dota 2" },
  { href: "/counterstrike", label: "Counter-Strike" },
  { href: "/leagueoflegends", label: "League of Legends" },
  { href: "/valorant", label: "Valorant" },
  { href: "/history", label: "История" },
  { href: "/settings", label: "API" }
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {navItems.map((item) => {
        const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative rounded-lg px-4 py-2 text-sm font-bold transition-all duration-300 ${
              isActive 
                ? 'text-indigo-600' 
                : 'text-slate-600 hover:text-indigo-600'
            }`}
          >
            <span className="relative z-10">{item.label}</span>
            {isActive && (
              <motion.div 
                layoutId="navbar-active"
                className="absolute inset-0 z-0 rounded-lg bg-indigo-50 ring-1 ring-indigo-500/20 shimmer" 
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            {isActive && (
              <motion.div 
                layoutId="navbar-underline"
                className="absolute bottom-1 left-1/2 h-1 w-4 -translate-x-1/2 rounded-full bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.5)]" 
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

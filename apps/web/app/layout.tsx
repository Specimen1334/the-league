// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";
import Script from "next/script";
import { Toaster } from "sonner"; // global toasts
import { GlobalMessenger } from "@/components/messenger/GlobalMessenger"; // 🌟 NEW

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TheLeague",
  description: "Fantasy League Manager",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            (function () {
              try {
                var saved = localStorage.getItem('theme');
                var theme = (saved === 'light' || saved === 'dark') ? saved : 'dark';
                var root = document.documentElement;
                if (theme === 'dark') { root.classList.add('dark'); }
                else { root.classList.remove('dark'); }
              } catch (e) {}
            })();
          `}
        </Script>
      </head>

      <body className={`${geistSans.variable} ${geistMono.variable} bg-slate-900 text-slate-100`}>
        <TopNav />

        <main className="max-w-[1100px] mx-auto p-4">
          {children}
        </main>

        {/* Global toast portal */}
        <Toaster richColors position="top-right" closeButton />

        {/* 🌟 Global Messenger Dock */}
        <GlobalMessenger />
      </body>
    </html>
  );
}

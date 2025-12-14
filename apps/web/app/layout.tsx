import "./globals.css";
import Link from "next/link";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { NavAuthControls } from "./NavAuthControls";
import { Providers } from "./Providers";

export const metadata = {
  title: "The League",
  description: "Fantasy league manager"
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="app-root" data-theme="light">
        <Providers>
          <div className="app-shell">
            <header className="app-header">
              <nav className="app-nav">
                <Link href="/" className="heading-sm">
                  The League
                </Link>

                <div className="app-nav-actions">
                  <ThemeSwitcher />

                  <Link href="/dashboard" className="btn btn-sm btn-ghost">
                    Dashboard
                  </Link>
                  <Link href="/leagues" className="btn btn-sm btn-ghost">
                    Leagues
                  </Link>
                  <Link href="/pokedex" className="btn btn-sm btn-ghost">
                    Pokedex
                  </Link>
                  <Link href="/inbox" className="btn btn-sm btn-ghost">
                    Inbox
                  </Link>
                  <Link href="/profile" className="btn btn-sm btn-ghost">
                    Profile
                  </Link>

                  <NavAuthControls />
                </div>
              </nav>
            </header>

            {props.children}
          </div>
        </Providers>
      </body>
    </html>
  );
}

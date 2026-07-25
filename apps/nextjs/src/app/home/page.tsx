import type { Metadata } from "next";
import Link from "next/link";

import Cubes from "~/features/home/cubes";

import "./home.css";

export const metadata: Metadata = {
  title: "Breakpoint — train like the work is real",
  description:
    "Breakpoint runs leveled simulation environments for deep skill-building with E.S.D.E.",
};

const NAV = [
  { label: "Home", href: "/home", active: true },
  { label: "Curriculum", href: "/curriculum" },
  { label: "Research", href: "/overview" },
  { label: "Settings", href: "/settings" },
  { label: "Contact", href: "mailto:hello@breakpoint.dev" },
];

export default function HomePage() {
  return (
    <main className="oc-home">
      <span
        className="oc-home__vline oc-home__vline--sidebar"
        aria-hidden="true"
      />
      <span
        className="oc-home__vline oc-home__vline--text"
        aria-hidden="true"
      />

      <aside className="oc-home__rail">
        <div className="oc-home__rail-inner">
          <svg
            className="oc-home__mark"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 4v16M5 12h8a4 4 0 0 0 0-8H9M19 12v8M19 12h-3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <nav className="oc-home__nav">
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                data-active={item.active ? "true" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link className="oc-home__cta" href="/workspace">
            Sign in
          </Link>
        </div>

        <span className="oc-home__rail-foot">Breakpoint · E.S.D.E.</span>
      </aside>

      <div className="oc-home__content">
        <section className="oc-home__section oc-home__hero">
          <div className="oc-home__hero-content">
            <h1 className="oc-home__title">
              Breakpoint helps you build high value skills.
            </h1>
            <div className="oc-home__copy">
              <p>
                We believe skill is built under realistic pressure — not by
                watching tutorials, but by working inside environments that
                behave like the real thing.{" "}
                <Link href="/curriculum">Breakpoint puts you in the loop</Link>:
                leveled simulations that escalate as you grow, with an agent
                that coaches through the work instead of doing it for you.
              </p>
              <p>
                Each unit plans, scaffolds, and grades against production-grade
                criteria using the <strong>E.S.D.E. method</strong>, so what you
                practice maps directly onto how senior engineers actually
                operate.
              </p>
            </div>

            <div className="oc-home__cubes">
              <Cubes
                cols={12}
                rows={3}
                maxAngle={60}
                radius={4}
                cellGap={24}
                borderStyle="3px dashed #161616"
                faceColor="#fafafa"
                rippleColor="#6f6f6f"
                rippleSpeed={1.5}
                autoAnimate={false}
                rippleOnClick
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

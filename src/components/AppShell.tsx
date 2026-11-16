import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu, Moon, Plus, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { orgById } from "../data/catalog";
import { useStore } from "../lib/store";
import { useTheme } from "../lib/theme";
import { Avatar, ButtonLink, Logo, OrgMark } from "./ui";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={clsx("focus-ring relative grid size-9 place-items-center overflow-hidden rounded-full border border-line text-ink transition hover:border-line-2 hover:bg-surface", className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: 14, opacity: 0, rotate: -40 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 40 }}
          transition={{ duration: 0.25 }}
        >
          {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

const nav = [
  { to: "/explore", label: "Explore" },
  { to: "/briefs", label: "Briefs" },
  { to: "/organizations", label: "For organizations" },
];

function AccountMenu() {
  const { user, signOut } = useStore();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  if (!user)
    return (
      <Link to="/signin" className="focus-ring hidden rounded-full px-3 py-2 text-[13.5px] font-medium text-ink-2 hover:text-ink sm:block">
        Sign in
      </Link>
    );
  const org = orgById(user.orgId);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="focus-ring flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 hover:bg-surface">
        {org ? <OrgMark org={org} size={28} /> : <Avatar creator={{ name: user.name, color: "#FF5A1F" }} size={28} />}
        <span className="hidden max-w-[120px] truncate text-[13px] font-medium sm:block">{org?.name ?? user.name}</span>
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.16 }}
              className="card absolute right-0 top-12 z-50 w-56 origin-top-right p-1.5"
            >
              <div className="px-3 py-2">
                <div className="truncate text-[13px] font-medium">{user.name}</div>
                <div className="truncate text-[12px] text-muted">{user.email}</div>
              </div>
              <div className="my-1 h-px bg-line" />
              {user.role === "org" ? (
                <MenuItem onClick={() => { setOpen(false); navigate("/org"); }}>Organization portal</MenuItem>
              ) : (
                <MenuItem onClick={() => { setOpen(false); navigate("/studio"); }}>Creator studio</MenuItem>
              )}
              <MenuItem onClick={() => { setOpen(false); navigate("/create"); }}>Make an ad</MenuItem>
              <div className="my-1 h-px bg-line" />
              <MenuItem onClick={() => { setOpen(false); signOut(); navigate("/explore"); }}>
                <LogOut size={14} /> Sign out
              </MenuItem>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] text-ink-2 hover:bg-surface-2 hover:text-ink">
      {children}
    </button>
  );
}

export function AppHeader() {
  const [mobile, setMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const loc = useLocation();
  useEffect(() => { setMobile(false); }, [loc.pathname]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={clsx("sticky top-0 z-40 transition-all duration-300", scrolled ? "border-b border-line bg-bg/80 backdrop-blur-xl" : "border-b border-transparent")}>
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-5 sm:px-8">
        <Link to="/" className="focus-ring rounded-md text-[22px] text-ink">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                clsx("focus-ring relative rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors", isActive ? "text-ink" : "text-muted hover:text-ink")
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-full bg-surface-2" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <AccountMenu />
          <ButtonLink to="/create" variant="flare" size="sm" className="hidden sm:inline-flex">
            <Plus size={15} strokeWidth={2.5} /> Make an ad
          </ButtonLink>
          <button onClick={() => setMobile(true)} className="focus-ring grid size-9 place-items-center rounded-full border border-line md:hidden" aria-label="Open menu">
            <Menu size={16} />
          </button>
        </div>
      </div>
      <AnimatePresence>
        {mobile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-bg/95 backdrop-blur-xl md:hidden">
            <div className="flex h-16 items-center justify-between px-5">
              <Logo className="text-[22px]" />
              <button onClick={() => setMobile(false)} className="grid size-9 place-items-center rounded-full border border-line" aria-label="Close menu">
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-1 px-5 pt-6">
              {[...nav, { to: "/create", label: "Make an ad" }, { to: "/signin", label: "Sign in" }].map((n, i) => (
                <motion.div key={n.to} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
                  <Link to={n.to} className="block py-3 text-[32px] font-semibold tracking-tight">
                    {n.label}
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:px-8">
        <Logo className="text-[20px]" />
        <p className="text-[13px] text-muted">Ads made by the crowd, for the crowd. A West Ventures studio company.</p>
        <div className="flex gap-5 text-[13px] text-muted sm:ml-auto">
          <Link to="/explore" className="hover:text-ink">Explore</Link>
          <Link to="/briefs" className="hover:text-ink">Briefs</Link>
          <Link to="/organizations" className="hover:text-ink">Organizations</Link>
          <Link to="/create" className="hover:text-ink">Make an ad</Link>
        </div>
      </div>
    </footer>
  );
}

export default function AppShell() {
  const loc = useLocation();
  const outlet = useOutlet();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <AnimatePresence mode="wait">
        <motion.main
          key={loc.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {outlet}
        </motion.main>
      </AnimatePresence>
      <AppFooter />
    </div>
  );
}

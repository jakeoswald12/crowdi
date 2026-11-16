import { lazy, Suspense } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import { StoreProvider } from "./lib/store";
import { ThemeProvider } from "./lib/theme";

const Home = lazy(() => import("./pages/Home"));
const Explore = lazy(() => import("./pages/Explore"));
const AdDetail = lazy(() => import("./pages/AdDetail"));
const Create = lazy(() => import("./pages/Create"));
const Briefs = lazy(() => import("./pages/Briefs"));
const BriefDetail = lazy(() => import("./pages/Briefs").then((m) => ({ default: m.BriefDetail })));
const Organizations = lazy(() => import("./pages/Organizations"));
const SignIn = lazy(() => import("./pages/Organizations").then((m) => ({ default: m.SignIn })));
const OrgPortal = lazy(() => import("./pages/OrgPortal"));
const NewBrief = lazy(() => import("./pages/OrgPortal").then((m) => ({ default: m.NewBrief })));
const Studio = lazy(() => import("./pages/Studio"));

function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div>
        <div className="font-mono text-[13px] text-muted">404</div>
        <h1 className="mt-2 text-[44px] font-semibold tracking-[-0.04em]">Nothing here.</h1>
        <Link to="/explore" className="mt-4 inline-block underline underline-offset-4">Watch some ads instead</Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="min-h-dvh" />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route element={<AppShell />}>
                <Route path="/explore" element={<Explore />} />
                <Route path="/ads/:slug" element={<AdDetail />} />
                <Route path="/create" element={<Create />} />
                <Route path="/briefs" element={<Briefs />} />
                <Route path="/briefs/:slug" element={<BriefDetail />} />
                <Route path="/organizations" element={<Organizations />} />
                <Route path="/signin" element={<SignIn />} />
                <Route path="/org" element={<OrgPortal />} />
                <Route path="/org/briefs/new" element={<NewBrief />} />
                <Route path="/studio" element={<Studio />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </StoreProvider>
    </ThemeProvider>
  );
}

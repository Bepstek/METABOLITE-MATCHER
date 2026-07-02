import Link from "next/link";
import { SectionPanel } from "../components/section-panel";
import { Button } from "../components/ui/button";

const quickLinks = [
  {
    title: "Compound Search",
    description:
      "Search compounds by name, inspect formulas and molecular weights, and open compound detail pages.",
    href: "/search/compounds",
    primary: true,
    actionLabel: "Open",
  },
  {
    title: "LC-MS / Adduct m/z Search",
    description:
      "Search observed m/z values using ion mode, adduct type, tolerance, source filtering, multi-select adducts, and stacked multi-mass results.",
    href: "/search/adduct-mz",
    primary: true,
    actionLabel: "Open",
  },
  {
    title: "Neutral Mass Search",
    description:
      "Search compounds directly by neutral monoisotopic mass using tolerance, source filtering, stacked results, pagination, and sorting.",
    href: "/search/neutral-mass",
    primary: true,
    actionLabel: "Open",
  },
  {
    title: "LC-MS/MS Search",
    description:
      "Search a pasted MS/MS peak list against library spectra using fragment tolerance, spectrum kind, source filtering, greedy cosine similarity, and mirror spectrum comparison.",
    href: "/search/ms-ms",
    primary: true,
    actionLabel: "Open",
  },
  {
    title: "MS/MS Spectrum Detail Example",
    description:
      "Open a known MS/MS spectrum detail page with metadata, compound context, HMDB link, peak graph tooltip, sortable peak table, rows selector, and pagination.",
    href: "/spectra/ms-ms/1",
    primary: false,
    actionLabel: "Test",
  },
  {
    title: "Creatine Search Demo",
    description:
      "Open compound search with Creatine preloaded for testing pagination, sorting, and return links.",
    href: "/search/compounds?query=Creatine&page=1&limit=10",
    primary: false,
    actionLabel: "Test",
  },
  {
    title: "Creatine Detail",
    description:
      "Open a known compound detail page with source hierarchy and related spectra for quick testing.",
    href: "/compounds/HMDB0000064",
    primary: false,
    actionLabel: "Test",
  },
  {
    title: "LC-MS Example",
    description:
      "Open the LC-MS/adduct m/z search with example m/z values and default positive-mode settings.",
    href: "/search/adduct-mz?queryMzValues=74.0785+122.21%0A104.1045+126.73%0A228.202+150.79&ionMode=positive&tolerance=0.05&toleranceUnit=da&limit=10",
    primary: false,
    actionLabel: "Test",
  },
  {
    title: "Neutral Mass Example",
    description:
      "Open neutral mass search with multiple example masses, ppm tolerance, source filtering support, sorting, and per-section pagination.",
    href: "/search/neutral-mass?queryMassValues=132.053492132%0A180.063388118%0A300.12345&tolerance=10&toleranceUnit=ppm&limit=10",
    primary: false,
    actionLabel: "Test",
  },
];

const upcomingFeatures = [
  "Make related spectra HMDB ID cells open the local MS/MS spectrum detail page",
  "Primitive fragment peak lookup page",
  "Sortable LC-MS/MS search result columns after cosine scoring is validated",
  "Research/ML API for deeper cosine internals, all matched pairs, candidate statistics, and parameter sweeps",
  "Parent ion mass/adduct-aware filtering after precursor metadata design is finalized",
  "Frontend user guide expansion once the search workflows are stable",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.12),transparent_32%),linear-gradient(to_bottom,#f8fafc,#eef7f8)]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex flex-col gap-4 border-b border-cyan-900/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
              HMDB-like Search Engine
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Mass Spectrometry Search Prototype
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              A lightweight testing home page for navigating the current prototype:
              compound search, LC-MS/adduct m/z search, neutral mass search,
              LC-MS/MS cosine search, compound detail pages, source hierarchy display,
              related spectra inspection, and MS/MS spectrum detail visualization.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild className="w-fit">
              <Link href="/search/compounds">Compound Search</Link>
            </Button>
            <Button asChild variant="outline" className="w-fit">
              <Link href="/search/adduct-mz">LC-MS Search</Link>
            </Button>
            <Button asChild variant="outline" className="w-fit">
              <Link href="/search/neutral-mass">Neutral Mass</Link>
            </Button>
            <Button asChild variant="outline" className="w-fit">
              <Link href="/search/ms-ms">LC-MS/MS Search</Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-4 py-8 md:grid-cols-2 xl:grid-cols-3">
          {quickLinks.map((link) => (
            <SectionPanel
              key={link.href}
              variant="glass"
              className="flex min-h-52 flex-col justify-between p-5"
            >
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{link.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{link.description}</p>
              </div>

              <Button
                asChild
                variant={link.primary ? "default" : "outline"}
                className="mt-5 w-fit"
              >
                <Link href={link.href}>{link.actionLabel}</Link>
              </Button>
            </SectionPanel>
          ))}
        </section>

        <section className="grid gap-4 pb-8 lg:grid-cols-[1.25fr_0.75fr]">
          <SectionPanel className="p-5">
            <h2 className="text-lg font-semibold text-slate-950">Current working workflow</h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
              <li>
                <span className="font-medium text-slate-950">1.</span> Use the home page to choose compound search, LC-MS/adduct m/z search, neutral mass search, or LC-MS/MS cosine search.
              </li>
              <li>
                <span className="font-medium text-slate-950">2.</span> Search compounds by name, sort/paginate results, and open compound detail pages.
              </li>
              <li>
                <span className="font-medium text-slate-950">3.</span> Search observed m/z values with ion mode, multi-select adduct type, tolerance, and source filters.
              </li>
              <li>
                <span className="font-medium text-slate-950">4.</span> Search neutral monoisotopic masses with tolerance, source filters, sorting, and stacked multi-mass sections.
              </li>
              <li>
                <span className="font-medium text-slate-950">5.</span> Search MS/MS peak lists with fragment tolerance, spectrum kind, source filtering, minimum matched peaks, cosine similarity, and mirror spectrum comparison.
              </li>
              <li>
                <span className="font-medium text-slate-950">6.</span> Inspect MS/MS spectrum metadata, compound context, HMDB external link, peak graph tooltip, and sortable paginated peak table.
              </li>
            </ol>
          </SectionPanel>

          <SectionPanel className="p-5">
            <h2 className="text-lg font-semibold text-slate-950">Coming next</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
              {upcomingFeatures.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-700" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </SectionPanel>
        </section>

        <footer className="mt-auto border-t border-cyan-900/10 pt-5 text-xs text-slate-500">
          Prototype navigation page for backend/API/UI testing. Dataset files and search behavior are still evolving.
        </footer>
      </div>
    </main>
  );
}

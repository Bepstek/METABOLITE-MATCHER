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
  {
    text: "Make related spectra HMDB ID cells open the local MS/MS spectrum detail page",
    done: true,
  },
  {
    text: "Primitive fragment peak lookup page",
    done: false,
  },
  {
    text: "Sortable LC-MS/MS search result columns after cosine scoring is validated",
    done: false,
  },
  {
    text: "Research/ML API for deeper cosine internals, all matched pairs, candidate statistics, and parameter sweeps",
    done: true,
  },
  {
    text: "Parent ion mass/adduct-aware filtering after precursor metadata design is finalized",
    done: false,
  },
  {
    text: "Frontend user guide expansion once the search workflows are stable",
    done: false,
  },
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
                <li key={feature.text} className="flex items-start gap-2.5">
                  {feature.done ? (
                    <svg
                      className="mt-1 h-4 w-4 shrink-0 text-emerald-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-700" />
                  )}
                  <span className={feature.done ? "text-slate-500 line-through decoration-slate-300" : ""}>
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>
          </SectionPanel>
        </section>

        <section className="mb-8">
          <SectionPanel className="p-6">
            <div className="space-y-6">
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
                  Model Evaluation
                </p>
                <h2 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                  Machine Learning Algorithm Comparison
                </h2>
                <p className="text-sm leading-6 text-slate-600">
                  To determine the most robust approach for matching and aligning candidate spectra, we evaluated traditional baselines alongside three machine learning classifiers. Models were trained using query-level 5-fold cross-validation (GroupKFold) over verified positive identifications from <strong>DSTB Saliva samples</strong>.
                </p>

                <div className="overflow-hidden rounded-lg border border-cyan-900/10 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Algorithm</th>
                        <th className="px-4 py-3 text-right">MRR</th>
                        <th className="px-4 py-3 text-right">Hit@1</th>
                        <th className="px-4 py-3 text-right">Hit@5</th>
                        <th className="px-4 py-3 text-right">Hit@10</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-xs">
                      <tr>
                        <td className="px-4 py-2.5 font-sans font-medium text-slate-600">Cosine Similarity (Baseline)</td>
                        <td className="px-4 py-2.5 text-right">0.6008</td>
                        <td className="px-4 py-2.5 text-right">47.73%</td>
                        <td className="px-4 py-2.5 text-right">72.73%</td>
                        <td className="px-4 py-2.5 text-right">84.09%</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-sans font-medium text-slate-600">Precursor Mass Error (Baseline)</td>
                        <td className="px-4 py-2.5 text-right">0.7746</td>
                        <td className="px-4 py-2.5 text-right">70.45%</td>
                        <td className="px-4 py-2.5 text-right">84.09%</td>
                        <td className="px-4 py-2.5 text-right">88.64%</td>
                      </tr>
                      <tr className="bg-cyan-50/50 font-semibold text-cyan-950">
                        <td className="px-4 py-2.5 font-sans font-bold text-cyan-800">Random Forest Classifier</td>
                        <td className="px-4 py-2.5 text-right">0.7930</td>
                        <td className="px-4 py-2.5 text-right">72.73%</td>
                        <td className="px-4 py-2.5 text-right">84.09%</td>
                        <td className="px-4 py-2.5 text-right">88.64%</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-sans font-medium text-slate-600">Gradient Boosting Classifier</td>
                        <td className="px-4 py-2.5 text-right">0.7526</td>
                        <td className="px-4 py-2.5 text-right">63.64%</td>
                        <td className="px-4 py-2.5 text-right">88.64%</td>
                        <td className="px-4 py-2.5 text-right">90.91%</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-sans font-medium text-slate-600">Support Vector Machine (SVM)</td>
                        <td className="px-4 py-2.5 text-right">0.7701</td>
                        <td className="px-4 py-2.5 text-right">65.91%</td>
                        <td className="px-4 py-2.5 text-right">88.64%</td>
                        <td className="px-4 py-2.5 text-right">95.45%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-xs leading-relaxed text-slate-500">
                  * <strong>Key findings:</strong> Random Forest achieved the highest Mean Reciprocal Rank (MRR = 0.7930) and Hit@1 accuracy (72.73%). SVM achieved the highest Hit@10 accuracy (95.45%). All models significantly outperformed traditional cosine alignment.
                </p>
              </div>

              <div className="w-full rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-800 mb-4 text-center">
                  Accuracy Comparison (Baselines vs. ML Models)
                </h3>
                <div className="relative w-full overflow-x-auto">
                  <svg viewBox="0 0 650 350" className="w-full min-w-[500px] h-auto">
                    {/* Y-axis Grid Lines */}
                    {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((val) => {
                      const y = 60 + 230 - val * 230;
                      return (
                        <g key={val}>
                          <line
                            x1="50"
                            y1={y}
                            x2="630"
                            y2={y}
                            stroke="#e2e8f0"
                            strokeWidth="1"
                            strokeDasharray={val === 0 ? "0" : "4 4"}
                          />
                          <text
                            x="40"
                            y={y + 4}
                            textAnchor="end"
                            className="fill-slate-400 font-mono text-[10px]"
                          >
                            {val.toFixed(1)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Bars */}
                    {[
                      { name: "Cosine", mrr: 0.6008, hit1: 0.4773, hit5: 0.7273, hit10: 0.8409 },
                      { name: "Precursor Mass", mrr: 0.7746, hit1: 0.7045, hit5: 0.8409, hit10: 0.8864 },
                      { name: "Random Forest", mrr: 0.7930, hit1: 0.7273, hit5: 0.8409, hit10: 0.8864 },
                      { name: "Gradient Boosting", mrr: 0.7526, hit1: 0.6364, hit5: 0.8864, hit10: 0.9091 },
                      { name: "SVM", mrr: 0.7701, hit1: 0.6591, hit5: 0.8864, hit10: 0.9545 },
                    ].map((model, i) => {
                      const groupX = 50 + i * 116;
                      const barWidth = 12;
                      const gap = 2;
                      const metrics = [
                        { val: model.mrr, color: "#94a3b8", label: "MRR" },
                        { val: model.hit1, color: "#67e8f9", label: "Hit@1" },
                        { val: model.hit5, color: "#06b6d4", label: "Hit@5" },
                        { val: model.hit10, color: "#0f766e", label: "Hit@10" },
                      ];

                      return (
                        <g key={model.name}>
                          {/* X-axis Label */}
                          <text
                            x={groupX + 58}
                            y="315"
                            textAnchor="middle"
                            className="fill-slate-600 font-sans text-[10px] font-semibold"
                          >
                            {model.name}
                          </text>

                          {/* Group Bars */}
                          {metrics.map((m, j) => {
                            const barX = groupX + 31 + j * (barWidth + gap);
                            const barHeight = m.val * 230;
                            const barY = 60 + 230 - barHeight;

                            return (
                              <g key={m.label} className="group/bar relative">
                                <rect
                                  x={barX}
                                  y={barY}
                                  width={barWidth}
                                  height={barHeight}
                                  fill={m.color}
                                  rx="1.5"
                                  className="transition-all duration-300 hover:brightness-95"
                                />
                                {/* Value Label rotated vertically on top of bar */}
                                <text
                                  x={barX + barWidth / 2 + 1}
                                  y={barY - 6}
                                  textAnchor="start"
                                  transform={`rotate(-90, ${barX + barWidth / 2 + 1}, ${barY - 6})`}
                                  className="fill-slate-600 font-mono text-[9px] font-bold"
                                >
                                  {m.val.toFixed(2)}
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      );
                    })}

                    {/* Bottom Border Line */}
                    <line x1="50" y1="290" x2="630" y2="290" stroke="#cbd5e1" strokeWidth="1.5" />
                  </svg>

                  {/* Legend */}
                  <div className="flex justify-center gap-6 mt-4 flex-wrap text-xs text-slate-600 font-semibold">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded bg-[#94a3b8]" />
                      <span>MRR</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded bg-[#67e8f9]" />
                      <span>Hit@1</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded bg-[#06b6d4]" />
                      <span>Hit@5</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded bg-[#0f766e]" />
                      <span>Hit@10</span>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </SectionPanel>
        </section>

        <footer className="mt-auto border-t border-cyan-900/10 pt-5 text-xs text-slate-500">
          Prototype navigation page for backend/API/UI testing. Dataset files and search behavior are still evolving.
        </footer>
      </div>
    </main>
  );
}

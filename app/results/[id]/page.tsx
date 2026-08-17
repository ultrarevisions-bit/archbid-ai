import ResultsClient from "./ResultsClient";

// The report is user-specific and must be resolved at request time.
// Keeping the route itself server-rendered avoids the dynamic /results/[id]
// page being treated as a static page during the Vercel build.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ResultsPage() {
  return <ResultsClient />;
}

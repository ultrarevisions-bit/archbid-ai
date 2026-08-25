import Link from "next/link";

export default function RefundsPage() {
  return (
    <main className="legal-page">
      <nav className="home-nav"><div className="container nav-inner"><Link className="brand" href="/"><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></Link><div className="nav-menu desktop-nav"><Link href="/">Home</Link><Link href="/contact">Contact</Link><Link className="nav-cta" href="/analyze">Get started free →</Link></div></div></nav>
      <article className="legal-content container">
        <div className="section-label">BILLING</div>
        <h1>Refund Policy</h1>
        <p className="legal-updated">Last updated: August 25, 2026</p>
        <p>ArchBid AI offers a one-time $19 proposal-draft purchase based on an analyzed RFP. We want customers to receive a useful, working draft from the service.</p>
        <h2>Eligible refund requests</h2>
        <p>If you paid for a proposal draft and ArchBid is unable to provide the purchased proposal-generation service because of a technical failure on our side, please contact us and we will review the issue and, where appropriate, issue a refund.</p>
        <h2>How to request a refund</h2>
        <p>Contact us with the email address used for your ArchBid account, the RFP or analysis involved, and a brief description of the problem. We may ask for the Lemon Squeezy order or receipt details so we can locate the purchase.</p>
        <h2>Non-refundable situations</h2>
        <p>A proposal draft is an AI-assisted starting point and must be reviewed and edited by your firm. A refund is not normally available simply because you dislike the wording, strategy, formatting, or because a bid is unsuccessful. ArchBid does not guarantee that a proposal will win a contract or satisfy every requirement without review.</p>
        <h2>Payment provider</h2>
        <p>Payments are processed through Lemon Squeezy. Refunds, where approved, are processed through the payment system used for the purchase.</p>
        <h2>Contact</h2>
        <p>If you have a billing concern, please use our <Link href="/contact">Contact page</Link>.</p>
      </article>
      <footer><div className="container"><span>© 2026 ArchBid AI</span><span><Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/refunds">Refund Policy</Link></span></div></footer>
    </main>
  );
}

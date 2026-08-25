import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <nav className="home-nav"><div className="container nav-inner"><Link className="brand" href="/"><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></Link><div className="nav-actions"><Link className="nav-login" href="/">Home</Link><Link className="nav-cta" href="/analyze">Get started free →</Link></div></div></nav>
      <article className="legal-content container">
        <div className="section-label">LEGAL</div>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: August 25, 2026</p>
        <p>ArchBid AI (“ArchBid”, “we”, “us”, or “our”) helps architecture and design firms analyze RFPs and prepare proposal drafts. This Privacy Policy explains what information we collect, how we use it, and the choices available to you.</p>
        <h2>1. Information we collect</h2>
        <p>We may collect account information such as your name and email address, information you provide when using ArchBid, uploaded RFP documents and the analysis or proposal content generated from them, and basic technical information needed to operate and secure the service.</p>
        <h2>2. How we use information</h2>
        <p>We use information to provide and improve RFP analysis and proposal generation, maintain your account, process purchases, prevent abuse, provide support, and communicate important service or account information.</p>
        <h2>3. Uploaded documents</h2>
        <p>Your uploaded RFPs may contain confidential business information. We use uploaded content to provide the service you requested. You should only upload documents that you are authorized to submit to a third-party service.</p>
        <h2>4. Payments</h2>
        <p>Payments for paid features are processed by our payment provider, Lemon Squeezy. We do not need to store your full payment-card details to provide ArchBid.</p>
        <h2>5. Service providers</h2>
        <p>We use trusted technology providers, which may include hosting, database, AI processing, authentication, and payment services, to operate ArchBid. These providers process information only as necessary to provide their services to us.</p>
        <h2>6. Data retention and deletion</h2>
        <p>We retain account and project information while it is needed to provide the service or meet legitimate operational or legal requirements. If you want information associated with your account deleted, contact us through the support contact provided by ArchBid.</p>
        <h2>7. Security</h2>
        <p>We use reasonable technical and organizational safeguards to protect information. However, no online service can guarantee absolute security.</p>
        <h2>8. Your choices</h2>
        <p>You may choose not to provide certain information, although this may prevent you from using some features. You may also request access to or deletion of personal information, subject to applicable requirements.</p>
        <h2>9. Children</h2>
        <p>ArchBid is intended for professional users and is not directed to children under 13.</p>
        <h2>10. Changes to this policy</h2>
        <p>We may update this policy when our service or legal obligations change. The updated version will be posted on this page with a revised date.</p>
        <h2>11. Contact</h2>
        <p>For privacy questions or requests, please contact the ArchBid AI support team through the contact information provided on the service.</p>
      </article>
      <footer><div className="container"><span>© 2026 ArchBid AI</span><span><Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></span></div></footer>
    </main>
  );
}

import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="legal-page">
      <nav className="home-nav"><div className="container nav-inner"><Link className="brand" href="/"><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></Link><div className="nav-actions"><Link className="nav-login" href="/">Home</Link><Link className="nav-cta" href="/analyze">Get started free →</Link></div></div></nav>
      <article className="legal-content container">
        <div className="section-label">LEGAL</div>
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: August 25, 2026</p>
        <p>These Terms of Service (“Terms”) govern your use of ArchBid AI (“ArchBid”, “we”, “us”, or “our”). By creating an account or using ArchBid, you agree to these Terms.</p>
        <h2>1. The service</h2>
        <p>ArchBid provides AI-assisted RFP analysis, opportunity intelligence, and proposal drafting tools for architecture and design professionals. Features may change as we improve the service.</p>
        <h2>2. Your account</h2>
        <p>You are responsible for keeping your account credentials secure and for activity performed through your account. You must provide information that is accurate enough for us to operate your account and provide requested services.</p>
        <h2>3. Acceptable use</h2>
        <p>You may not use ArchBid to violate applicable laws, infringe another party’s rights, attempt unauthorized access, interfere with the service, or upload content that you do not have the right to use.</p>
        <h2>4. Your documents and content</h2>
        <p>You retain your rights to documents and other content you upload. You grant ArchBid the limited rights necessary to process that content and provide the requested features. You are responsible for ensuring that you have permission to upload and process any confidential or third-party material.</p>
        <h2>5. AI-generated output</h2>
        <p>ArchBid uses artificial intelligence to generate analysis and proposal drafts. Outputs can contain errors, omissions, or assumptions. You must review all AI-generated content before relying on it, submitting it to a client, or using it in a professional, contractual, financial, or legal decision.</p>
        <h2>6. Proposal drafts</h2>
        <p>A generated proposal is a starting draft, not a final submission. ArchBid does not guarantee that a proposal will win a bid, satisfy every RFP requirement, or contain every fact your firm needs to provide.</p>
        <h2>7. Paid features and refunds</h2>
        <p>Paid features are purchased through our payment provider, Lemon Squeezy. Prices and the specific features included in a purchase are shown at checkout. Any applicable refunds are handled according to the applicable checkout and payment-provider terms.</p>
        <h2>8. Intellectual property</h2>
        <p>The ArchBid service, software, branding, and original materials are owned by ArchBid or its licensors and may not be copied, reverse engineered, or commercially exploited except as permitted by law or by our written permission.</p>
        <h2>9. Availability</h2>
        <p>We aim to keep ArchBid available and reliable, but we do not guarantee uninterrupted or error-free operation. We may temporarily suspend features for maintenance, security, or improvements.</p>
        <h2>10. Disclaimer and limitation</h2>
        <p>ArchBid is provided on an “as is” and “as available” basis to the extent permitted by law. To the maximum extent permitted by applicable law, ArchBid is not responsible for decisions made solely from AI-generated output or for indirect losses arising from use of the service.</p>
        <h2>11. Changes</h2>
        <p>We may update these Terms as the service develops. Continued use after an updated version becomes effective means you accept the revised Terms.</p>
        <h2>12. Contact</h2>
        <p>Questions about these Terms can be sent to the ArchBid AI support contact provided on the service.</p>
      </article>
      <footer><div className="container"><span>© 2026 ArchBid AI</span><span><Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></span></div></footer>
    </main>
  );
}

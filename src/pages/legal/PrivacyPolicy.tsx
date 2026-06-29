import { useEffect } from "react";

const COMPANY = "Local News Network, LLC";
const CONTACT_EMAIL = "content@lnn.co";
const EFFECTIVE_DATE = "May 16, 2026";

export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = "Privacy Policy";

    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow, noarchive, nosnippet";
    document.head.appendChild(robots);

    return () => {
      document.head.removeChild(robots);
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        <h1>Privacy Policy</h1>
        <p>
          <strong>Effective Date:</strong> {EFFECTIVE_DATE}
        </p>
        <p>
          This Privacy Policy describes how {COMPANY} ("Company", "we", "us", or "our") collects,
          uses, discloses, and protects information in connection with our web application and
          related services (the "Service"). By accessing or using the Service, you agree to this
          Privacy Policy.
        </p>

        <h2>1. Information We Collect</h2>
        <p>We collect the following categories of information:</p>
        <ul>
          <li>
            <strong>Account Information.</strong> Name, email address, organization, role, and
            authentication identifiers.
          </li>
          <li>
            <strong>Customer Data.</strong> Content, files, contacts, deals, products, and other
            data you submit to the Service.
          </li>
          <li>
            <strong>Integration Data.</strong> When you connect third-party services (such as
            Intuit QuickBooks Online, HubSpot, WordPress, Slack, SendGrid, Beehiiv, Broadstreet,
            or similar), we receive and store data necessary to operate the integration,
            including OAuth tokens, account identifiers, products, customers, invoices, and other
            records you authorize.
          </li>
          <li>
            <strong>Usage Data.</strong> Log data, device and browser information, IP address,
            pages viewed, actions taken, and timestamps.
          </li>
          <li>
            <strong>Cookies.</strong> We use cookies and similar technologies to maintain sessions
            and remember preferences.
          </li>
        </ul>

        <h2>2. How We Use Information</h2>
        <p>We use information to:</p>
        <ul>
          <li>provide, maintain, and improve the Service;</li>
          <li>authenticate users and secure accounts;</li>
          <li>operate integrations you enable on your behalf;</li>
          <li>communicate with you about the Service, including transactional notifications;</li>
          <li>monitor, troubleshoot, and analyze usage and performance;</li>
          <li>comply with legal obligations and enforce our agreements.</li>
        </ul>

        <h2>3. Legal Bases (EEA / UK)</h2>
        <p>
          Where applicable, we process personal data on the basis of contract performance,
          legitimate interests (such as operating and securing the Service), consent (where
          required), and legal obligation.
        </p>

        <h2>4. Sharing of Information</h2>
        <p>We share information only as follows:</p>
        <ul>
          <li>
            <strong>Service Providers.</strong> Vendors that process data on our behalf to host
            infrastructure, send email, monitor performance, or provide analytics, under
            contractual confidentiality and security obligations.
          </li>
          <li>
            <strong>Third-Party Integrations.</strong> When you authorize an integration (e.g.
            QuickBooks Online, HubSpot), data flows to and from that service per your
            instructions and per the third party's own privacy policy.
          </li>
          <li>
            <strong>Legal and Safety.</strong> When required by law, subpoena, or to protect
            rights, property, or safety.
          </li>
          <li>
            <strong>Business Transfers.</strong> In connection with a merger, acquisition,
            financing, or sale of assets.
          </li>
        </ul>
        <p>We do not sell personal information.</p>

        <h2>5. Intuit QuickBooks Online Integration</h2>
        <p>
          If you connect Intuit QuickBooks Online to the Service, we will access, store, and
          transmit information from your QuickBooks Online company (such as items, customers,
          invoices, accounts, and tokens) solely to provide the integration features you
          authorize. We use and disclose this data in accordance with Intuit's developer policies,
          and we retain it only as long as necessary to provide the Service or as required by law.
          You may revoke our access at any time by disconnecting the integration in the Service
          or in your Intuit account, after which we will delete or anonymize the related
          credentials within a commercially reasonable period.
        </p>

        <h2>6. Data Retention</h2>
        <p>
          We retain information for as long as your account is active or as needed to provide the
          Service, comply with legal obligations, resolve disputes, and enforce agreements. You
          may request deletion as described below.
        </p>

        <h2>7. Security</h2>
        <p>
          We employ administrative, technical, and organizational safeguards designed to protect
          information, including encryption in transit, access controls, and least-privilege
          principles. No system can be guaranteed completely secure.
        </p>

        <h2>8. International Transfers</h2>
        <p>
          We may process information in the United States and other jurisdictions. Where required,
          we rely on appropriate safeguards for cross-border transfers.
        </p>

        <h2>9. Your Rights</h2>
        <p>
          Depending on your jurisdiction, you may have rights to access, correct, delete, port,
          or restrict processing of your personal information, and to withdraw consent. To
          exercise these rights, contact us at the address below. We will respond consistent with
          applicable law.
        </p>

        <h2>10. Children's Privacy</h2>
        <p>
          The Service is not directed to children under 13 (or the equivalent minimum age in the
          relevant jurisdiction), and we do not knowingly collect personal information from them.
        </p>

        <h2>11. Changes to this Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be
          communicated through the Service or by other appropriate means.
        </p>

        <h2>12. Contact</h2>
        <p>
          For questions about this Privacy Policy or our data practices, contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </article>
    </main>
  );
}

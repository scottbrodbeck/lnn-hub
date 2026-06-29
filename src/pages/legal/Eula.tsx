import { useEffect } from "react";

const COMPANY = "Local News Network, LLC";
const CONTACT_EMAIL = "content@lnn.co";
const EFFECTIVE_DATE = "May 16, 2026";

export default function Eula() {
  useEffect(() => {
    document.title = "End User License Agreement";

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
        <h1>End User License Agreement</h1>
        <p>
          <strong>Effective Date:</strong> {EFFECTIVE_DATE}
        </p>
        <p>
          This End User License Agreement ("Agreement") is a binding legal agreement between you
          ("you" or "User") and {COMPANY} ("Company", "we", "us", or "our") governing your access
          to and use of the Company's web application, related services, and any associated
          software, documentation, and updates (collectively, the "Software"). By accessing or
          using the Software, you agree to be bound by this Agreement. If you do not agree, do
          not access or use the Software.
        </p>

        <h2>1. License Grant</h2>
        <p>
          Subject to your continuing compliance with this Agreement, Company grants you a limited,
          non-exclusive, non-transferable, non-sublicensable, revocable license to access and use
          the Software solely for your internal business purposes during the term of your
          subscription or authorized account.
        </p>

        <h2>2. Restrictions</h2>
        <p>You shall not, and shall not permit any third party to:</p>
        <ul>
          <li>copy, modify, translate, or create derivative works of the Software;</li>
          <li>reverse engineer, decompile, disassemble, or otherwise attempt to derive source code, except as expressly permitted by applicable law;</li>
          <li>rent, lease, lend, sell, sublicense, distribute, or otherwise transfer the Software;</li>
          <li>remove, alter, or obscure any proprietary notices;</li>
          <li>use the Software to develop a competing product or service;</li>
          <li>access the Software to circumvent or disable security or usage controls;</li>
          <li>use the Software in violation of any applicable law or third-party right.</li>
        </ul>

        <h2>3. Accounts and Credentials</h2>
        <p>
          You are responsible for safeguarding your account credentials and for all activity that
          occurs under your account. You must promptly notify us of any unauthorized use or
          suspected security incident.
        </p>

        <h2>4. Third-Party Services</h2>
        <p>
          The Software may interoperate with third-party products or services (including, without
          limitation, Intuit QuickBooks Online, HubSpot, and other integrations you choose to
          enable). Your use of any third-party service is governed by the terms and privacy
          policies of that provider, and Company is not responsible for the acts, omissions, or
          content of any third-party service.
        </p>

        <h2>5. Customer Data</h2>
        <p>
          You retain all rights in and to data you submit to the Software ("Customer Data"). You
          grant Company a worldwide, royalty-free license to host, process, transmit, display, and
          otherwise use Customer Data solely as necessary to provide and improve the Software and
          as permitted by our Privacy Policy.
        </p>

        <h2>6. Intellectual Property</h2>
        <p>
          The Software, and all worldwide intellectual property rights therein, are the exclusive
          property of Company and its licensors. Except for the limited license expressly granted
          herein, no rights are granted to you under any patent, copyright, trademark, trade
          secret, or other intellectual property right.
        </p>

        <h2>7. Fees</h2>
        <p>
          If you have agreed to pay fees for the Software, you will pay all such fees as set forth
          in the applicable order or subscription. All fees are non-refundable except as required
          by law.
        </p>

        <h2>8. Term and Termination</h2>
        <p>
          This Agreement is effective until terminated. Company may suspend or terminate your
          access at any time, with or without notice, for any reason, including breach of this
          Agreement. Upon termination, all rights granted to you will immediately cease.
        </p>

        <h2>9. Disclaimer of Warranties</h2>
        <p>
          THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITH ALL FAULTS AND WITHOUT
          WARRANTY OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, COMPANY
          DISCLAIMS ALL WARRANTIES, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING THE IMPLIED
          WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND
          NON-INFRINGEMENT, AND ANY WARRANTIES ARISING OUT OF COURSE OF DEALING OR USAGE OF TRADE.
        </p>

        <h2>10. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT WILL COMPANY BE LIABLE
          FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS
          OF PROFITS, REVENUES, DATA, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE
          SOFTWARE. COMPANY'S AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT
          WILL NOT EXCEED THE AMOUNTS PAID BY YOU TO COMPANY FOR THE SOFTWARE IN THE TWELVE (12)
          MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.
        </p>

        <h2>11. Indemnification</h2>
        <p>
          You agree to indemnify, defend, and hold harmless Company and its affiliates, officers,
          directors, employees, and agents from and against any and all claims, damages,
          liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of
          or related to your use of the Software, your Customer Data, or your violation of this
          Agreement.
        </p>

        <h2>12. Export Compliance</h2>
        <p>
          You shall comply with all applicable export and import laws and regulations in your use
          of the Software.
        </p>

        <h2>13. Governing Law</h2>
        <p>
          This Agreement is governed by the laws of the State of Florida, United States, without
          regard to its conflict-of-laws principles. Any dispute arising out of or related to this
          Agreement will be brought exclusively in the state or federal courts located in Florida,
          and the parties consent to the personal jurisdiction of such courts.
        </p>

        <h2>14. Changes to this Agreement</h2>
        <p>
          Company may modify this Agreement from time to time. Continued use of the Software after
          notice of changes constitutes your acceptance of the modified Agreement.
        </p>

        <h2>15. Contact</h2>
        <p>
          Questions about this Agreement may be directed to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </article>
    </main>
  );
}

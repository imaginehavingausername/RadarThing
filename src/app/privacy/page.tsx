import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "~/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How RadarThing collects, uses, shares, and protects data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Data handling brief"
      title="Privacy policy"
      summary="This policy explains what RadarThing collects, why we use it, who processes it, and the choices available to you."
    >
      <LegalSection title="Who we are">
        <p>
          RadarThing is the controller responsible for this service. Contact us
          at{" "}
          <a className="text-cyan-200" href="mailto:privacy@radarthing.com">
            privacy@radarthing.com
          </a>{" "}
          or through our <Link href="/contact">contact page</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Information we process">
        <ul className="list-disc space-y-2 pl-5 marker:text-cyan-300/60">
          <li>
            Account details such as your Clerk user ID, email address, display
            name, Google account identifier, and authentication events.
          </li>
          <li>
            GeoFS and flight information, including usernames, callsigns,
            aircraft, positions, routes, timestamps, flight history, and
            statistics. Information shown on public radar and pilot pages is
            public by design.
          </li>
          <li>
            Content you submit, including aircraft images, airport charts,
            public pilot ACARS entries, filenames, attribution details, viewer
            reports, and moderation records.
          </li>
          <li>
            Subscription and transaction references. Stripe processes full
            payment-card details; RadarThing does not store them.
          </li>
          <li>
            Technical information such as IP address, browser/device details,
            diagnostic events, security logs, and cookie or local-storage
            identifiers.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Why we use information">
        <p>
          We process information to provide accounts, live tracking, flight
          history, community submissions, subscriptions, support, abuse
          prevention, security, and service diagnostics. Our legal bases are
          performance of our contract with you, our legitimate interests in
          operating and securing RadarThing, compliance with legal obligations,
          and consent where required for analytics or advertising storage.
        </p>
      </LegalSection>

      <LegalSection title="Service providers and sharing">
        <p>
          We use Clerk for authentication, Convex for application data,
          UploadThing for uploaded files, Stripe for payments, Resend for
          transactional email, OpenAI for screening ACARS text before
          publication, PostHog for optional analytics, and Google AdSense for
          free-tier advertising. These providers process information under their
          own terms and may process it outside the United Kingdom; we rely on
          applicable contractual and legal transfer safeguards.
        </p>
        <p>
          We may also disclose information where legally required, to protect
          users or the service, or as part of a business transfer. We do not
          sell account information directly.
        </p>
      </LegalSection>

      <LegalSection title="Google advertising">
        <p>
          Third-party vendors, including Google, use cookies or similar
          technologies to serve and measure ads based on visits to RadarThing
          and/or other websites. Google advertising cookies allow Google and its
          partners to provide personalised advertising where you consent.
          Vendors may also use IP addresses, web beacons, or other identifiers
          as part of ad serving and fraud prevention.
        </p>
        <p>
          Learn{" "}
          <a
            href="https://policies.google.com/technologies/partner-sites"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-200"
          >
            how Google uses information from partner sites
          </a>
          . You can manage personalised Google advertising in{" "}
          <a
            href="https://adssettings.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-200"
          >
            Google Ads Settings
          </a>{" "}
          and opt out of some other vendors through{" "}
          <a
            href="https://optout.aboutads.info/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-200"
          >
            AboutAds
          </a>
          . In the UK, EEA, and Switzerland, advertising choices are collected
          through Google&apos;s certified consent platform.
        </p>
      </LegalSection>

      <LegalSection title="Retention">
        <p>
          Account and flight data is retained while your account is active or
          until you delete it, subject to backups and legal requirements.
          Pending uploads are retained through moderation; approved public
          submissions and ACARS entries remain until removed or replaced.
          Blocked ACARS attempts and reports may be retained for admin review.
          Transaction records are kept as needed for accounting and legal
          obligations. Security and diagnostic records are retained only for as
          long as reasonably needed for those purposes. Provider retention
          periods may also apply.
        </p>
      </LegalSection>

      <LegalSection title="Your choices and rights">
        <p>
          Depending on where you live, you may have rights to access, correct,
          delete, restrict, export, or object to processing of your personal
          information, and to withdraw consent at any time. Account data can be
          exported or deleted from the dashboard. You may change optional
          analytics and advertising choices using the Privacy control on the
          site.
        </p>
        <p>
          Send privacy requests to privacy@radarthing.com. UK users may also
          complain to the Information Commissioner&apos;s Office at{" "}
          <a
            href="https://ico.org.uk/make-a-complaint/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-200"
          >
            ico.org.uk
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          RadarThing is not directed to children under 13. We do not knowingly
          use activity from users known to be under 13 for personalised
          advertising. Contact us if you believe a child has provided personal
          information improperly.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may update this policy as the service, providers, or law changes.
          Material changes will be highlighted on the site and the date above
          will be updated.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

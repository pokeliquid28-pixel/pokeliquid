"use client";

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-[12px] font-mono">
      <h1 className="text-lg font-bold text-primary mb-6">Terms of Service</h1>
      <p className="text-secondary mb-6">Last updated: June 2026</p>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">1. Acceptance of Terms</h2>
        <p className="text-secondary leading-relaxed">
          By accessing or using Pokeliquid ("the Protocol"), you agree to be bound by these Terms of Service.
          If you do not agree, do not use the Protocol. Your continued use constitutes acceptance of these terms
          and any future modifications.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">2. Description of Service</h2>
        <p className="text-secondary leading-relaxed">
          Pokeliquid is an experimental decentralized finance (DeFi) protocol deployed on the Solana blockchain.
          It enables users to trade perpetual futures contracts whose prices are derived from Pok&eacute;mon trading card
          market data. The Protocol consists of open-source smart contracts and a web-based interface. The Protocol
          is provided on an experimental, as-is basis.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">3. Risk Disclosure</h2>
        <p className="text-secondary leading-relaxed mb-3">
          Trading perpetual futures involves substantial risk of loss, including the possibility of losing your
          entire deposit. You should not trade with funds you cannot afford to lose. Specific risks include but
          are not limited to:
        </p>
        <ul className="list-disc list-inside text-secondary leading-relaxed space-y-1 ml-2">
          <li>Smart contract bugs or vulnerabilities that may result in loss of funds</li>
          <li>Oracle failure, manipulation, or delayed price updates leading to incorrect liquidations</li>
          <li>Liquidation risk due to leveraged trading and volatile underlying assets</li>
          <li>Blockchain network congestion or downtime preventing timely transactions</li>
          <li>Loss of access to your wallet or private keys</li>
          <li>Regulatory changes that may affect the legality or availability of the service</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">4. Jurisdictional Restrictions</h2>
        <p className="text-secondary leading-relaxed">
          The Protocol is not intended for use by US persons as defined by applicable law, or by persons in any
          jurisdiction where such use would be prohibited or restricted. By using the Protocol, you self-certify
          that you are not a US person and that you are legally permitted to use decentralized finance protocols
          in your jurisdiction. We do not verify your jurisdiction and rely solely on your self-certification.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">5. No Financial Advice</h2>
        <p className="text-secondary leading-relaxed">
          Nothing provided by the Protocol, its interface, documentation, or any associated communications
          constitutes financial advice, investment advice, trading advice, or any other sort of advice. You
          are solely responsible for your own trading decisions and should consult qualified professionals
          before making any financial decisions.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">6. Limitation of Liability</h2>
        <p className="text-secondary leading-relaxed">
          To the maximum extent permitted by applicable law, the Protocol, its developers, contributors, and
          operators shall not be liable for any direct, indirect, incidental, special, consequential, or
          exemplary damages arising from your use of or inability to use the Protocol, including but not
          limited to loss of funds, loss of profits, or loss of data.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">7. No Warranties</h2>
        <p className="text-secondary leading-relaxed">
          The Protocol is provided "as is" and "as available" without warranties of any kind, whether express
          or implied. This is experimental software. We make no warranty that the Protocol will be uninterrupted,
          timely, secure, or error-free. Smart contracts are immutable once deployed and may contain undiscovered
          bugs despite auditing efforts.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">8. Governing Law</h2>
        <p className="text-secondary leading-relaxed">
          These terms shall be governed by and construed in accordance with applicable law. Any disputes
          arising from these terms or use of the Protocol shall be resolved through binding arbitration.
        </p>
      </section>

      <div className="border-t border-border pt-6 mt-12">
        <p className="text-secondary/60 text-[10px]">
          Experimental software. Not financial advice. Not available to US persons. Use at your own risk.
        </p>
      </div>
    </div>
  );
}

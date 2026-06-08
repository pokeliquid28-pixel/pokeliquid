"use client";

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-[12px] font-mono">
      <h1 className="text-lg font-bold text-primary mb-6">Privacy Policy</h1>
      <p className="text-secondary mb-6">Last updated: June 2026</p>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">1. Data We Collect</h2>
        <p className="text-secondary leading-relaxed mb-3">
          We collect minimal data necessary to operate the Protocol:
        </p>
        <ul className="list-disc list-inside text-secondary leading-relaxed space-y-1 ml-2">
          <li><span className="text-primary">Email address</span> — only if you create an account for wallet recovery</li>
          <li><span className="text-primary">Wallet public key</span> — associated with your account for identification</li>
          <li><span className="text-primary">Trading history</span> — positions, trades, and PnL recorded on-chain and in our database</li>
          <li><span className="text-primary">IP address</span> — temporarily logged for rate limiting session wallet creation</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">2. How We Use Your Data</h2>
        <ul className="list-disc list-inside text-secondary leading-relaxed space-y-1 ml-2">
          <li>Account authentication and wallet recovery via email</li>
          <li>Displaying your trading history, positions, and leaderboard rankings</li>
          <li>Rate limiting to prevent abuse of session wallet creation</li>
          <li>Debugging and improving the Protocol</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">3. Data Sharing</h2>
        <p className="text-secondary leading-relaxed">
          We do not sell, rent, or share your personal data with third parties for marketing purposes.
          Your trading activity is recorded on the Solana blockchain and is publicly visible by nature
          of the blockchain. We may share data if required by law or to protect the security of the Protocol.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">4. Data Storage</h2>
        <p className="text-secondary leading-relaxed">
          Account data (email, encrypted wallet keys) is stored in a PostgreSQL database hosted on
          secure infrastructure. Encrypted wallet keys use AES-256-GCM encryption. We retain your data
          for as long as your account exists. On-chain data is permanent and cannot be deleted.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">5. Cookies & Local Storage</h2>
        <p className="text-secondary leading-relaxed">
          We use browser localStorage to store session wallet keypairs, UI preferences, and risk
          disclaimer acceptance. We use HTTP-only cookies for session authentication. We do not use
          third-party tracking cookies or analytics services.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-primary mb-2">6. Your Rights</h2>
        <p className="text-secondary leading-relaxed">
          You may request deletion of your account data by contacting us. Note that on-chain transaction
          history cannot be deleted due to the immutable nature of the blockchain. Session wallets stored
          only in your browser can be cleared by clearing your browser data.
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

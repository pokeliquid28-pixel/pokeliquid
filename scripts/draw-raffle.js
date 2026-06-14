#!/usr/bin/env node
/**
 * Draw a $POKE holder raffle.
 *
 * 1. Snapshots all holders of the $POKE token
 * 2. Calculates tickets (1 per 100k tokens)
 * 3. Picks winner using recent slot hash as seed
 * 4. Records result on-chain via record_raffle instruction
 * 5. Fulfills prize (gacha pack via Collector Crypt)
 *
 * Usage:
 *   ROUND=1 node scripts/draw-raffle.js
 *   ROUND=1 DRY_RUN=1 node scripts/draw-raffle.js   # preview without recording
 */

const { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } = require("@solana/web3.js");
const { createHash } = require("crypto");
const fs = require("fs");
const path = require("path");

const RPC_URL = process.env.HELIUS_RPC || "https://mainnet.helius-rpc.com/?api-key=358c9ec3-db8b-46a1-ac6c-d702d3a19340";
const POKE_MINT = new PublicKey("6TPQEMKviAYz3h7gWwtTZJSACMtF2tbofNnPwSyLpump");
const PROGRAM_ID = new PublicKey("5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6");
const PROTOCOL_STATE = new PublicKey("6yAYSsp863889v7bhMEwj6tVq5DvFTi1gwzwHFrqwLFL");
const TICKETS_PER = 100_000; // 100k tokens = 1 ticket (token has 6 decimals)
const TICKETS_PER_RAW = TICKETS_PER * 1_000_000; // 100k * 1e6 decimals
const ROUND = parseInt(process.env.ROUND || "1");
const DRY_RUN = process.env.DRY_RUN === "1";

const conn = new Connection(RPC_URL, "confirmed");

async function main() {
  console.log(`\n=== $POKE RAFFLE — ROUND #${ROUND} ===\n`);

  // Load admin keypair
  const keyPath = process.env.ADMIN_KEY || path.join(process.env.HOME, ".config/solana/id.json");
  const adminKp = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(keyPath, "utf8"))));
  console.log("Admin:", adminKp.publicKey.toBase58());

  // 1. Snapshot all $POKE token accounts
  console.log("\nSnapshotting $POKE holders...");
  const tokenAccounts = await conn.getParsedProgramAccounts(
    new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    {
      filters: [
        { dataSize: 165 },
        { memcmp: { offset: 0, bytes: POKE_MINT.toBase58() } },
      ],
    }
  );

  // 2. Calculate tickets per holder
  const holders = [];
  let totalTickets = 0;

  for (const acc of tokenAccounts) {
    const parsed = acc.account.data.parsed;
    const owner = parsed.info.owner;
    const amount = parseInt(parsed.info.tokenAmount.amount);
    const tickets = Math.floor(amount / TICKETS_PER_RAW);
    if (tickets >= 1) {
      holders.push({ owner, amount, tickets });
      totalTickets += tickets;
    }
  }

  holders.sort((a, b) => b.tickets - a.tickets);

  console.log(`Total token accounts: ${tokenAccounts.length}`);
  console.log(`Eligible holders (100k+): ${holders.length}`);
  console.log(`Total tickets: ${totalTickets}`);
  console.log(`\nTop 10 holders:`);
  holders.slice(0, 10).forEach((h, i) =>
    console.log(`  ${i + 1}. ${h.owner.slice(0, 12)}... — ${(h.amount / 1e6).toLocaleString()} $POKE (${h.tickets} tickets)`)
  );

  if (holders.length === 0) {
    console.log("\nNo eligible holders. Aborting.");
    return;
  }

  // 3. Get slot hash for verifiable randomness
  const slot = await conn.getSlot();
  const block = await conn.getBlock(slot - 1, { maxSupportedTransactionVersion: 0, rewards: false, transactionDetails: "none" });
  const slotHash = createHash("sha256").update(block.blockhash).update(Buffer.from(ROUND.toString())).digest();

  console.log(`\nSlot: ${slot - 1}`);
  console.log(`Blockhash: ${block.blockhash}`);
  console.log(`Seed hash: ${slotHash.toString("hex")}`);

  // 4. Pick winner
  // Use first 8 bytes of hash as u64, mod totalTickets
  const hashNum = slotHash.readBigUInt64LE(0);
  const winningTicket = Number(hashNum % BigInt(totalTickets));

  let cumulative = 0;
  let winner = null;
  for (const h of holders) {
    cumulative += h.tickets;
    if (winningTicket < cumulative) {
      winner = h;
      break;
    }
  }

  console.log(`\nWinning ticket: #${winningTicket} / ${totalTickets}`);
  console.log(`\n🎉 WINNER: ${winner.owner}`);
  console.log(`   Held: ${(winner.amount / 1e6).toLocaleString()} $POKE (${winner.tickets} tickets)`);
  console.log(`   Probability: ${((winner.tickets / totalTickets) * 100).toFixed(2)}%`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Skipping on-chain recording and prize fulfillment.");
    return;
  }

  // 5. Record on-chain
  console.log("\nRecording on-chain...");
  const disc = createHash("sha256").update("global:record_raffle").digest().slice(0, 8);

  const prizeStr = "$50 Elite Pokemon Gacha Pack";
  const prizeBytes = Buffer.alloc(64);
  Buffer.from(prizeStr).copy(prizeBytes);

  const data = Buffer.alloc(8 + 4 + 32 + 8 + 4 + 8 + 32 + 64);
  let offset = 0;
  disc.copy(data, offset); offset += 8;
  data.writeUInt32LE(ROUND, offset); offset += 4;
  new PublicKey(winner.owner).toBuffer().copy(data, offset); offset += 32;
  data.writeBigUInt64LE(BigInt(totalTickets), offset); offset += 8;
  data.writeUInt32LE(holders.length, offset); offset += 4;
  data.writeBigUInt64LE(BigInt(winner.tickets), offset); offset += 8;
  slotHash.copy(data, offset); offset += 32;
  prizeBytes.copy(data, offset); offset += 64;

  const [rafflePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("raffle"), Buffer.from(new Uint32Array([ROUND]).buffer)],
    PROGRAM_ID
  );

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: adminKp.publicKey, isSigner: true, isWritable: true },
      { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
      { pubkey: rafflePda, isSigner: false, isWritable: true },
      { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
    ],
    data,
  });

  const { blockhash } = await conn.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: adminKp.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([adminKp]);

  const sig = await conn.sendTransaction(tx, { skipPreflight: false });
  await conn.confirmTransaction(sig, "confirmed");
  console.log(`Recorded on-chain: ${sig}`);
  console.log(`Raffle PDA: ${rafflePda.toBase58()}`);

  // 6. Fulfill gacha prize
  console.log("\nFulfilling gacha prize...");
  try {
    const CC_BASE = "https://gacha.collectorcrypt.com/api";
    const secondaryPath = process.env.SECONDARY_KEY || "/root/keeper/secondary.json";
    const secondaryKp = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(secondaryPath, "utf8"))));

    const genRes = await fetch(`${CC_BASE}/generatePack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerAddress: secondaryKp.publicKey.toBase58(),
        packType: "pokemon_50",
        altPlayerAddress: winner.owner,
      }),
    });
    const genData = await genRes.json();
    if (!genData.transaction) throw new Error("generatePack failed: " + JSON.stringify(genData).slice(0, 200));

    const { Transaction: LegacyTx } = require("@solana/web3.js");
    const packTx = LegacyTx.from(Buffer.from(genData.transaction, "base64"));
    packTx.partialSign(secondaryKp);
    const serialized = packTx.serialize().toString("base64");

    const submitRes = await fetch(`${CC_BASE}/submitTransaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedTransaction: serialized }),
    });
    const submitData = await submitRes.json();
    if (!submitData.signature) throw new Error("submitTransaction failed: " + JSON.stringify(submitData).slice(0, 200));
    console.log("Pack TX:", submitData.signature);

    // Wait and open
    await new Promise(r => setTimeout(r, 5000));
    const openRes = await fetch(`${CC_BASE}/openPack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memo: genData.memo }),
    });
    const openData = await openRes.json();
    console.log("Pack opened! NFT:", openData.nft_address || "pending");
  } catch (e) {
    console.error("Gacha fulfillment failed:", e.message);
    console.log("Winner will need manual fulfillment.");
  }

  console.log("\n✅ Raffle #" + ROUND + " complete!");
}

main().catch(e => { console.error(e); process.exit(1); });

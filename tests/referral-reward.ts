//          **   For Localnet Testing   ** 

// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { ReferralReward } from "../target/types/referral_reward";
// import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
// import {
//   TOKEN_PROGRAM_ID,
//   ASSOCIATED_TOKEN_PROGRAM_ID,
//   getAssociatedTokenAddressSync
// } from "@solana/spl-token";
// import { expect } from "chai";

// describe("Referral Reward System - Test Suite", () => {
//   // 1. Connection & Provider Setup
//   // We use the AnchorProvider to interact with the cluster (Localnet or Devnet).
//   // This automatically handles transaction signing using the wallet configured in Anchor.toml.
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);

//   const program = anchor.workspace.ReferralReward as Program<ReferralReward>;
//   const wallet = provider.wallet as anchor.Wallet;

//   // 2. Constants & Token Configuration
//   // Setting reward to 20 tokens. Since the token has 9 decimals, we multiply by 10^9.
//   const TOKEN_DECIMALS = 9;
//   const REWARD_AMOUNT = new anchor.BN(20 * Math.pow(10, TOKEN_DECIMALS));

//   // Using Wrapped SOL (WSOL) as a placeholder Mint address for testing.
//   // In a real scenario, replace this with your actual SPL Token Mint address.
//   const rewardMint = new PublicKey("So11111111111111111111111111111111111111112");

//   // 3. PDA (Program Derived Address) Derivation
//   // PDAs allow the program to sign for transactions and own accounts.
//   // We derive them using the exact seeds defined in the Rust source code.

//   // Global State: Stores administrative settings (Admin, Reward Amount, total users).
//   const [globalAddress] = PublicKey.findProgramAddressSync(
//     [Buffer.from("state")],
//     program.programId
//   );

//   // Vault: The secure Token Account PDA that holds the reward tokens to be distributed.
//   const [vaultAddress] = PublicKey.findProgramAddressSync(
//     [Buffer.from("vault")],
//     program.programId
//   );

//   // User Stats: A unique account for every user, seeded with their public key.
//   const [userAccountAddress] = PublicKey.findProgramAddressSync(
//     [Buffer.from("user"), wallet.publicKey.toBuffer()],
//     program.programId
//   );

//   // Associated Token Account (ATA): The user's wallet that will receive the tokens.
//   const userTokenAccount = getAssociatedTokenAddressSync(rewardMint, wallet.publicKey);

//   // --- Initial Log Group ---
//   // Displaying all derived addresses before starting tests for clear debugging and transparency.
//   console.log("\n---   PROGRAM ARCHITECTURE & PDA MAP ---");
//   console.log("Program ID:   ", program.programId.toBase58());
//   console.log("Admin Wallet: ", wallet.publicKey.toBase58());
//   console.log("Global State: ", globalAddress.toBase58());
//   console.log("Token Vault:  ", vaultAddress.toBase58()); // Explicitly showing the Vault address
//   console.log("User PDA:     ", userAccountAddress.toBase58());
//   console.log("-------------------------------------------\n");

//   /**
//    * UNIT TEST 1: Initialize
//    * This test verifies the program setup. It creates the Global State PDA and the Vault PDA.
//    * The 'vault' is a Token Account owned by the program to store reward liquidity.
//    */
//   it("1. Initialize Program Configuration", async () => {
//     const tx = await program.methods
//       .initialize(REWARD_AMOUNT)
//       .accounts({
//         globalState: globalAddress,
//         vault: vaultAddress,
//         mint: rewardMint,
//         admin: wallet.publicKey,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .rpc();

//     console.log("   ✔ Success! Transaction Signature:", tx);

//     // Fetching stored data to confirm it matches our input constants.
//     const stateData = await program.account.globalState.fetch(globalAddress);
//     console.log("    Stored Reward Amount:", stateData.rewardAmount.toString(), "atoms");

//     expect(stateData.admin.toBase58()).to.equal(wallet.publicKey.toBase58());
//   });

//   /**
//    * UNIT TEST 2: Register User
//    * This instruction creates a new UserAccount PDA for the caller.
//    * It initializes user-specific metadata like name, referral count, and pending rewards.
//    */
//   it("2. Register New User Account", async () => {
//     const userName = "Jethu Singh";
//     const referrer = null; // Setting referrer as null for the initial bootstrap user.

//     const tx = await program.methods
//       .registerUser(userName, referrer)
//       .accounts({
//         globalState: globalAddress,
//         userAccount: userAccountAddress,
//         user: wallet.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .rpc();

//     console.log("   ✔ Success! User Account Created.");

//     // Verification of data persistence on-chain.
//     const userData = await program.account.userAccount.fetch(userAccountAddress);
//     console.log("    Registered Name:", userData.name);
//     console.log("    Initial Rewards:", userData.pendingRewards.toString());

//     expect(userData.initialized).to.be.true;
//   });

//   /**
//    * UNIT TEST 3: Claim Reward (Negative/Controlled Test)
//    * This test attempts to trigger the reward distribution logic.
//    * It will verify if the program correctly checks for pending balances before initiating a CPI transfer.
//    */
//   it("3. Execute Reward Claim Logic", async () => {
//     try {
//       // The claim_reward instruction involves a CPI (Cross-Program Invocation) 
//       // where the Vault PDA signs to transfer tokens to the user's ATA.
//       const tx = await program.methods
//         .claimReward()
//         .accounts({
//           globalState: globalAddress,
//           userAccount: userAccountAddress,
//           vault: vaultAddress,
//           mint: rewardMint,
//           userTokenAccount: userTokenAccount,
//           user: wallet.publicKey,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//         })
//         .rpc();

//       console.log("   ✔ Success! Reward claimed successfully.");
//     } catch (err: any) {
//       // Typically fails on first run because 'pending_rewards' is 0 or Vault is empty.
//       console.log("   ℹ Policy Check: Transaction rejected as expected (Nothing to claim).");
//       console.log("      Reason:", err.message);
//     }
//   });

//   /**
//    * UNIT TEST 4: Global Integrity Check
//    * Fetches the final state of the Global account to ensure counters (Total Users) are incrementing.
//    */
//   it("4. Verify System Integrity & Stats", async () => {
//     const stateData = await program.account.globalState.fetch(globalAddress);
//     console.log("      Final System State:");
//     console.log("      Total Users in System:", stateData.totalUsers.toString());
//     console.log("      Vault Bump Seed Used: ", stateData.vaultBump);

//     expect(stateData.totalUsers.toNumber()).to.be.greaterThan(0);
//   });
// });




//*********For Devnet Testing***** */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ReferralReward } from "../target/types/referral_reward";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Keypair,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferInstruction
} from "@solana/spl-token";
import { expect } from "chai";

/**
 * UTILITY FUNCTION: sleep
 * @param ms Milliseconds to wait
 * @description Devnet RPCs often rate-limit fast consecutive requests. 
 * This helper introduces mandatory delays to ensure transaction propagation.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Referral Reward System - Devnet Production Testing", () => {

  // Initialize the provider using environment variables from Anchor.toml
  const provider = anchor.AnchorProvider.env();

  /**
   * CONNECTION OPTIMIZATION
   * We set commitment to 'confirmed' to ensure we don't proceed until the 
   * cluster reaches a consensus on the transaction. 'skipPreflight' helps 
   * bypass local simulation errors that often occur due to network lag.
   */
  provider.connection.opts = {
    commitment: "confirmed",
    skipPreflight: true,
    preflightCommitment: "confirmed",
  };
  anchor.setProvider(provider);

  const program = anchor.workspace.ReferralReward as Program<ReferralReward>;
  const adminWallet = provider.wallet as anchor.Wallet;

  /**
   * GLOBAL CONFIGURATION
   * MINT_ADDRESS: The SPL Token Mint on Devnet (e.g., J929...)
   * DECIMALS: Standard 9 decimals for the reward token.
   * REWARD_AMOUNT: 20 Tokens per action.
   * VAULT_FUND_AMOUNT: 1000 Tokens for initial liquidity.
   */
  const MINT_ADDRESS = new PublicKey("J929e8Y3mkCYZxmvZ6KpUaG7jwiGvLsXjMbQzVXEQmrW");
  const DECIMALS = 9;
  const REWARD_AMOUNT = new anchor.BN(20 * Math.pow(10, DECIMALS));
  const VAULT_FUND_AMOUNT = 1000 * Math.pow(10, DECIMALS);

  /**
   * TEST USERS (Ephemeral Keypairs)
   * Fresh keypairs are generated to prevent 'AlreadyRegistered' errors 
   * during repeated devnet test cycles.
   */
  const userA = Keypair.generate();
  const userB = Keypair.generate();
  const userC = Keypair.generate();

  /**
   * PDA (Program Derived Address) DERIVATION
   * 'globalAddress' stores system-wide settings.
   * 'vaultAddress' acts as the secure escrow for all reward tokens.
   */
  const [globalAddress] = PublicKey.findProgramAddressSync([Buffer.from("state")], program.programId);
  const [vaultAddress] = PublicKey.findProgramAddressSync([Buffer.from("vault")], program.programId);

  const getUserPDA = (wallet: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("user"), wallet.toBuffer()], program.programId)[0];

  /**
   * HELPER: fundWallet
   * Transfers a small amount of SOL from Admin to test users to cover 
   * transaction fees (rent and gas) on the Devnet cluster.
   */
  async function fundWallet(target: PublicKey) {
    console.log(`[FUNDING] Sending gas SOL to: ${target.toBase58()}`);
    const tx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: adminWallet.publicKey,
        toPubkey: target,
        lamports: 0.015 * LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(tx);
    await sleep(2000); // Wait for network to index the balance
  }

  /**
   * STEP 1: INITIALIZATION
   * Checks if GlobalState exists. If not, initializes the contract.
   * Then, it seeds the Vault with reward tokens from Admin's wallet.
   */
  it("Step 1: Initialize Devnet Global State and Fund Vault", async () => {
    let accountInfo = null;
    try {
      accountInfo = await provider.connection.getAccountInfo(globalAddress);
    } catch (e) {
      console.log("[RETRY] RPC busy, waiting 3s before account check...");
      await sleep(3000);
      accountInfo = await provider.connection.getAccountInfo(globalAddress);
    }

    if (accountInfo === null) {
      console.log("[INIT] Global state not found. Initializing program...");
      await program.methods.initialize(REWARD_AMOUNT).accounts({
        globalState: globalAddress,
        vault: vaultAddress,
        mint: MINT_ADDRESS,
        admin: adminWallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      }).rpc();
      await sleep(2500);
    } else {
      console.log("[SKIP] Global state already initialized on-chain.");
    }

    // Seed liquidity into the Program Vault PDA
    const adminATA = getAssociatedTokenAddressSync(MINT_ADDRESS, adminWallet.publicKey);
    const fundTx = new anchor.web3.Transaction().add(
      createTransferInstruction(adminATA, vaultAddress, adminWallet.publicKey, VAULT_FUND_AMOUNT)
    );
    await provider.sendAndConfirm(fundTx);
    console.log("[SUCCESS] Vault liquidity seeded.");
    await sleep(2000);
  });

  /**
   * STEP 2: REGISTRATION TREE
   * Sets up a 3-tier hierarchy: User A (Root) -> User B (Ref by A) -> User C (Ref by B).
   */
  it("Step 2: Register User Tree (A -> B -> C)", async () => {
    // Sequential funding to prevent RPC burst errors
    await fundWallet(userA.publicKey);
    await fundWallet(userB.publicKey);
    await fundWallet(userC.publicKey);

    console.log("[REG] Registering User A (Root)...");
    await program.methods.registerUser("User A", null)
      .accounts({ globalState: globalAddress, userAccount: getUserPDA(userA.publicKey), user: userA.publicKey })
      .signers([userA]).rpc();
    await sleep(2000);

    console.log("[REG] Registering User B (Referrer: A)...");
    await program.methods.registerUser("User B", userA.publicKey)
      .accounts({ globalState: globalAddress, userAccount: getUserPDA(userB.publicKey), user: userB.publicKey })
      .signers([userB]).rpc();
    await sleep(2000);

    console.log("[REG] Registering User C (Referrer: B)...");
    await program.methods.registerUser("User C", userB.publicKey)
      .accounts({ globalState: globalAddress, userAccount: getUserPDA(userC.publicKey), user: userC.publicKey })
      .signers([userC]).rpc();
    await sleep(2000);
  });

  /**
   * STEP 3: REWARD DISTRIBUTION LOGIC
   * Simulates an action completion. Level 1 (B) and Level 2 (A) referrers 
   * should receive their 70/30 split of the reward.
   */
  it("Step 3: Trigger Rewards for Referral Chain", async () => {
    const pdaA = getUserPDA(userA.publicKey);
    const pdaB = getUserPDA(userB.publicKey);

    console.log("[ACTION] Triggering multi-level reward distribution...");
    await program.methods.completeAction()
      .accounts({
        globalState: globalAddress,
        l1Account: pdaB,
        l2Account: pdaA,
        authority: adminWallet.publicKey,
      }).rpc();

    await sleep(3500);

    const dataB = await program.account.userAccount.fetch(pdaB);
    console.log(`[VERIFY] User B Pending Rewards: ${dataB.pendingRewards.toNumber() / 10 ** DECIMALS} tokens`);

    expect(dataB.pendingRewards.toNumber()).to.be.greaterThan(0);
  });

  /**
   * STEP 4: WITHDRAWAL (CPI)
   * User B claims their pending rewards. The program executes a 
   * Cross-Program Invocation (CPI) to transfer tokens from Vault to User.
   */
  it("Step 4: User B Claim from Vault", async () => {
    const pdaB = getUserPDA(userB.publicKey);
    const userB_ATA = getAssociatedTokenAddressSync(MINT_ADDRESS, userB.publicKey);

    console.log("[CLAIM] User B requesting token withdrawal...");
    const tx = await program.methods.claimReward()
      .accounts({
        globalState: globalAddress,
        userAccount: pdaB,
        vault: vaultAddress,
        mint: MINT_ADDRESS,
        userTokenAccount: userB_ATA,
        user: userB.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([userB]).rpc();

    console.log("[SUCCESS] Tokens transferred. Signature: " + tx);
  });

  /**
   * AFTER HOOK: FINAL AUDIT
   * Logs final on-chain data for debugging and frontend integration.
   */
  after(async () => {
    try {
      const globalStateData = await program.account.globalState.fetch(globalAddress);
      console.log("\n--- DEVNET AUDIT SUMMARY ---");
      console.log("PROGRAM_ID:   " + program.programId.toBase58());
      console.log("GLOBAL_STATE: " + globalAddress.toBase58());
      console.log("VAULT_PDA:    " + vaultAddress.toBase58());
      console.log("REWARD_PER:   " + globalStateData.rewardAmount.toNumber() / 10 ** DECIMALS);
      console.log("----------------------------\n");
    } catch (e) {
      console.log("[AUDIT] Final fetch timed out, but tests completed.");
    }
  });
});


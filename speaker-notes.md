# Video Demo Speaker Notes (2 Minutes)

## Phase 1: Product Discovery & Data Extraction (25 seconds)

**[Show Amazon product page with extension]**
"Our Chrome extension detects products supported by our oracle. When I click 'Insure', the extension automatically extracts the order hash, purchase price, date, and product ID from the Amazon invoice."

**Behind the scenes:** Extension parses DOM to extract invoice data, then uses `ethers.keccak256()` to hash the order number and `buildPoseidon()` to create a product hash - exactly like lines 86-94 in `purchasePolicy.ts`.

## Phase 2: Commitment Generation & Policy Purchase (30 seconds)

**[Show web app - wallet connection and tier selection]**
"In our web app, I connect my wallet. The system calculates I need Tier 1 coverage for this $91.19 Citizen watch - that's a $1 premium based on our fixed tier structure."

**Behind the scenes:** The crucial privacy step happens here. The system generates a Poseidon commitment hash from 6 inputs: `orderHash + invoicePrice + invoiceDate + productHash + randomSalt + selectedTier`. Only this commitment hash gets stored on-chain - never the raw purchase data.

**[Show transaction confirmation]**
"Policy purchased! The `InsuranceVault.sol` contract validates my $1 premium matches Tier 1 requirements and stores only the commitment hash. Complete privacy achieved."

## Phase 3: Oracle Price Monitoring (20 seconds)

**[Trigger oracle price update]**
"Now I'll simulate a price drop - triggering our oracle to drop the Citizen watch price from $91.19 to $72.95. The oracle rebuilds its merkle tree with new prices and updates the root hash on-chain."

**Behind the scenes:** Oracle uses the 4-level merkle tree from `merkleTree.circom`. Each leaf is `Poseidon(productHash, currentPrice)`. The tree reconstruction uses binary path indices where our product at position 0 gets path `[0,0,0,0]` - all left branches up to the root. EIP-4844 blobs store the complete tree data for 90% cost savings.

## Phase 4: ZK Proof Generation & Claim (45 seconds)

**[Show claim interface]**
"Time to claim my $18.24 savings! When I click 'Claim', the system fetches a merkle proof from the oracle and begins generating a zero-knowledge proof."

**Behind the scenes:** The `claimPolicy.ts` script creates circuit inputs proving:

- My commitment hash is valid (I have a real policy)
- Current $72.95 price exists in the oracle's merkle tree
- Original price $91.19 > current price $72.95 (legitimate 20% drop)
- I paid the correct $1 premium for Tier 1
- Purchase happened before policy start date

The circuit from `priceProtection.circom` validates all 5 conditions using 64-bit arithmetic and binary constraints, then outputs the $18.24 payout amount.

**[Show transaction submission]**
"Proof generated! The smart contract's `claimPayout()` function verifies the Groth16 proof on-chain. If all circuit outputs equal 1, it automatically transfers $18.24 USDC to my wallet."

**[Show successful payout]**
"Claim successful! I've received exactly $18.24 - the difference between my purchase price and today's price. The entire process was trustless, automatic, and completely private. Nobody knows I bought a Citizen watch or what I originally paid."

## Technical Innovation Highlight (20 seconds)

"What you just saw combines three cutting-edge technologies: Groth16 ZK proofs for mathematical privacy guarantees, Poseidon hashing for efficient commitment schemes, and EIP-4844 blobs for 90% cheaper oracle operations. RIP is the first protocol to integrate all three for real-world e-commerce price protection."

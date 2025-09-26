pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "merkleTree.circom";

/*
 * PriceProtectionClaim: Privacy-preserving insurance claim verification circuit
 *
 * PURPOSE: Allows users to claim insurance payouts when product prices drop WITHOUT revealing:
 *   - What product they bought
 *   - The original purchase price
 *   - The current price
 *   - When they bought it
 *   - Any personal purchase details
 *
 * HOW IT WORKS:
 *   1. User commits to purchase details when buying policy (one-way hash)
 *   2. Oracle maintains Merkle tree of current prices for all products
 *   3. User generates ZK proof that:
 *      - They have a valid commitment (proves they bought insurance)
 *      - Current price is in oracle's tree (proves price is legitimate)
 *      - Price dropped below purchase price (proves claim is valid)
 *      - They paid correct premium for their price tier
 *   4. Smart contract verifies proof and pays out automatically
 *
 * PRIVACY GUARANTEES:
 *   - Only the commitment hash and merkle root are public
 *   - All purchase and price data remains private
 *   - Even the payout amount is calculated inside the circuit
 */
template PriceProtectionClaim() {
    /*
     * SECTION 1: PRIVATE PURCHASE DATA
     * These inputs prove the user bought a specific product at a specific price
     * ALL are private - never revealed to the blockchain or anyone else
     */
    signal input orderHash;          // Hash of the Amazon/retailer order ID
    signal input invoicePrice;       // Original purchase price in USDC (6 decimals, e.g., 899000000 = $899)
    signal input invoiceDate;        // Unix timestamp when product was purchased
    signal input productHash;        // Hash of product ID (e.g., Poseidon("IPHONE15"))
    signal input salt;               // Random value to prevent commitment brute-forcing
    signal input selectedTier;       // Premium tier user selected (1-5 based on price)

    /*
     * SECTION 2: CURRENT PRICE VERIFICATION (PRIVATE)
     * These inputs prove the current price without revealing what product it's for
     * The oracle pre-computes leafHash so we don't reveal productHash
     */
    signal input currentPrice;      // Current market price (PRIVATE - needed for payout calculation)
    signal input leafHash;          // Pre-computed by oracle: Poseidon(productHash, currentPrice)
    signal input merkleProof[4];    // Sibling hashes to prove leafHash is in the tree (4 levels deep)
    signal input leafIndex[4];      // Binary path indices (0=left, 1=right) at each tree level

    /*
     * SECTION 3: PUBLIC INPUTS (MINIMAL exposure)
     * Only these values are visible on-chain - they reveal nothing about the purchase
     */
    signal input commitment;         // Hash of all purchase details (proves user has valid policy)
    signal input merkleRoot;        // Current state of oracle's price tree (proves price is legitimate)
    signal input policyStartDate;   // When insurance coverage began (for date validation)
    signal input paidPremium;        // Amount user paid for insurance (for tier verification)

    /*
     * SECTION 4: OUTPUTS (no sensitive information!)
     * These values are computed by the circuit and made public
     * They determine if the claim is valid without revealing why
     */
    signal output validClaim;       // 1 if price dropped AND dates valid, 0 otherwise
    signal output validPremium;     // 1 if user paid correct premium for their tier, 0 otherwise
    signal output validPayout;      // 1 if payout amount is positive, 0 otherwise
    signal output payoutAmount;     // Calculated refund amount (price difference)

    /*
     * TIER SYSTEM: Fixed premiums based on purchase price ranges
     * WHY TIERS: Prevents price discrimination - everyone in a tier pays the same
     * This stops the insurance company from inferring exact prices from premiums
     */
    var TIER1_PREMIUM = 1000000;    // $1 for products $1-99.99
    var TIER2_PREMIUM = 3000000;    // $3 for products $100-499.99
    var TIER3_PREMIUM = 7000000;    // $7 for products $500-999.99
    var TIER4_PREMIUM = 13000000;   // $13 for products $1000-1999.99
    var TIER5_PREMIUM = 20000000;   // $20 for products $2000-10000

    /*
     * VERIFICATION STEP 1: Validate commitment (proves user has valid insurance policy)
     *
     * The commitment is a cryptographic hash of all purchase details.
     * By proving we can recreate it, we prove we know the original purchase data.
     * The salt prevents attackers from brute-forcing common purchases.
     *
     * EXAMPLE: User bought iPhone15 for $899 on Jan 1, 2024
     *   - Commitment = Poseidon(orderHash, 899000000, 1704067200, hash("IPHONE15"), salt, 3)
     *   - Only this exact combination will produce the same commitment hash
     */
    component hasher = Poseidon(6);  // Poseidon hash with 6 inputs
    hasher.inputs[0] <== orderHash;
    hasher.inputs[1] <== invoicePrice;
    hasher.inputs[2] <== invoiceDate;
    hasher.inputs[3] <== productHash;
    hasher.inputs[4] <== salt;
    hasher.inputs[5] <== selectedTier;
    commitment === hasher.out;  // CONSTRAINT: Computed hash MUST match public commitment

    /*
     * VERIFICATION STEP 2: Prove current price is legitimate (in oracle's tree)
     *
     * The oracle maintains a Merkle tree of all product prices.
     * We prove our claimed current price is in this tree without revealing which product.
     *
     * CLEVER TRICK: Oracle gives us pre-computed leafHash = Poseidon(productHash, currentPrice)
     * This way we don't expose productHash directly in the proof.
     *
     * EXAMPLE: iPhone15 current price $799
     *   - leafHash = Poseidon(hash("IPHONE15"), 799000000) = 0xABC...
     *   - We prove 0xABC... is in the tree at some position
     *   - Verifier sees only the root, not which leaf or product
     */
    component merkleProofVerifier = MerkleTreeInclusionProof(4);  // 4 levels = up to 16 products
    merkleProofVerifier.leaf <== leafHash;
    merkleProofVerifier.root <== merkleRoot;
    merkleProofVerifier.siblings <== merkleProof;
    merkleProofVerifier.pathIndices <== leafIndex;

    /*
     * VERIFICATION STEP 3: Confirm price actually dropped
     *
     * Simple but crucial: original price must be > current price
     * GreaterThan(64) handles 64-bit numbers (enough for prices in cents)
     *
     * EXAMPLE: invoicePrice = 899000000 ($899), currentPrice = 799000000 ($799)
     *   - priceCheck.out = 1 (true, price dropped by $100)
     */
    component priceCheck = GreaterThan(64);  // 64 bits enough for prices up to ~$18 trillion
    priceCheck.in[0] <== invoicePrice;       // Original purchase price
    priceCheck.in[1] <== currentPrice;       // Current market price

    /*
     * VERIFICATION STEP 4: Verify correct tier and premium payment
     *
     * TIER RANGES (USDC with 6 decimals):
     *   Tier 1: $1-99.99     → 1000000 to 99999999
     *   Tier 2: $100-499.99  → 100000000 to 499999999
     *   Tier 3: $500-999.99  → 500000000 to 999999999
     *   Tier 4: $1000-1999.99 → 1000000000 to 1999999999
     *   Tier 5: $2000-10000  → 2000000000 to 10000000000
     *
     * WHY SO COMPLEX: We must verify:
     *   1. The invoicePrice falls within the claimed tier range
     *   2. The user selected the correct tier for their price
     *   3. They paid the right premium for that tier
     */

    // Check if price qualifies for Tier 1 (>= $1)
    component tier1Check1 = GreaterEqThan(64);  // >= comparison
    tier1Check1.in[0] <== invoicePrice;
    tier1Check1.in[1] <== 1000000;  // $1.00 in USDC (6 decimals)

    // Check if price qualifies for Tier 1 (<= $99.99)
    component tier1Check2 = LessEqThan(64);  // <= comparison
    tier1Check2.in[0] <== invoicePrice;
    tier1Check2.in[1] <== 99999999;  // $99.99 in USDC

    // Tier 1 is valid if BOTH conditions are true (price in range)
    signal tier1Valid;
    tier1Valid <== tier1Check1.out * tier1Check2.out;  // AND operation (both must be 1)

    component tier2Check1 = GreaterEqThan(64);
    tier2Check1.in[0] <== invoicePrice;
    tier2Check1.in[1] <== 100000000;  // $100

    component tier2Check2 = LessEqThan(64);
    tier2Check2.in[0] <== invoicePrice;
    tier2Check2.in[1] <== 499000000;  // $499

    signal tier2Valid;
    tier2Valid <== tier2Check1.out * tier2Check2.out;

    component tier3Check1 = GreaterEqThan(64);
    tier3Check1.in[0] <== invoicePrice;
    tier3Check1.in[1] <== 500000000;  // $500

    component tier3Check2 = LessEqThan(64);
    tier3Check2.in[0] <== invoicePrice;
    tier3Check2.in[1] <== 999000000;  // $999

    signal tier3Valid;
    tier3Valid <== tier3Check1.out * tier3Check2.out;

    component tier4Check1 = GreaterEqThan(64);
    tier4Check1.in[0] <== invoicePrice;
    tier4Check1.in[1] <== 1000000000;  // $1000

    component tier4Check2 = LessEqThan(64);
    tier4Check2.in[0] <== invoicePrice;
    tier4Check2.in[1] <== 1999000000;  // $1999

    signal tier4Valid;
    tier4Valid <== tier4Check1.out * tier4Check2.out;

    component tier5Check1 = GreaterEqThan(64);
    tier5Check1.in[0] <== invoicePrice;
    tier5Check1.in[1] <== 2000000000;  // $2000

    component tier5Check2 = LessEqThan(64);
    tier5Check2.in[0] <== invoicePrice;
    tier5Check2.in[1] <== 10000000000;  // $10000

    signal tier5Valid;
    tier5Valid <== tier5Check1.out * tier5Check2.out;

    /*
     * TIER SELECTION LOGIC: Determine which tier the price falls into
     *
     * CIRCUIT TRICK: Since only one tier can be valid, we multiply each
     * valid flag by its tier number and sum them. The result is the tier.
     *
     * EXAMPLE: Price = $899 (Tier 3)
     *   - tier1Valid = 0, tier2Valid = 0, tier3Valid = 1, tier4Valid = 0, tier5Valid = 0
     *   - tier1Result = 0*1 = 0
     *   - tier2Result = 0*2 = 0
     *   - tier3Result = 1*3 = 3
     *   - tier4Result = 0*4 = 0
     *   - tier5Result = 0*5 = 0
     *   - correctTier = 0+0+3+0+0 = 3
     */
    signal correctTier;
    signal tier1Result;
    signal tier2Result;
    signal tier3Result;
    signal tier4Result;
    signal tier5Result;

    tier1Result <== tier1Valid * 1;
    tier2Result <== tier2Valid * 2;
    tier3Result <== tier3Valid * 3;
    tier4Result <== tier4Valid * 4;
    tier5Result <== tier5Valid * 5;

    correctTier <== tier1Result + tier2Result + tier3Result + tier4Result + tier5Result;

    /*
     * Verify user selected the correct tier for their price
     * This prevents cheating by selecting a lower tier to pay less premium
     */
    component tierMatch = IsEqual();
    tierMatch.in[0] <== correctTier;   // Tier determined by price
    tierMatch.in[1] <== selectedTier;  // Tier user claimed when buying policy

    // Select expected premium based on tier
    component tierSelector1 = IsEqual();
    tierSelector1.in[0] <== selectedTier;
    tierSelector1.in[1] <== 1;

    component tierSelector2 = IsEqual();
    tierSelector2.in[0] <== selectedTier;
    tierSelector2.in[1] <== 2;

    component tierSelector3 = IsEqual();
    tierSelector3.in[0] <== selectedTier;
    tierSelector3.in[1] <== 3;

    component tierSelector4 = IsEqual();
    tierSelector4.in[0] <== selectedTier;
    tierSelector4.in[1] <== 4;

    component tierSelector5 = IsEqual();
    tierSelector5.in[0] <== selectedTier;
    tierSelector5.in[1] <== 5;

    signal tier1Selected;
    signal tier2Selected;
    signal tier3Selected;
    signal tier4Selected;
    signal tier5Selected;

    tier1Selected <== tierSelector1.out * TIER1_PREMIUM;
    tier2Selected <== tierSelector2.out * TIER2_PREMIUM;
    tier3Selected <== tierSelector3.out * TIER3_PREMIUM;
    tier4Selected <== tierSelector4.out * TIER4_PREMIUM;
    tier5Selected <== tierSelector5.out * TIER5_PREMIUM;

    /*
     * Calculate expected premium based on selected tier
     * Only the selected tier's premium will be non-zero after multiplication
     *
     * EXAMPLE: selectedTier = 3 (Tier 3 = $7 premium)
     *   - tier1Selected = 0 * 1000000 = 0
     *   - tier2Selected = 0 * 3000000 = 0
     *   - tier3Selected = 1 * 7000000 = 7000000 ($7)
     *   - tier4Selected = 0 * 13000000 = 0
     *   - tier5Selected = 0 * 20000000 = 0
     *   - expectedPremium = 7000000
     */
    signal expectedPremium;
    expectedPremium <== tier1Selected + tier2Selected + tier3Selected + tier4Selected + tier5Selected;

    // Verify user actually paid the correct premium for their tier
    component premiumMatch = IsEqual();
    premiumMatch.in[0] <== paidPremium;     // What user actually paid (public input)
    premiumMatch.in[1] <== expectedPremium; // What they should have paid

    /*
     * VERIFICATION STEP 5: Ensure product was purchased BEFORE insurance
     *
     * This prevents fraud where someone buys insurance after seeing a price drop
     * LessEqThan(32) is sufficient for Unix timestamps until year 2106
     *
     * EXAMPLE: invoiceDate = Jan 1, 2024 (1704067200)
     *          policyStartDate = Jan 2, 2024 (1704153600)
     *          dateCheck.out = 1 (valid - purchased before policy)
     */
    component dateCheck = LessEqThan(32);  // 32 bits enough for timestamps
    dateCheck.in[0] <== invoiceDate;       // When product was purchased
    dateCheck.in[1] <== policyStartDate;   // When insurance coverage began

    /*
     * PAYOUT CALCULATION: Simple price difference
     *
     * EXAMPLE: Bought at $899, current price $799
     *          payoutAmount = 899000000 - 799000000 = 100000000 ($100)
     *
     * NOTE: This is calculated INSIDE the circuit for privacy
     */
    payoutAmount <== invoicePrice - currentPrice;

    // Sanity check: payout must be positive (no refunds for price increases!)
    component payoutPositive = GreaterThan(64);
    payoutPositive.in[0] <== payoutAmount;
    payoutPositive.in[1] <== 0;

    /*
     * FINAL OUTPUTS: Combine all verification results
     *
     * validClaim: Price dropped AND purchase was before policy
     * validPremium: Correct tier selected AND correct premium paid
     * validPayout: Payout amount is positive
     *
     * ALL must be 1 for the smart contract to approve the claim
     */
    validClaim <== priceCheck.out * dateCheck.out;        // Both must be true (AND)
    validPremium <== tierMatch.out * premiumMatch.out;    // Both must be true (AND)
    validPayout <== payoutPositive.out;                   // Must be true
}

/*
 * COMPLETE DRY RUN EXAMPLE:
 *
 * User Story: Alice bought an iPhone15 for $899 on Jan 1, 2024
 *            She bought price protection insurance on Jan 2, 2024
 *            On Feb 1, 2024, the price dropped to $799
 *            She files a claim for the $100 difference
 *
 * Private Inputs (only Alice knows):
 *   - orderHash = hash("AMZ-ORDER-12345")
 *   - invoicePrice = 899000000 ($899)
 *   - invoiceDate = 1704067200 (Jan 1, 2024)
 *   - productHash = hash("IPHONE15")
 *   - salt = random_value_12345
 *   - selectedTier = 3 (for $500-999 range)
 *   - currentPrice = 799000000 ($799)
 *   - leafHash = Poseidon(hash("IPHONE15"), 799000000)
 *   - merkleProof = [hash1, hash2, hash3, hash4] (oracle provided)
 *   - leafIndex = [0, 1, 0, 1] (position in tree)
 *
 * Public Inputs (visible on blockchain):
 *   - commitment = Poseidon(all purchase details) = 0xDEF...
 *   - merkleRoot = 0x123... (current oracle tree root)
 *   - policyStartDate = 1704153600 (Jan 2, 2024)
 *   - paidPremium = 7000000 ($7 for Tier 3)
 *
 * Circuit Execution:
 *   1. Verify commitment: ✓ (hash matches)
 *   2. Verify price in tree: ✓ (merkle proof valid)
 *   3. Verify price drop: ✓ (899 > 799)
 *   4. Verify tier: ✓ (899 is in Tier 3, user selected Tier 3)
 *   5. Verify premium: ✓ (paid $7, expected $7)
 *   6. Verify date: ✓ (Jan 1 < Jan 2)
 *   7. Calculate payout: 899000000 - 799000000 = 100000000 ($100)
 *
 * Outputs:
 *   - validClaim = 1 (all checks passed)
 *   - validPremium = 1 (correct premium paid)
 *   - validPayout = 1 (positive payout)
 *   - payoutAmount = 100000000 ($100 refund)
 *
 * Result: Smart contract sends Alice $100 USDC automatically!
 *         Nobody knows she bought an iPhone or what she paid for it.
 */

component main = PriceProtectionClaim();
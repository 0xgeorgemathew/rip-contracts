pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template PriceProtectionClaim() {
    // Private inputs (kept secret)
    signal input orderHash;
    signal input invoiceDate;
    signal input salt;
    signal input selectedTier;     // NEW: Which tier (1, 2, or 3)

    // Public inputs (visible to verifier)
    signal input commitment;
    signal input invoicePrice; // Now PUBLIC - verified against commitment
    signal input productHash; // Now PUBLIC - verified against commitment
    signal input policyStartDate;
    signal input currentPrice; // Current price in 6 decimals (USDC format)
    signal input policyId;
    signal input paidPremium;      // NEW: Actual premium paid
    signal input purchaseCount;    // NEW: Policies sold at purchase

    signal output validClaim;
    signal output priceDifference; // Price difference in 6 decimals
    signal output validPremium;    // NEW: Premium validation output
    
    // Constants matching contract (USDC 6 decimals)
    signal TIER1_BASE <== 35000000;   // $35 in 6 decimals
    signal TIER2_BASE <== 65000000;   // $65 in 6 decimals
    signal TIER3_BASE <== 100000000;  // $100 in 6 decimals

    // Verify commitment (including selected tier)
    component hasher = Poseidon(6);
    hasher.inputs[0] <== orderHash;
    hasher.inputs[1] <== invoicePrice;
    hasher.inputs[2] <== invoiceDate;
    hasher.inputs[3] <== productHash;
    hasher.inputs[4] <== salt;
    hasher.inputs[5] <== selectedTier;  // Tier is part of commitment

    // Verify the commitment matches the hash of all inputs
    commitment === hasher.out;

    // Calculate dynamic factor (matches contract: 100 + policies/10)
    signal dynamicFactor;
    dynamicFactor <== 100 + purchaseCount / 10;

    // Calculate expected premium for each tier
    // Break down to avoid non-quadratic constraints
    signal tier1Premium;
    signal tier2Premium;
    signal tier3Premium;

    signal tier1Temp;
    signal tier2Temp;
    signal tier3Temp;

    tier1Temp <== TIER1_BASE * dynamicFactor;
    tier1Premium <== tier1Temp / 100;

    tier2Temp <== TIER2_BASE * dynamicFactor;
    tier2Premium <== tier2Temp / 100;

    tier3Temp <== TIER3_BASE * dynamicFactor;
    tier3Premium <== tier3Temp / 100;

    // Verify selected tier matches invoice price
    // Tier 1: <$500 (500000000 in 6 decimals)
    // Tier 2: $500-$1000 (500000000 to 1000000000)
    // Tier 3: >$1000 (>1000000000)

    component tier1Check = LessThan(64);
    tier1Check.in[0] <== invoicePrice;
    tier1Check.in[1] <== 500000000;

    component tier2Check1 = GreaterEqThan(64);
    tier2Check1.in[0] <== invoicePrice;
    tier2Check1.in[1] <== 500000000;

    component tier2Check2 = LessEqThan(64);
    tier2Check2.in[0] <== invoicePrice;
    tier2Check2.in[1] <== 1000000000;

    signal tier2Valid;
    tier2Valid <== tier2Check1.out * tier2Check2.out;

    component tier3Check = GreaterThan(64);
    tier3Check.in[0] <== invoicePrice;
    tier3Check.in[1] <== 1000000000;

    // Determine correct tier based on price
    signal correctTier;
    correctTier <== tier1Check.out * 1 + tier2Valid * 2 + tier3Check.out * 3;

    // Verify correct tier was selected
    component tierMatch = IsEqual();
    tierMatch.in[0] <== correctTier;
    tierMatch.in[1] <== selectedTier;

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

    // Break down into intermediate signals to avoid non-quadratic constraints
    signal tier1Selected;
    signal tier2Selected;
    signal tier3Selected;

    tier1Selected <== tierSelector1.out * tier1Premium;
    tier2Selected <== tierSelector2.out * tier2Premium;
    tier3Selected <== tierSelector3.out * tier3Premium;

    signal expectedPremium;
    signal tempSum;
    tempSum <== tier1Selected + tier2Selected;
    expectedPremium <== tempSum + tier3Selected;

    // Verify paid premium matches expected
    component premiumMatch = IsEqual();
    premiumMatch.in[0] <== paidPremium;
    premiumMatch.in[1] <== expectedPremium;

    validPremium <== tierMatch.out * premiumMatch.out;

    // Verify invoice date is BEFORE policy (product purchased before protection)
    component dateCheck = LessEqThan(32);
    dateCheck.in[0] <== invoiceDate;
    dateCheck.in[1] <== policyStartDate;
    dateCheck.out === 1;

    // Check if invoice price > current price (price dropped)
    component priceCheck = GreaterThan(64); // Increased bit width for 6-decimal precision
    priceCheck.in[0] <== invoicePrice;
    priceCheck.in[1] <== currentPrice;

    // Calculate price difference (always positive due to constraint)
    signal priceDrop;
    priceDrop <== invoicePrice - currentPrice;

    // All validations must pass
    signal allValid;
    allValid <== priceCheck.out * validPremium;

    // Output full price difference when valid, 0 when invalid
    priceDifference <== priceDrop * allValid;
    validClaim <== allValid;
}

component main {public [
    commitment,
    invoicePrice,
    productHash,
    policyStartDate,
    currentPrice,
    policyId,
    paidPremium,
    purchaseCount
]} = PriceProtectionClaim();
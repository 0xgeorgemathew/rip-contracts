pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template PriceProtectionClaim() {
    // Private inputs - Invoice data (simplified for hackathon)
    signal input order_number_hash; // Pre-hashed order number
    signal input invoice_price; // in cents to avoid decimals
    signal input invoice_date; // unix timestamp
    signal input asin_hash; // Pre-hashed ASIN
    signal input nonce; // random salt
    
    // Public inputs
    signal input commitment;
    signal input public_asin_hash;
    signal input policy_start_date;
    signal input current_oracle_price;
    signal input policy_id;
    
    // Output signals
    signal output valid_claim;
    signal output price_difference;
    
    // Step 1: Verify commitment matches hash of invoice data
    // Using Poseidon with 5 inputs - circomlib supports 1-16 inputs efficiently
    component commitment_hasher = Poseidon(5);
    commitment_hasher.inputs[0] <== order_number_hash;
    commitment_hasher.inputs[1] <== invoice_price;
    commitment_hasher.inputs[2] <== invoice_date;
    commitment_hasher.inputs[3] <== asin_hash;
    commitment_hasher.inputs[4] <== nonce;
    
    // Assert commitment matches
    commitment === commitment_hasher.out;
    
    // Step 2: Verify ASIN matches
    public_asin_hash === asin_hash;
    
    // Step 3: Verify date is after policy start
    // 32 bits supports dates up to year 2106 (2^32 = 4.3B seconds from epoch)
    component date_check = GreaterEqThan(32);
    date_check.in[0] <== invoice_date;
    date_check.in[1] <== policy_start_date;
    date_check.out === 1;
    
    // Step 4: Calculate price drop
    // 32 bits supports prices up to $42.9M in cents (2^32 = 4.3B cents)
    component price_check = GreaterThan(32);
    price_check.in[0] <== invoice_price;
    price_check.in[1] <== current_oracle_price;
    
    // Calculate difference if price dropped
    // IsZero outputs 1 if input is 0, used to create conditional logic
    component price_diff = IsZero();
    price_diff.in <== price_check.out - 1; // 0 if price dropped, 1 if not
    
    // If price dropped, calculate difference, else 0
    signal price_drop;
    price_drop <== invoice_price - current_oracle_price;
    // Multiply by price_check.out to zero out if no price drop
    price_difference <== price_drop * price_check.out;
    // valid_claim = 1 if invoice_price > current_oracle_price, 0 otherwise
    valid_claim <== price_check.out;
}

component main {public [commitment, public_asin_hash, policy_start_date, current_oracle_price, policy_id]} = PriceProtectionClaim();
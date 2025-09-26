pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";

/*
 * MerkleTreeInclusionProof: Proves that a leaf exists in a Merkle tree without revealing its position
 *
 * PURPOSE: This circuit enables privacy-preserving price verification. The oracle maintains a Merkle
 * tree of all product prices, and users can prove their product's current price is in the tree
 * without revealing WHICH product they're claiming for.
 *
 * WHY MERKLE TREES: They provide O(log n) proof size and verification time, making them efficient
 * for proving membership in large sets while maintaining privacy about the specific element.
 *
 * @param levels: The depth of the tree (e.g., 4 levels = up to 16 leaves)
 */
template MerkleTreeInclusionProof(levels) {
    // INPUTS (all private in ZK context - not revealed to verifier)
    signal input leaf;           // The hash we're proving exists (Poseidon(productId, currentPrice))
    signal input pathIndices[levels];  // Binary path: 0=sibling goes right, 1=sibling goes left
    signal input siblings[levels];     // The sibling hashes needed to reconstruct the path
    signal input root;                  // The public Merkle root we're proving against

    /*
     * CONSTRAINT 1: Ensure pathIndices are binary (must be 0 or 1)
     * WHY: In Circom, inputs can be any field element. We must constrain them to binary
     * to prevent malicious provers from using invalid paths (like pathIndices[i] = 2).
     * This ensures the path truly represents left/right decisions in the tree.
     */
    component binaryChecks[levels];
    for (var i = 0; i < levels; i++) {
        binaryChecks[i] = Num2Bits(1);  // Converts number to 1 bit (forces 0 or 1)
        binaryChecks[i].in <== pathIndices[i];  // <== means "assign and constrain"
    }

    /*
     * MAIN VERIFICATION LOGIC: Reconstruct the Merkle path from leaf to root
     *
     * The path reconstruction works by hashing pairs at each level:
     * - Start with the leaf value
     * - At each level, hash current value with its sibling
     * - The position of sibling (left or right) depends on pathIndices
     * - Continue until we reach the root
     */
    component hashers[levels];        // Poseidon hash components for each tree level
    signal currentHash[levels + 1];   // Hash values as we traverse up the tree
    signal left[levels];              // Left input to hasher at each level
    signal right[levels];             // Right input to hasher at each level

    // Intermediate signals for conditional logic (required in Circom for quadratic constraints)
    signal leftChoice1[levels];       // Part of left value calculation
    signal leftChoice2[levels];       // Other part of left value calculation
    signal rightChoice1[levels];      // Part of right value calculation
    signal rightChoice2[levels];      // Other part of right value calculation

    currentHash[0] <== leaf;  // Start with the leaf we're proving

    for (var i = 0; i < levels; i++) {
        hashers[i] = Poseidon(2);  // Create Poseidon hasher for 2 inputs

        /*
         * CONDITIONAL ASSIGNMENT LOGIC (implementing if-then-else in circuits)
         *
         * Convention: pathIndices[i] determines sibling position:
         *   - pathIndices[i] == 1: sibling goes LEFT, currentHash goes RIGHT
         *   - pathIndices[i] == 0: sibling goes RIGHT, currentHash goes LEFT
         *
         * WHY THIS WAY: MerkleTreeJS uses this convention where the pathIndex
         * indicates the position of the sibling, not the current node.
         *
         * CIRCUIT TRICK: We can't use if-statements in circuits, so we use arithmetic:
         *   - Multiply by pathIndices[i] to select when it's 1
         *   - Multiply by (1 - pathIndices[i]) to select when it's 0
         *   - Add the results to get the final value
         *
         * EXAMPLE with pathIndices[i] = 1, siblings[i] = 0x123, currentHash[i] = 0x456:
         *   leftChoice1 = 1 * 0x123 = 0x123
         *   leftChoice2 = 0 * 0x456 = 0
         *   left = 0x123 + 0 = 0x123 (sibling goes left)
         *
         *   rightChoice1 = 1 * 0x456 = 0x456
         *   rightChoice2 = 0 * 0x123 = 0
         *   right = 0x456 + 0 = 0x456 (currentHash goes right)
         */
        leftChoice1[i] <== pathIndices[i] * siblings[i];
        leftChoice2[i] <== (1 - pathIndices[i]) * currentHash[i];
        left[i] <== leftChoice1[i] + leftChoice2[i];

        rightChoice1[i] <== pathIndices[i] * currentHash[i];
        rightChoice2[i] <== (1 - pathIndices[i]) * siblings[i];
        right[i] <== rightChoice1[i] + rightChoice2[i];

        // Hash the pair (always left, right order for consistency)
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
        currentHash[i + 1] <== hashers[i].out;  // Store result for next level
    }

    /*
     * FINAL CONSTRAINT: Computed root must equal the provided root
     * === is a constraint operator (not assignment) that enforces equality
     * If this constraint fails, the proof is invalid
     */
    root === currentHash[levels];
}

/*
 * DRY RUN EXAMPLE: Proving IPHONE15 (price $899) is in the tree
 *
 * Tree structure (4 leaves, 2 levels):
 *                  ROOT
 *                 /    \
 *          Hash_A        Hash_B
 *           /  \          /  \
 *    IPHONE15  PS5    LAPTOP  CAMERA
 *     ($899)  ($499)  ($1299) ($799)
 *
 * Inputs for proving IPHONE15:
 *   - leaf = Poseidon("IPHONE15", 899000000) = 0xAAA...
 *   - pathIndices = [0, 0] (IPHONE15 is leftmost: left at level 0, left at level 1)
 *   - siblings = [PS5_hash, Hash_B] (siblings at each level going up)
 *   - root = ROOT_hash (public input that everyone can verify)
 *
 * Execution trace:
 *   Level 0:
 *     - currentHash[0] = 0xAAA... (IPHONE15 hash)
 *     - pathIndices[0] = 0 (sibling goes right)
 *     - left[0] = currentHash[0] = 0xAAA... (we go left)
 *     - right[0] = siblings[0] = PS5_hash (sibling goes right)
 *     - currentHash[1] = Poseidon(0xAAA..., PS5_hash) = Hash_A
 *
 *   Level 1:
 *     - currentHash[1] = Hash_A
 *     - pathIndices[1] = 0 (sibling goes right)
 *     - left[1] = currentHash[1] = Hash_A (we go left)
 *     - right[1] = siblings[1] = Hash_B (sibling goes right)
 *     - currentHash[2] = Poseidon(Hash_A, Hash_B) = ROOT_hash
 *
 *   Final check: ROOT_hash === root ✓ (Proof is valid!)
 *
 * PRIVACY ACHIEVED: Verifier only sees the root hash, not which product or price!
 */


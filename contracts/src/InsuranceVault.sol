// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./verifier/PriceProtectionVerifier.sol";
import "./Token.sol";

contract InsuranceVault {
    Groth16Verifier public zkPriceProtectionVerifier;
    Token public paymentToken;

    // USDC has 6 decimals
    uint256 public constant TOKEN_DECIMALS = 6;
    uint256 public constant TOKEN_MULTIPLIER = 10**TOKEN_DECIMALS; // 1000000

    struct Policy {
        bytes32 secretCommitment;
        uint256 policyPurchaseDate;
        uint256 paidPremium;
        bool alreadyClaimed;
        address buyer;
    }

    mapping(uint256 => Policy) public policies;
    bytes32 public priceMerkleRoot;  // ONLY merkle root, no products!

    uint256 public nextPolicyId = 1;
    address public priceUpdater;

    // Fixed tier premiums in USDC (6 decimals)
    uint256 public constant TIER1_PREMIUM = 1 * TOKEN_MULTIPLIER;   // $1 for $1-99.99
    uint256 public constant TIER2_PREMIUM = 3 * TOKEN_MULTIPLIER;   // $3 for $100-499
    uint256 public constant TIER3_PREMIUM = 7 * TOKEN_MULTIPLIER;   // $7 for $500-999
    uint256 public constant TIER4_PREMIUM = 13 * TOKEN_MULTIPLIER;  // $13 for $1000-1999
    uint256 public constant TIER5_PREMIUM = 20 * TOKEN_MULTIPLIER;  // $20 for $2000-10000

    event PolicyBought(uint256 policyId, uint256 premium, address buyer);
    event ClaimPaid(uint256 policyId, address recipient); // NO amount in event!
    event MerkleRootUpdated(bytes32 newRoot);

    modifier onlyOracle() {
        require(msg.sender == priceUpdater, "Only oracle allowed");
        _;
    }

    constructor(address verifierAddress, address tokenAddress) {
        zkPriceProtectionVerifier = Groth16Verifier(verifierAddress);
        paymentToken = Token(tokenAddress);
        priceUpdater = msg.sender;
    }

    function updatePriceMerkleRoot(bytes32 newRoot) external onlyOracle {
        priceMerkleRoot = newRoot;
        emit MerkleRootUpdated(newRoot);
    }


    function getQuote() public pure returns (
        uint256 tier1Premium,        // $1 for items $1-99.99
        uint256 tier2Premium,        // $3 for items $100-499
        uint256 tier3Premium,        // $7 for items $500-999
        uint256 tier4Premium,        // $13 for items $1000-1999
        uint256 tier5Premium         // $20 for items $2000-10000
    ) {
        tier1Premium = TIER1_PREMIUM;
        tier2Premium = TIER2_PREMIUM;
        tier3Premium = TIER3_PREMIUM;
        tier4Premium = TIER4_PREMIUM;
        tier5Premium = TIER5_PREMIUM;
    }
    
    function buyPolicy(
        bytes32 secretCommitment,
        uint256 premium
    ) external returns (uint256 policyId) {
        // Verify premium matches one of the valid tiers
        require(
            premium == TIER1_PREMIUM ||
            premium == TIER2_PREMIUM ||
            premium == TIER3_PREMIUM ||
            premium == TIER4_PREMIUM ||
            premium == TIER5_PREMIUM,
            "Invalid premium tier"
        );

        // Transfer premium
        require(
            paymentToken.transferFrom(msg.sender, address(this), premium),
            "Premium transfer failed"
        );

        // Store policy
        policyId = nextPolicyId++;
        policies[policyId] = Policy({
            secretCommitment: secretCommitment,
            policyPurchaseDate: block.timestamp,
            paidPremium: premium,
            alreadyClaimed: false,
            buyer: msg.sender
        });

        emit PolicyBought(policyId, premium, msg.sender);
    }
    
    function claimPayout(
        uint256 policyId,
        bytes32 commitment,
        bytes32 merkleRoot,
        uint256 policyStartDate,
        uint256 paidPremium,
        uint[2] memory proofA,
        uint[2][2] memory proofB,
        uint[2] memory proofC,
        uint[4] memory publicInputs  
    ) external {
        Policy storage policy = policies[policyId];
        require(policy.buyer != address(0), "Policy does not exist");
        require(!policy.alreadyClaimed, "Already claimed");
        require(policy.buyer == msg.sender, "Not your policy");



        // Validate provided parameters against policy
        require(policy.secretCommitment == commitment, "Wrong commitment");
        require(priceMerkleRoot == merkleRoot, "Wrong merkle root");
        require(policy.policyPurchaseDate == policyStartDate, "Wrong date");
        require(policy.paidPremium == paidPremium, "Wrong premium");

        require(zkPriceProtectionVerifier.verifyProof(proofA, proofB, proofC, publicInputs), "Invalid proof");

        // Circuit outputs: [validClaim, validPremium, validPayout, payoutAmount]
        require(publicInputs[0] == 1, "Claim not valid");
        require(publicInputs[1] == 1, "Premium not valid");
        require(publicInputs[2] == 1, "Payout not valid");

        uint256 payoutAmount = publicInputs[3];

        policy.alreadyClaimed = true;

        require(paymentToken.transfer(msg.sender, payoutAmount), "Transfer failed");

        emit ClaimPaid(policyId, msg.sender);
    }




}
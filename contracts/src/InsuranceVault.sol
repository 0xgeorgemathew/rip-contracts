// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./verifier/Groth16Verifier.sol";
import "./Token.sol";

contract InsuranceVault {
    Groth16Verifier public zkVerifier;
    Token public paymentToken;

    // USDC has 6 decimals
    uint256 public constant TOKEN_DECIMALS = 6;
    uint256 public constant TOKEN_MULTIPLIER = 10**TOKEN_DECIMALS; // 1000000

    struct Policy {
        bytes32 secretCommitment; // The ZK commitment hash (only thing stored)
        uint256 policyPurchaseDate; // When the protection was purchased
        uint256 paidPremium; // PUBLIC - premium amount paid (privacy preserved through tiers)
        uint256 purchaseCountAtBuy; // Snapshot of total policies when purchased
        bool alreadyClaimed;
        address buyer; // For access control
    }

    struct Product {
        string id;
        uint256 price; // Price in 6 decimals (USDC format)
        bool available;
    }

    mapping(uint256 => Policy) public policies;
    mapping(string => Product) public products;
    mapping(string => uint256) public currentPrices;

    uint256 public nextPolicyId = 1;
    uint256 public totalPoliciesSold = 0; // Track total policies for dynamic pricing
    address public priceUpdater;

    // Premium tiers in USDC (6 decimals)
    uint256 public constant TIER1_BASE = 35 * TOKEN_MULTIPLIER;  // $35 for <$500
    uint256 public constant TIER2_BASE = 65 * TOKEN_MULTIPLIER;  // $65 for $500-1000
    uint256 public constant TIER3_BASE = 100 * TOKEN_MULTIPLIER; // $100 for >$1000

    event PolicyBought(uint256 policyId, uint256 premium, address buyer);
    event ClaimPaid(uint256 policyId, uint256 amount, address recipient);
    event PriceChanged(string productId, uint256 newPrice);

    modifier onlyPriceUpdater() {
        require(msg.sender == priceUpdater, "Only price updater allowed");
        _;
    }

    constructor(address verifierAddress, address tokenAddress) {
        zkVerifier = Groth16Verifier(verifierAddress);
        paymentToken = Token(tokenAddress);
        priceUpdater = msg.sender;

        addProduct("B0DHJ9SCJ4", 1049 * TOKEN_MULTIPLIER ); // $547.20 in 6 decimals
    }
    
    function addProduct(string memory productId, uint256 price) public onlyPriceUpdater {
        products[productId] = Product({
            id: productId,
            price: price,
            available: true
        });
        currentPrices[productId] = price;
        emit PriceChanged(productId, price);
    }

    function getDynamicFactor() public view returns (uint256) {
        // Increases 1% for every 10 policies sold
        return 100 + (totalPoliciesSold / 10);
    }

    function getQuote() public view returns (
        uint256 tier1Premium,        // For items < $500
        uint256 tier2Premium,        // For items $500-$1000
        uint256 tier3Premium,        // For items > $1000
        uint256 currentDynamicFactor,
        uint256 currentPolicyCount
    ) {
        currentDynamicFactor = getDynamicFactor();
        currentPolicyCount = totalPoliciesSold;

        tier1Premium = TIER1_BASE * currentDynamicFactor / 100;
        tier2Premium = TIER2_BASE * currentDynamicFactor / 100;
        tier3Premium = TIER3_BASE * currentDynamicFactor / 100;
    }
    
    function buyPolicy(
        bytes32 secretCommitment,
        uint256 premium,
        uint256 quotePolicyCount // Snapshot to prevent front-running
    ) external returns (uint256 policyId) {
        // Verify quote is recent (within 10 policies)
        require(
            totalPoliciesSold <= quotePolicyCount + 10,
            "Too many policies sold since quote"
        );

        // Verify premium matches one of the valid tiers
        uint256 dynamicFactor = getDynamicFactor();
        uint256 tier1 = TIER1_BASE * dynamicFactor / 100;
        uint256 tier2 = TIER2_BASE * dynamicFactor / 100;
        uint256 tier3 = TIER3_BASE * dynamicFactor / 100;

        require(
            premium == tier1 || premium == tier2 || premium == tier3,
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
            purchaseCountAtBuy: totalPoliciesSold,
            alreadyClaimed: false,
            buyer: msg.sender
        });

        totalPoliciesSold++;
        emit PolicyBought(policyId, premium, msg.sender);
    }
    
    function claimPayout(
        uint256 policyId,
        string memory productId,  // Now passed as parameter
        uint256 purchasePrice,    // Now passed as parameter
        uint[2] memory proofA,
        uint[2][2] memory proofB,
        uint[2] memory proofC,
        uint[11] memory publicInputs  // Updated: includes premium validation
    ) external {
        Policy storage policy = policies[policyId];
        require(!policy.alreadyClaimed, "Already claimed");
        require(policy.buyer == msg.sender, "Not your policy");

        // Public signals order with tier validation:
        // [0] = validClaim (output)
        // [1] = priceDifference (output)
        // [2] = validPremium (output)
        // [3] = commitment
        // [4] = invoicePrice (now public, verified by ZK)
        // [5] = productHash (now public, verified by ZK)
        // [6] = policyStartDate
        // [7] = currentPrice
        // [8] = policyId
        // [9] = paidPremium
        // [10] = purchaseCount

        require(uint256(policy.secretCommitment) == publicInputs[3], "Wrong commitment");
        require(purchasePrice == publicInputs[4], "Purchase price doesn't match proof");

        // Verify productHash matches the provided productId
        bytes32 expectedProductHash = keccak256(abi.encodePacked(productId));
        require(uint256(expectedProductHash) == publicInputs[5], "Product doesn't match proof");

        require(policy.policyPurchaseDate == publicInputs[6], "Wrong policy date");
        require(currentPrices[productId] == publicInputs[7], "Wrong current price");
        require(policyId == publicInputs[8], "Wrong policy ID");
        require(policy.paidPremium == publicInputs[9], "Premium mismatch");
        require(policy.purchaseCountAtBuy == publicInputs[10], "Count mismatch");

        require(zkVerifier.verifyProof(proofA, proofB, proofC, publicInputs), "Invalid proof");

        // Check all validation outputs
        require(publicInputs[0] == 1, "Claim not valid - no price drop");
        require(publicInputs[2] == 1, "Premium validation failed");

        // Calculate payout based on provided purchase price (verified by ZK)
        uint256 currentPrice = currentPrices[productId];
        uint256 priceDifference = purchasePrice > currentPrice ?
            purchasePrice - currentPrice : 0;

        // Verify the proof matches the actual price difference
        require(publicInputs[1] == priceDifference, "Price difference mismatch");

        policy.alreadyClaimed = true;

        // Transfer the full price difference (speculative payout) using ERC20
        require(paymentToken.transfer(msg.sender, priceDifference), "Payout transfer failed");

        emit ClaimPaid(policyId, priceDifference, msg.sender);
    }

    function updatePrice(string memory productId, uint256 newPrice) external onlyPriceUpdater {
        require(products[productId].available, "Product not found");

        products[productId].price = newPrice;
        currentPrices[productId] = newPrice;

        emit PriceChanged(productId, newPrice);
    }

    // Function to fund the contract with tokens for payouts
    function fundContract(uint256 amount) external {
        require(paymentToken.transferFrom(msg.sender, address(this), amount), "Funding transfer failed");
    }

    // Function to check contract token balance
    function getContractBalance() external view returns (uint256) {
        return paymentToken.balanceOf(address(this));
    }

    // Helper functions for USDC decimal conversion
    function toUSDC(uint256 dollarAmount) external pure returns (uint256) {
        // Convert dollar amount to USDC 6 decimals
        // Example: toUSDC(100) = 100000000 (represents $100.00)
        return dollarAmount * TOKEN_MULTIPLIER;
    }

    function fromUSDC(uint256 usdcAmount) external pure returns (uint256) {
        // Convert USDC 6 decimals to dollar amount
        // Example: fromUSDC(100000000) = 100 (represents $100.00)
        return usdcAmount / TOKEN_MULTIPLIER;
    }
}
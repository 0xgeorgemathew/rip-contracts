// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./verifier/Groth16Verifier.sol";

contract PriceProtectionOracle {
    Groth16Verifier public immutable zkVerifier;
    
    struct Policy {
        bytes32 commitment;
        bytes32 asinHash;
        uint256 purchaseDate;
        uint256 premium;
        uint256 maxCoverage;
        bool claimed;
        address owner;
    }
    
    struct ProductInfo {
        string asin;
        uint256 currentPrice;
        uint256 coveragePercent; // basis points (100 = 1%)
        uint256 premiumPercent; // basis points
        bool active;
    }
    
    mapping(uint256 => Policy) public policies;
    mapping(bytes32 => ProductInfo) public products;
    mapping(bytes32 => uint256) public priceOracle; // asinHash => price in cents
    
    uint256 public nextPolicyId = 1;
    address public oracle;
    
    event PolicyPurchased(
        uint256 indexed policyId,
        bytes32 indexed commitment,
        bytes32 indexed asinHash,
        address owner
    );
    
    event ClaimProcessed(
        uint256 indexed policyId,
        uint256 payout,
        address indexed recipient
    );
    
    event PriceUpdated(bytes32 indexed asinHash, uint256 newPrice);
    event ProductAdded(bytes32 indexed asinHash, string asin);
    
    modifier onlyOracle() {
        require(msg.sender == oracle, "Only oracle");
        _;
    }
    
    constructor(address _verifier) {
        zkVerifier = Groth16Verifier(_verifier);
        oracle = msg.sender;
        
        // Initialize with sample product for hackathon
        _addProduct("B0BZSD82ZN", 54720, 2000, 200); // $547.20, 20% coverage, 2% premium
    }
    
    function _addProduct(
        string memory asin,
        uint256 price,
        uint256 coverage,
        uint256 premium
    ) internal {
        bytes32 asinHash = keccak256(abi.encodePacked(asin));
        products[asinHash] = ProductInfo({
            asin: asin,
            currentPrice: price,
            coveragePercent: coverage,
            premiumPercent: premium,
            active: true
        });
        priceOracle[asinHash] = price;
        emit ProductAdded(asinHash, asin);
    }
    
    function getQuote(string calldata asin) 
        external 
        view 
        returns (
            uint256 premium,
            uint256 maxCoverage,
            uint256 currentPrice
        ) 
    {
        bytes32 asinHash = keccak256(abi.encodePacked(asin));
        ProductInfo memory product = products[asinHash];
        require(product.active, "Product not covered");
        
        currentPrice = product.currentPrice;
        premium = (currentPrice * product.premiumPercent) / 10000;
        maxCoverage = (currentPrice * product.coveragePercent) / 10000;
    }
    
    function purchasePolicy(
        bytes32 commitment,
        string calldata asin
    ) external payable returns (uint256 policyId) {
        bytes32 asinHash = keccak256(abi.encodePacked(asin));
        ProductInfo memory product = products[asinHash];
        require(product.active, "Product not covered");
        
        uint256 premium = (product.currentPrice * product.premiumPercent) / 10000;
        require(msg.value >= premium, "Insufficient premium");
        
        policyId = nextPolicyId++;
        policies[policyId] = Policy({
            commitment: commitment,
            asinHash: asinHash,
            purchaseDate: block.timestamp,
            premium: premium,
            maxCoverage: (product.currentPrice * product.coveragePercent) / 10000,
            claimed: false,
            owner: msg.sender
        });
        
        emit PolicyPurchased(policyId, commitment, asinHash, msg.sender);
        
        // Refund excess
        if (msg.value > premium) {
            payable(msg.sender).transfer(msg.value - premium);
        }
    }
    
    function claimProtection(
        uint256 policyId,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[6] calldata _pubSignals // [commitment, asinHash, policyStartDate, currentPrice, policyId, priceDiff]
    ) external {
        Policy storage policy = policies[policyId];
        require(!policy.claimed, "Already claimed");
        require(policy.owner == msg.sender, "Not policy owner");
        
        // Verify public inputs match policy
        require(uint256(policy.commitment) == _pubSignals[0], "Invalid commitment");
        require(uint256(policy.asinHash) == _pubSignals[1], "Invalid ASIN");
        require(policy.purchaseDate == _pubSignals[2], "Invalid date");
        
        // Get current oracle price
        uint256 currentPrice = priceOracle[policy.asinHash];
        require(currentPrice == _pubSignals[3], "Price mismatch");
        require(policyId == _pubSignals[4], "Policy ID mismatch");
        
        // Verify ZK proof
        require(
            zkVerifier.verifyProof(_pA, _pB, _pC, _pubSignals),
            "Invalid proof"
        );
        
        // Calculate payout (capped at max coverage)
        uint256 priceDrop = _pubSignals[5];
        uint256 payout = priceDrop > policy.maxCoverage ? policy.maxCoverage : priceDrop;
        
        policy.claimed = true;
        
        // Transfer payout
        payable(msg.sender).transfer(payout);
        
        emit ClaimProcessed(policyId, payout, msg.sender);
    }
    
    function updatePrice(string calldata asin, uint256 newPrice) 
        external 
        onlyOracle 
    {
        bytes32 asinHash = keccak256(abi.encodePacked(asin));
        require(products[asinHash].active, "Product not found");
        
        products[asinHash].currentPrice = newPrice;
        priceOracle[asinHash] = newPrice;
        
        emit PriceUpdated(asinHash, newPrice);
    }
    
    function addProduct(
        string calldata asin,
        uint256 price,
        uint256 coverage,
        uint256 premium
    ) external onlyOracle {
        _addProduct(asin, price, coverage, premium);
    }
}
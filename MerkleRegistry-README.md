# MerkleRootBlobRegistry Deployment Guide

## Quick Commands Reference

### Setup & Navigation

```bash
# Navigate to contracts directory
cd /Users/liz/Developer/Personal/ETHGlobal25/rip-contracts/contracts

# Check environment variables
cat .env
```

### Build & Compile

```bash
# Compile all contracts
forge build

# Clean and rebuild if needed
forge clean && forge build
```

### Deployment Commands

#### Real Deployments

```bash
# Deploy to Sepolia testnet with verification
forge script script/DeployMerkleRegistry.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify

# Deploy to Sepolia
forge script script/DeployMerkleRegistry.sol --rpc-url https://ethereum-sepolia.core.chainstack.com/3d487cfaf35a7c395f02626761ed9a37 --broadcast --verify


# Deploy without verification
forge script script/DeployMerkleRegistry.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
```

### Verification Commands

```bash
# Check verification status
forge verify-check <VERIFICATION_GUID> --rpc-url $SEPOLIA_RPC_URL
```

### Deployment Information

#### Current Deployment (Sepolia)

- **Contract Address**: `0xddDF3FcBdF1559dceA24A85f52536bc2439e070c`
- **Owner**: `0x04aDa81c30ea0D0ab3C66555F8b446E0074ec001`
- **Network**: Sepolia Testnet
- **Etherscan**: https://sepolia.etherscan.io/address/0xdddf3fcbdf1559dcea24a85f52536bc2439e070c

#### Files Generated

- `merkle-registry-deployment.json` - Contract addresses and deployment info
- `broadcast/DeployMerkleRegistry.sol/11155111/` - Transaction history and receipts

### Environment Variables Required

Create `.env` file in the `contracts/` directory:

```env
PRIVATE_KEY=0x...                     # Your deployer private key
SEPOLIA_RPC_URL=https://...           # Sepolia RPC endpoint
ETHERSCAN_API_KEY=...                 # For contract verification
```

### Contract Usage

#### Key Functions

```solidity
// Update merkle root (owner only, requires EIP-4844 blob transaction)
function updateMerkleRoot(bytes32 _merkleRoot) external onlyOwner

// Check if merkle root is valid
function isMerkleRootValid(bytes32 _merkleRoot) external view returns (bool)

// Get current merkle root
function currentMerkleRoot() external view returns (bytes32)

// Get deployment history
function getMerkleHistoryLength() external view returns (uint256)
function getLatestUpdate() external view returns (MerkleUpdate memory)
```

#### EIP-4844 Blob Transaction Requirements

- The `updateMerkleRoot()` function requires blob transactions (Type 3)
- Uses `blobhash(0)` opcode to link on-chain merkle root with blob data
- Only contract owner can update merkle roots

## File Structure

```
contracts/
├── script/
│   ├── DeployScript.sol              # Main insurance vault deployment
│   └── DeployMerkleRegistry.sol      # Merkle registry deployment
├── src/
│   ├── MerkleRootBlobRegistry.sol    # The registry contract
│   └── ...
├── .env                              # Environment variables
├── merkle-registry-deployment.json   # Deployment addresses
└── deployment.json                   # Main deployment addresses
```

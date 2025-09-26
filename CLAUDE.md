# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Zero-Knowledge Price Protection System** that provides privacy-preserving insurance for product purchases. Users can insure products bought on e-commerce platforms (like Amazon) without revealing product details or purchase prices to the blockchain.

## Key Commands

### Circuit Development
```bash
# Compile circom circuit
cd circuits && npm run compile

# Setup trusted setup (one-time)
cd circuits && npm run setup

# Contribute to ceremony (one-time)
cd circuits && npm run contribute

# Export verification key
cd circuits && npm run export-vkey

# Export Solidity verifier
cd circuits && npm run export-solidity
```

### Smart Contract Development
```bash
# Build contracts
cd contracts && forge build

# Deploy to local network
cd contracts && forge script script/DeployScript.sol --rpc-url local --broadcast

# Run tests
cd contracts && forge test

# Format contracts
cd contracts && forge fmt
```

### Script Operations
```bash
cd scripts

# Run minimal oracle for price updates (preserves state across restarts)
# On restart, loads from merkle-tree.json and syncs on-chain state if needed
npm run oracle:minimal

# Force rebuild oracle from base prices in products.json
# Use this to reset all prices to original values
npm run oracle:minimal -- --force-rebuild

# Run claim policy process
npm run claim-policy

# Privacy flow testing (requires manual implementation of missing scripts)
npm run privacy:test
```

### Oracle State Management
```bash
# Check state consistency between local tree and on-chain root
curl http://localhost:3001/api/debug/tree-state

# Force rebuild oracle tree from base prices
curl -X POST http://localhost:3001/api/debug/force-rebuild

# Export current oracle state for backup
curl http://localhost:3001/api/debug/export-state

# Drop all prices by 10% (for testing)
curl -X POST http://localhost:3001/api/drop-prices -H "Content-Type: application/json" -d '{"percentage": 10}'

# Set specific product price
curl -X POST http://localhost:3001/api/debug/set-price -H "Content-Type: application/json" -d '{"productId": "IPHONE15", "price": 1000000000}'
```

### Environment Setup
- Copy `.env.example` to `.env` and configure:
  - `PRIVATE_KEY`: Wallet private key
  - `RPC_URL`: Blockchain RPC (default: http://localhost:8545)
  - Purchase details for testing commitment generation
  - `FORCE_REBUILD=true`: Force oracle to rebuild from base prices on startup

## Architecture

### Core Components

1. **Circom Circuit** (`circuits/priceProtection.circom`)
   - Validates price drops and premium calculations
   - Uses Poseidon hashing for commitments
   - Supports tiered premium structure

2. **Smart Contracts** (`contracts/src/`)
   - `InsuranceVault.sol`: Main insurance logic with ZK proof verification
   - `Token.sol`: USDC-compatible ERC20 token for payments
   - `Groth16Verifier.sol`: Generated ZK proof verifier

3. **TypeScript Scripts** (`scripts/`)
   - End-to-end user flow automation
   - Oracle price management
   - ZK proof generation and verification

### Privacy Architecture

The system achieves privacy through:

- **Commitment Scheme**: User purchase details are hashed into a single commitment
- **ZK Proofs**: Claims are validated without revealing underlying data
- **Tiered Premiums**: Fixed premium tiers prevent price discrimination
- **Merkle Tree Oracle**: Prices are proven without revealing which product

### Data Flow

1. **Purchase**: User buys product on Amazon
2. **Commitment**: Generate secret commitment containing purchase details
3. **Policy**: Buy insurance policy with commitment hash (no product data on-chain)
4. **Oracle**: Continuous price monitoring via merkle tree
5. **Claim**: Generate ZK proof of valid claim without revealing details
6. **Payout**: Smart contract validates proof and pays out difference

## Development Patterns

### Circuit Constraints
- All signals must be constrained properly
- Use `IsEqual()`, `LessThan()`, `GreaterThan()` from circomlib
- Break complex calculations into intermediate signals to avoid non-quadratic constraints

### Smart Contract Security
- Premium validation prevents arbitrary claims
- ZK proof verification ensures claim validity
- Commitment verification prevents replay attacks
- Access controls protect oracle updates

### Contract Integration
- **NEVER hardcode contract addresses or ABIs in scripts**
- **ALWAYS use `scripts/utils/contractLoader.ts`** for contract access
- Contract addresses come from `contracts/deployment.json`
- ABIs come from `contracts/out/[ContractName].sol/[ContractName].json`
- This prevents deployment mismatches and outdated ABIs

### TypeScript Integration
- Use `snarkjs` for proof generation
- Use `ethers.js` for blockchain interaction
- Use `circomlibjs` for Poseidon hashing
- Store sensitive data locally, never on-chain
- **ALWAYS use `scripts/utils/contractLoader.ts`** for contract interactions:
  - `loadDeploymentAddresses()` - Load addresses from `contracts/deployment.json`
  - `loadContractABI(contractName)` - Load ABI from compiled artifacts
  - `getContractInstance(contractName, address, signer)` - Get contract with ABI

## Testing

### Local Development
1. Start local blockchain: `anvil` (if using Foundry)
2. Deploy contracts: `cd contracts && forge script script/DeployScript.sol --rpc-url local --broadcast`
3. Run full user flow: Execute scripts in sequence

### Circuit Testing
- Generate test inputs in `circuits/`
- Use `snarkjs` to test proof generation
- Verify outputs match expected values

## Key Files

- `circuits/priceProtection.circom`: Main ZK circuit
- `contracts/src/InsuranceVault.sol`: Core insurance contract
- `scripts/utils/contractLoader.ts`: Contract interaction utility
- `scripts/utils/hashUtils.ts`: Poseidon hash calculation utilities
- `scripts/utils/treeBuilder.ts`: Merkle tree construction utilities
- `scripts/utils/stateManager.ts`: Oracle state persistence manager
- `scripts/utils/retryUtils.ts`: Retry logic for network operations
- `scripts/minimalOracle.ts`: Price oracle implementation (refactored to ~313 lines)
- `scripts/claimPolicy.ts`: Complete claim process with enhanced logging
- `scripts/merkle-tree.json`: Oracle state persistence (source of truth)
- `scripts/products.json`: Base product prices for rebuild operations
- `scripts/debugRoutes.ts`: Debug endpoints for oracle state management
- `purchase-policy.md`: Implementation guide for policy purchase flow
- `user-flow.md`: Complete system walkthrough
- `privacy.fix.md`: Privacy enhancement implementation plan

## Product Configuration

The system supports tiered premium pricing with 5 tiers:
- **Tier 1**: $1-$99 → $5 premium
- **Tier 2**: $100-$499 → $15 premium
- **Tier 3**: $500-$999 → $35 premium
- **Tier 4**: $1000-$1999 → $65 premium
- **Tier 5**: $2000-$10000 → $100 premium

## Oracle Behavior and Debugging

### State Persistence
- Oracle automatically saves state to `scripts/merkle-tree.json`
- State includes current prices, product hashes, and merkle tree structure
- On startup, oracle loads existing state and updates on-chain root if mismatch detected
- Local state (merkle-tree.json) is treated as source of truth
- Use `--force-rebuild` to reset to base prices from products.json

### Merkle Proof Logging
- Path indices like `[0, 0, 0, 0]` are mathematically correct for leftmost leaves
- Enhanced logging explains why specific path indices are generated
- IPHONE15 at index 0 will always have path `[0, 0, 0, 0]` (all left branches)
- Detailed explanations prevent confusion about "all zeros" being an error

### Debug Endpoints
Available at `http://localhost:3001/api/debug/`:
- `GET /tree-state` - Compare local vs on-chain state
- `POST /force-rebuild` - Reset to base prices
- `GET /export-state` - Export oracle state for backup
- `GET /status` - Oracle health and connection status
- `POST /set-price` - Set individual product prices
- `POST /reset-prices` - Reset all prices to base values

### Troubleshooting
- **State mismatch**: Use `/api/debug/tree-state` to check consistency
- **Corrupted state**: Use `--force-rebuild` flag or `/api/debug/force-rebuild`
- **Oracle won't start**: Check `merkle-tree.json` format and contract connectivity
- **Wrong prices**: Verify current prices with `/api/prices` endpoint

## Security Considerations

- Private keys in `.env` for development only
- ZK proofs prevent data leakage
- Commitment schemes hide purchase details
- Tiered pricing prevents product discrimination
- Oracle merkle proofs prevent price manipulation
- Oracle state persistence maintains consistency across restarts
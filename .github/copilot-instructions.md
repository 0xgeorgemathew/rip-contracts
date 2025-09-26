# GitHub Copilot Instructions

## Project Overview

This is a **Zero-Knowledge Price Protection System** that provides privacy-preserving insurance for e-commerce purchases. The system has **successfully implemented privacy protections** - only commitment hashes and merkle roots are stored on-chain, preserving user privacy.

## Architecture Components

### 1. Circom Circuits (`circuits/`)

- **Main Circuit**: `priceProtection.circom` - validates price drops and premium calculations using Poseidon hashing
- **Build System**: Custom npm scripts for compilation, trusted setup, and Solidity verifier generation
- **Key Pattern**: All signals must be properly constrained; use circomlib components (`GreaterThan`, `IsEqual`, `Poseidon`)

### 2. Smart Contracts (`contracts/` - Foundry)

- **Core Contract**: `InsuranceVault.sol` - handles policy purchases, ZK proof verification, and payouts
- **Privacy Issue**: Currently exposes `productId` and `purchasePrice` as function parameters (lines 135-136)
- **Token System**: USDC-compatible ERC20 with 6-decimal precision throughout
- **Dynamic Pricing**: Premiums increase 1% per 10 policies sold

### 3. TypeScript Scripts (`scripts/`)

- **User Flow**: Sequential execution: commitment → purchase → proof → claim
- **ZK Integration**: Uses `snarkjs` for proof generation, `circomlibjs` for Poseidon hashing
- **Data Storage**: JSON files for intermediate data (`commitment-data.json`, `policy-data.json`, `proof-data.json`)

## Critical Development Workflows

### Circuit Development

```bash
cd circuits
npm run compile              # Compile circom to R1CS/WASM
npm run setup               # Trusted setup (one-time)
npm run contribute          # Ceremony contribution (one-time)
npm run export-solidity     # Generate Groth16Verifier.sol
```

### Contract Development (Foundry)

```bash
cd contracts
forge build                 # Compile contracts
forge script script/DeployScript.sol --rpc-url local --broadcast
forge test                  # Run tests
```

### Demo Flow Execution

```bash
cd scripts
# Start oracle (maintains state across restarts)
npm run oracle:minimal      # Run price oracle with API

# OR force rebuild from base prices
npm run oracle:minimal -- --force-rebuild

# Run claim process (full end-to-end)
npm run claim-policy        # Complete claim flow with ZK proof
```

## Privacy Architecture (IMPLEMENTED ✅)

### Privacy Features Working

- **Merkle Tree Oracle**: Only merkle root hash stored on-chain
- **Private Inputs**: All sensitive data (product ID, prices) are private circuit inputs
- **Commitment Scheme**: `poseidon([orderHash, invoicePrice, invoiceDate, productHash, salt, selectedTier])`
- **Minimal Oracle**: 8 demo products with RESTful API at `localhost:3001`
- **State Persistence**: Oracle maintains price state across restarts
- **Enhanced Logging**: Clear explanations for merkle proof path indices

### Current Oracle Implementation

- **Products**: IPHONE15, MACBOOK, IPADAIR, GALAXY24, XPSLAPTOP, SONYTVX90, AIRPODS, SWITCH
- **API Endpoints**: `/api/merkle-root`, `/api/merkle-proof/:productId`, `/api/prices`
- **Debug Endpoints**: `/api/debug/tree-state`, `/api/debug/force-rebuild`, `/api/debug/export-state`
- **State Management**: Automatic save/load from `merkle-tree.json`

## Project-Specific Patterns

### USDC Precision Handling

```typescript
// Always use 6 decimals throughout system
const TIER1_PREMIUM = 35 * 1000000; // $35.00 in USDC format
const purchasePrice = 1199 * 1000000; // $1,199.00
```

### ZK Proof Structure

```typescript
// Privacy-preserving public inputs (IMPLEMENTED)
publicInputs = [validClaim, validPremium, validPayout, payoutAmount]

// Private inputs (hidden from blockchain)
privateInputs = [orderHash, invoicePrice, invoiceDate, productHash, salt, selectedTier, currentPrice, leafHash, merkleProof, leafIndex, commitment, merkleRoot, policyStartDate, paidPremium]
```

### Tiered Premium System

- Tier 1: <$500 → $35 base premium
- Tier 2: $500-$1000 → $65 base premium
- Tier 3: >$1000 → $100 base premium
- Dynamic factor: `100 + (totalPoliciesSold / 10)`

## Key Integration Points

### Circuit ↔ Contract

- Circuit outputs must match contract's `publicInputs` array order
- Groth16Verifier.sol auto-generated from circuit's verification key
- Commitment verification links circuit proof to stored policy

### Scripts ↔ Oracle

- **Implemented**: Merkle tree API at `localhost:3001` with endpoints:
  - `GET /api/merkle-root` - current tree root
  - `GET /api/merkle-proof/:productId` - inclusion proof
  - `POST /api/drop-prices` - simulate price drops for testing
  - `GET /api/debug/tree-state` - check local vs on-chain state consistency
  - `POST /api/debug/force-rebuild` - reset to base prices
- **State Persistence**: Oracle loads existing state on startup, only rebuilds if corrupted or forced

### Environment Configuration

```bash
# Required .env variables
PRIVATE_KEY=0x...           # Wallet for transactions
RPC_URL=http://localhost:8545  # Local blockchain
# Purchase details for commitment generation (development)
```

## Current System Status

**IMPLEMENTED ✅**: Privacy-preserving system fully operational:

1. ✅ Minimal oracle deployed with 8 products and state persistence
2. ✅ Merkle tree circuit implemented with proper path validation
3. ✅ Main circuit updated for complete privacy preservation
4. ✅ Smart contract only stores commitment hashes and merkle roots
5. ✅ End-to-end privacy tested and working
6. ✅ Enhanced logging explains merkle proof path indices
7. ✅ Oracle state management with consistency verification

## Key Files for AI Context

- `CLAUDE.md` - Complete development guide with oracle state management
- `user-flow.md` - End-to-end system walkthrough with privacy preservation
- `circuits/priceProtection.circom` - Privacy-preserving ZK circuit ✅
- `contracts/src/InsuranceVault.sol` - Privacy-preserving contract ✅
- `scripts/minimalOracle.ts` - Oracle with state persistence and enhanced logging ✅
- `scripts/claimPolicy.ts` - Complete claim process with merkle proof explanations ✅
- `scripts/merkle-tree.json` - Oracle state persistence (auto-managed) ✅
- `scripts/debugRoutes.ts` - Debug endpoints for oracle state management ✅

## Testing Approach

### Oracle State Management

```bash
# Check oracle state consistency
curl http://localhost:3001/api/debug/tree-state

# Force rebuild if state is corrupted
curl -X POST http://localhost:3001/api/debug/force-rebuild

# Test price updates
curl -X POST http://localhost:3001/api/drop-prices -H "Content-Type: application/json" -d '{"percentage": 10}'

# Verify privacy in claim process
npm run claim-policy  # Only commitment hash and merkle root visible on-chain
```

### Merkle Proof Debugging
- Path indices `[0, 0, 0, 0]` are correct for IPHONE15 at leftmost position (index 0)
- Enhanced logging explains why each path index is 0 (left branch at each level)
- Oracle automatically validates tree structure and merkle proof generation

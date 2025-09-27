# Speaker Notes for RIP Demo Presentation (2 minutes)

## Slide 1: Title (5 sec)
"Welcome! Today I'm introducing RIP - the Remorse Insurance Protocol - a privacy-preserving price protection system using Ethereum's cutting-edge tech."

## Slide 2: What is RIP? (15 sec)
"RIP lets you insure any online purchase without revealing what you bought. Buy on Amazon, generate a cryptographic commitment, pay a small premium, and if the price drops - submit your ZK proof to claim payouts. Complete privacy through zero-knowledge proofs."

## Slide 3: Core Technologies (12 sec)
"We built this on two game-changing Ethereum features: EIP-4844 Blobs give us 90% cheaper storage for price tracking. Groth16 ZK circuits ensure complete privacy - no product details ever exposed."

## Slide 4: Ethereum Blobs (10 sec)
"Blobs are Ethereum's new data layer. Traditional storage costs $100 - blobs cost just $10. Our oracle stores complete price data in blobs, maintaining decentralization at a fraction of the cost."

## Slide 5: Zero Knowledge Proofs (12 sec)
"ZK proofs are magical - you prove you deserve a payout without revealing ANY purchase details. Prove 'I bought something and price dropped' without saying what product, what price, or any personal data."

## Slide 6: Merkle Trees (10 sec)
"Our oracle monitors all product prices in a merkle tree. Only the root hash goes on-chain, complete tree in blob storage. Users get cryptographic price proofs without revealing which product they're claiming for."

## Slide 7: Purchase Process (15 sec)
"When you buy insurance: shop normally, generate a local commitment hash, pay premium based on price tier not product type, get policy ID. Everything stays private - only the hash goes on-chain. No product identity, no purchase price revealed."

## Slide 8: Claim Process (15 sec)
"When prices drop: get merkle proof from oracle, generate ZK proof locally, submit your claim to the smart contract for verification and payout. You prove ownership and price drop mathematically without exposing any sensitive data."

## Slide 9: System Architecture (18 sec)
"Complete end-to-end system: Chrome extension for purchases, price oracle with merkle trees, blob storage for efficiency, smart contracts with ZK verification, all privacy-preserving. Everything working together seamlessly."

## Slide 10: Thank You & Demo (8 sec)
"That's RIP - first to combine blobs and ZK for commerce. Let me show you the live demo of how it all works!"

---
**Total: ~2 minutes**

## Key Points to Emphasize:
- **Innovation**: First to combine Ethereum blobs with ZK proofs for commerce
- **Privacy**: Complete anonymity - no product details revealed
- **Efficiency**: 90% cost reduction through blob storage
- **Practical**: Works with any e-commerce site (Amazon, eBay, etc.)
- **Seamless**: Automated oracle monitoring with user-initiated claims

## Backup Points (if time allows):
- Tiered premium system prevents price discrimination
- Mathematical proof verification without data exposure
- Fully decentralized architecture
- Real-world applicability for any online purchase
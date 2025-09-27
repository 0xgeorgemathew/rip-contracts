The oracle generates a merkle tree json from the products they insure and their prices. The root of the merkle tree is stored on-chain in the InsuranceVault contract and also in contract which will be implmented named BloboOracle , which stores the full merkle tree as an Ethereum Blob.

There is a chrome extension that shows a Purchase Insurance button on the Amazon webpage.

User clicks on that and gets redirected to a page that shows the insurance options for the product they are viewing.

The user can select the insurance option they want and proceed to checkout. Tired . Pricing

User completes the purchase flow and gets a confirmation of their insurance purchase. as per ZK implementation similar to scripts/purchasePolicy.ts

When there is a change in price the oracle updates the merkle tree and the root on-chain.

Now the user requests a merkle proof from the oracle to claim their insurance.

The oracle verifies the user's request and generates a merkle proof.

The user can use this proof to claim their insurance.

Prices are updated as merkle tree and and stored as an Ethereum Blob

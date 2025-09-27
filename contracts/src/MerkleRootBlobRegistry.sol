// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MerkleRootBlobRegistry
 * @notice Smart contract for storing merkle roots with EIP-4844 blob data availability references
 * @dev Uses BLOBHASH opcode to link on-chain merkle roots with off-chain blob data
 * @dev Only the contract owner can update merkle roots
 */
contract MerkleRootBlobRegistry is Ownable {
    // Current merkle root
    bytes32 public currentMerkleRoot;

    // Merkle root update history
    struct MerkleUpdate {
        bytes32 merkleRoot;
        bytes32 blobHash;
        uint256 timestamp;
    }

    MerkleUpdate[] public merkleHistory;
    mapping(bytes32 => bool) public validMerkleRoots;

    event MerkleRootUpdated(
        bytes32 indexed merkleRoot,
        bytes32 indexed blobHash,
        uint256 timestamp
    );

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Updates the current merkle root with blob data availability proof
     * @param _merkleRoot The new merkle root to store
     * @dev Requires a blob transaction (Type 3) to provide data availability
     * @dev Only callable by the contract owner
     */
    function updateMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        require(
            _merkleRoot != bytes32(0),
            "MerkleRegistry: Invalid merkle root"
        );

        // Get blob versioned hash from transaction using BLOBHASH opcode
        bytes32 blobHash = blobhash(0); // First blob in transaction
        require(blobHash != bytes32(0), "MerkleRegistry: No blob hash found");

        // Update state
        currentMerkleRoot = _merkleRoot;
        validMerkleRoots[_merkleRoot] = true;

        // Record history
        merkleHistory.push(
            MerkleUpdate({
                merkleRoot: _merkleRoot,
                blobHash: blobHash,
                timestamp: block.timestamp
            })
        );

        emit MerkleRootUpdated(_merkleRoot, blobHash, block.timestamp);
    }

    /**
     * @notice Returns the total number of merkle root updates
     * @return The length of the merkle history array
     */
    function getMerkleHistoryLength() external view returns (uint256) {
        return merkleHistory.length;
    }

    /**
     * @notice Returns the latest merkle root update information
     * @return The most recent MerkleUpdate struct
     */
    function getLatestUpdate() external view returns (MerkleUpdate memory) {
        require(
            merkleHistory.length > 0,
            "MerkleRegistry: No updates recorded"
        );
        return merkleHistory[merkleHistory.length - 1];
    }

    /**
     * @notice Returns a specific merkle root update by index
     * @param _index Index in the merkle history array
     * @return The MerkleUpdate struct at the specified index
     */
    function getMerkleUpdate(
        uint256 _index
    ) external view returns (MerkleUpdate memory) {
        require(
            _index < merkleHistory.length,
            "MerkleRegistry: Index out of bounds"
        );
        return merkleHistory[_index];
    }

    /**
     * @notice Checks if a merkle root has been previously recorded
     * @param _merkleRoot The merkle root to check
     * @return Boolean indicating if the merkle root is valid/recorded
     */
    function isMerkleRootValid(
        bytes32 _merkleRoot
    ) external view returns (bool) {
        return validMerkleRoots[_merkleRoot];
    }
}

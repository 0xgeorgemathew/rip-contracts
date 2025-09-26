// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IBlobOracle {
    function currentMerkleRoot() external view returns (bytes32);
    function lastUpdateBlock() external view returns (uint256);
}

contract BlobOracle is IBlobOracle {
    bytes32 public currentMerkleRoot;
    bytes32 public currentBlobHash;
    uint256 public lastUpdateBlock;
    uint256 public lastUpdateTimestamp;

    address public priceOracle;
    address public owner;

    uint256 public constant BLOB_SIZE = 131072; // 128KB
    uint256 public constant MIN_UPDATE_INTERVAL = 300; // 5 minutes minimum between updates

    mapping(bytes32 => uint256) public blobHashToBlock;
    mapping(bytes32 => bytes32) public merkleRootToBlobHash;

    event BlobPublished(
        bytes32 indexed merkleRoot,
        bytes32 indexed blobHash,
        uint256 blockNumber,
        uint256 timestamp
    );

    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOracle() {
        require(msg.sender == priceOracle, "Only oracle can update");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        priceOracle = msg.sender;
    }

    function publishPriceUpdate(
        bytes32 _merkleRoot,
        bytes32 _blobVersionedHash
    ) external onlyOracle {
        require(_merkleRoot != bytes32(0), "Invalid merkle root");
        require(_blobVersionedHash != bytes32(0), "Invalid blob hash");

        require(
            block.timestamp >= lastUpdateTimestamp + MIN_UPDATE_INTERVAL,
            "Update too frequent"
        );

        require(
            verifyBlobAvailability(_blobVersionedHash),
            "Blob not available"
        );

        currentMerkleRoot = _merkleRoot;
        currentBlobHash = _blobVersionedHash;
        lastUpdateBlock = block.number;
        lastUpdateTimestamp = block.timestamp;

        blobHashToBlock[_blobVersionedHash] = block.number;
        merkleRootToBlobHash[_merkleRoot] = _blobVersionedHash;

        emit BlobPublished(
            _merkleRoot,
            _blobVersionedHash,
            block.number,
            block.timestamp
        );
    }

    function verifyBlobAvailability(bytes32 _blobHash) public view returns (bool) {
        if (_blobHash == bytes32(0)) return false;

        uint256 blobBlock = blobHashToBlock[_blobHash];
        if (blobBlock == 0) {
            return tx.gasprice > 0;
        }

        return block.number - blobBlock < 131072;
    }

    function getBlobHash(bytes32 _merkleRoot) external view returns (bytes32) {
        return merkleRootToBlobHash[_merkleRoot];
    }

    function getLatestPriceData() external view returns (
        bytes32 merkleRoot,
        bytes32 blobHash,
        uint256 updateBlock,
        uint256 updateTimestamp
    ) {
        return (
            currentMerkleRoot,
            currentBlobHash,
            lastUpdateBlock,
            lastUpdateTimestamp
        );
    }

    function updateOracle(address _newOracle) external onlyOwner {
        require(_newOracle != address(0), "Invalid oracle address");
        require(_newOracle != priceOracle, "Same oracle");

        address oldOracle = priceOracle;
        priceOracle = _newOracle;

        emit OracleUpdated(oldOracle, _newOracle);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid owner address");
        require(_newOwner != owner, "Same owner");

        address previousOwner = owner;
        owner = _newOwner;

        emit OwnershipTransferred(previousOwner, _newOwner);
    }

    function emergencyUpdateRoot(bytes32 _merkleRoot) external onlyOwner {
        require(_merkleRoot != bytes32(0), "Invalid merkle root");

        currentMerkleRoot = _merkleRoot;
        lastUpdateBlock = block.number;
        lastUpdateTimestamp = block.timestamp;

        emit BlobPublished(
            _merkleRoot,
            bytes32(0),
            block.number,
            block.timestamp
        );
    }
}
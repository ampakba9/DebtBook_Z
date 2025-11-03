pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DebtBook_Z is ZamaEthereumConfig {
    struct DebtEntry {
        string creditor;                  
        string debtor;                    
        euint32 encryptedAmount;          
        uint256 timestamp;                
        uint32 decryptedAmount;           
        bool isVerified;                  
    }

    mapping(string => DebtEntry) public debtEntries;
    mapping(string => euint32) public netBalances;
    string[] public entryIds;
    string[] public participantIds;

    event DebtRecorded(string indexed entryId, string indexed creditor, string indexed debtor);
    event DecryptionVerified(string indexed entryId, uint32 decryptedAmount);
    event NetBalanceUpdated(string indexed participantId, euint32 encryptedNetBalance);

    constructor() ZamaEthereumConfig() {
    }

    function recordDebt(
        string calldata entryId,
        string calldata creditor,
        string calldata debtor,
        externalEuint32 encryptedAmount,
        bytes calldata inputProof
    ) external {
        require(bytes(debtEntries[entryId].creditor).length == 0, "Entry ID already exists");
        require(!compareStrings(creditor, debtor), "Creditor and debtor cannot be the same");

        euint32 amount = FHE.fromExternal(encryptedAmount, inputProof);
        require(FHE.isInitialized(amount), "Invalid encrypted amount");

        debtEntries[entryId] = DebtEntry({
            creditor: creditor,
            debtor: debtor,
            encryptedAmount: amount,
            timestamp: block.timestamp,
            decryptedAmount: 0,
            isVerified: false
        });

        FHE.allowThis(debtEntries[entryId].encryptedAmount);
        FHE.makePubliclyDecryptable(debtEntries[entryId].encryptedAmount);

        _updateParticipantList(creditor);
        _updateParticipantList(debtor);

        entryIds.push(entryId);
        emit DebtRecorded(entryId, creditor, debtor);
    }

    function verifyDecryption(
        string calldata entryId,
        bytes memory abiEncodedClearAmount,
        bytes memory decryptionProof
    ) external {
        require(bytes(debtEntries[entryId].creditor).length > 0, "Debt entry does not exist");
        require(!debtEntries[entryId].isVerified, "Debt already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(debtEntries[entryId].encryptedAmount);

        FHE.checkSignatures(cts, abiEncodedClearAmount, decryptionProof);

        uint32 decodedAmount = abi.decode(abiEncodedClearAmount, (uint32));
        debtEntries[entryId].decryptedAmount = decodedAmount;
        debtEntries[entryId].isVerified = true;

        emit DecryptionVerified(entryId, decodedAmount);
    }

    function computeNetBalance(string calldata participantId) external {
        require(_participantExists(participantId), "Participant not found");

        euint32 balance = FHE.zero();
        bool firstEntry = true;

        for (uint i = 0; i < entryIds.length; i++) {
            DebtEntry storage entry = debtEntries[entryIds[i]];
            if (compareStrings(entry.creditor, participantId)) {
                balance = firstEntry ? entry.encryptedAmount : FHE.add(balance, entry.encryptedAmount);
                firstEntry = false;
            }
            if (compareStrings(entry.debtor, participantId)) {
                balance = firstEntry ? FHE.sub(FHE.zero(), entry.encryptedAmount) : FHE.sub(balance, entry.encryptedAmount);
                firstEntry = false;
            }
        }

        netBalances[participantId] = balance;
        FHE.allowThis(netBalances[participantId]);
        FHE.makePubliclyDecryptable(netBalances[participantId]);

        emit NetBalanceUpdated(participantId, balance);
    }

    function getDebtEntry(string calldata entryId) external view returns (
        string memory creditor,
        string memory debtor,
        uint256 timestamp,
        bool isVerified,
        uint32 decryptedAmount
    ) {
        require(bytes(debtEntries[entryId].creditor).length > 0, "Debt entry does not exist");
        DebtEntry storage entry = debtEntries[entryId];

        return (
            entry.creditor,
            entry.debtor,
            entry.timestamp,
            entry.isVerified,
            entry.decryptedAmount
        );
    }

    function getNetBalance(string calldata participantId) external view returns (euint32) {
        require(_participantExists(participantId), "Participant not found");
        return netBalances[participantId];
    }

    function getAllEntryIds() external view returns (string[] memory) {
        return entryIds;
    }

    function getAllParticipantIds() external view returns (string[] memory) {
        return participantIds;
    }

    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    function _updateParticipantList(string memory participantId) internal {
        if (!_participantExists(participantId)) {
            participantIds.push(participantId);
        }
    }

    function _participantExists(string memory participantId) internal view returns (bool) {
        for (uint i = 0; i < participantIds.length; i++) {
            if (compareStrings(participantIds[i], participantId)) {
                return true;
            }
        }
        return false;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}



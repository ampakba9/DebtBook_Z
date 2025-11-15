# Confidential Debt Ledger

Confidential Debt Ledger is a privacy-preserving application designed to securely record and calculate debts among friends using Zama’s Fully Homomorphic Encryption (FHE) technology. It enables users to maintain their financial exchanges confidentially while performing computations on encrypted data, ensuring that sensitive information remains private throughout the process.

## The Problem

In the age of digital finance and peer-to-peer lending, the necessity for privacy in financial transactions is paramount. Cleartext data, including debt amounts and transaction history, poses serious risks, such as unauthorized access, data breaches, and exploitation of personal financial information. Friends and acquaintances might hesitate to transact openly due to fears of their financial dealings being exposed, leading to a lack of transparency and trust.

## The Zama FHE Solution

Zama’s FHE technology addresses these privacy concerns by enabling computation on encrypted data. By leveraging Zama's fhevm, the Confidential Debt Ledger processes financial transactions securely, allowing users to maintain their privacy while still being able to perform necessary calculations. With full homomorphic encryption, all debt records and balance calculations are conducted without ever revealing the underlying sensitive data, ensuring that privacy and confidentiality are upheld at all times.

## Key Features

- 🔒 **Privacy-First Design:** Guarantees complete confidentiality for all transactions.
- 🔗 **Secure Debt Recording:** Records debt between friends without exposing sensitive financial data.
- 🔄 **Encrypted Balance Calculation:** Supports computation on encrypted inputs, facilitating net balance calculations securely.
- 📈 **Real-Time Updates:** Changes in debts are instantly reflected, maintaining up-to-date records without compromising privacy.
- 🤝 **Social Lending Aspect:** Fosters trust and transparency among friends by keeping financial dealings secure.

## Technical Architecture & Stack

The Confidential Debt Ledger is built on a combination of technologies that ensure robust privacy and seamless functionality. Key components include:

- **Core Privacy Engine:** Zama’s FHE technologies (fhEVM).
- **Smart Contract Development:** Utilizes Solidity for secure transactions.
- **Backend Logic:** Implemented using a suitable backend language (e.g., JavaScript, Python) for handling operations and user interactions.
- **Encryption Libraries:** Make use of Zama’s libraries for seamless integration of homomorphic encryption.

## Smart Contract / Core Logic

Here is a simplified pseudo-code example that showcases how the debt recording and balance calculation functionalities might be structured in Solidity:solidity
pragma solidity ^0.8.0;

contract ConfidentialDebtLedger {
    struct Debt {
        uint64 amount;
        address creditor;
        address debtor;
    }

    mapping(address => Debt[]) public debts;

    function createDebt(uint64 encryptedAmount, address debtor) public {
        debts[debtor].push(Debt(encryptedAmount, msg.sender, debtor));
    }

    function calculateNetBalance(address user) public view returns (uint64) {
        uint64 totalDebt = 0;
        for (uint i = 0; i < debts[user].length; i++) {
            totalDebt = TFHE.add(totalDebt, debts[user][i].amount);
        }
        // Returns the net balance after calculations
        return TFHE.decrypt(totalDebt);
    }
}

## Directory Structure

The project follows a structured directory layout for clarity and organization:
ConfidentialDebtLedger/
├── contracts/
│   └── ConfidentialDebtLedger.sol
├── scripts/
│   └── main.py
├── tests/
│   └── test_debtLedger.py
├── README.md
└── package.json

## Installation & Setup

To get started with the Confidential Debt Ledger, please follow these steps:

### Prerequisites
- Ensure you have Node.js and npm installed for managing packages.
- Python and pip for running the backend scripts.

### Installation Steps
1. Install the necessary dependencies for the project using npm:bash
   npm install

2. Install Zama’s FHE library which is essential for the operations of this project:bash
   npm install fhevm

3. For the backend logic, install Python dependencies:bash
   pip install -r requirements.txt

## Build & Run

To compile the smart contracts and run the application, use the following commands:

1. Compile the smart contracts:bash
   npx hardhat compile

2. Run the backend logic:bash
   python main.py

This will launch the application and allow you to interact with the Confidential Debt Ledger.

## Acknowledgements

We wish to extend our gratitude to Zama for providing the open-source Fully Homomorphic Encryption primitives that make this project possible. Their innovative technology underpins the functionality and security of the Confidential Debt Ledger, empowering us to ensure privacy in personal financial interactions.



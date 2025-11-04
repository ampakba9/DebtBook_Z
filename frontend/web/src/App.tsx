import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface DebtRecord {
  id: number;
  name: string;
  amount: string;
  debtor: string;
  creditor: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
  encryptedValueHandle?: string;
}

interface DebtStats {
  totalDebts: number;
  verifiedDebts: number;
  netBalance: number;
  activeTransactions: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingDebt, setCreatingDebt] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newDebtData, setNewDebtData] = useState({ 
    name: "", 
    amount: "", 
    debtor: "", 
    creditor: "" 
  });
  const [selectedDebt, setSelectedDebt] = useState<DebtRecord | null>(null);
  const [decryptedData, setDecryptedData] = useState<{ amount: number | null }>({ amount: null });
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "verified" | "pending">("all");
  const [showStats, setShowStats] = useState(true);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const debtsList: DebtRecord[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          debtsList.push({
            id: parseInt(businessId.replace('debt-', '')) || Date.now(),
            name: businessData.name,
            amount: businessId,
            debtor: businessData.description.split('|')[0] || "Unknown",
            creditor: businessData.description.split('|')[1] || "Unknown",
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setDebts(debtsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createDebt = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingDebt(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating debt record with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const amountValue = parseInt(newDebtData.amount) || 0;
      const businessId = `debt-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, amountValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newDebtData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        0,
        0,
        `${newDebtData.debtor}|${newDebtData.creditor}`
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Debt record created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewDebtData({ name: "", amount: "", debtor: "", creditor: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingDebt(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const callIsAvailable = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const result = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Contract is available and responsive!" 
      });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Contract call failed" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const calculateStats = (): DebtStats => {
    const filteredDebts = debts.filter(debt => {
      const matchesSearch = debt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           debt.debtor.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           debt.creditor.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterType === "all" || 
                           (filterType === "verified" && debt.isVerified) ||
                           (filterType === "pending" && !debt.isVerified);
      return matchesSearch && matchesFilter;
    });

    const verifiedDebts = filteredDebts.filter(debt => debt.isVerified);
    const netBalance = verifiedDebts.reduce((sum, debt) => {
      const amount = debt.decryptedValue || 0;
      return debt.creator.toLowerCase() === address?.toLowerCase() ? sum - amount : sum + amount;
    }, 0);

    return {
      totalDebts: filteredDebts.length,
      verifiedDebts: verifiedDebts.length,
      netBalance,
      activeTransactions: filteredDebts.filter(debt => !debt.isVerified).length
    };
  };

  const stats = calculateStats();
  const filteredDebts = debts.filter(debt => {
    const matchesSearch = debt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         debt.debtor.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         debt.creditor.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" || 
                         (filterType === "verified" && debt.isVerified) ||
                         (filterType === "pending" && !debt.isVerified);
    return matchesSearch && matchesFilter;
  });

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Confidential Debt Ledger 🔐</h1>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">💰</div>
            <h2>Connect Your Wallet to Continue</h2>
            <p>Please connect your wallet to initialize the encrypted debt ledger system.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet using the button above</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE system will automatically initialize</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Start recording encrypted debt transactions</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">This may take a few moments</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted debt ledger...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Confidential Debt Ledger 🔐</h1>
          <p>Privacy-First Debt Management with FHE</p>
        </div>
        
        <div className="header-actions">
          <button onClick={callIsAvailable} className="test-btn">
            Test Contract
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + New Debt Record
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="control-panel">
          <div className="search-section">
            <input
              type="text"
              placeholder="Search debts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <div className="filter-buttons">
              <button 
                className={filterType === "all" ? "active" : ""}
                onClick={() => setFilterType("all")}
              >
                All ({debts.length})
              </button>
              <button 
                className={filterType === "verified" ? "active" : ""}
                onClick={() => setFilterType("verified")}
              >
                Verified ({debts.filter(d => d.isVerified).length})
              </button>
              <button 
                className={filterType === "pending" ? "active" : ""}
                onClick={() => setFilterType("pending")}
              >
                Pending ({debts.filter(d => !d.isVerified).length})
              </button>
            </div>
          </div>
          
          <button 
            onClick={() => setShowStats(!showStats)}
            className="toggle-stats-btn"
          >
            {showStats ? "Hide" : "Show"} Statistics
          </button>
        </div>

        {showStats && (
          <div className="stats-section">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-content">
                  <h3>Total Records</h3>
                  <div className="stat-value">{stats.totalDebts}</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-content">
                  <h3>Verified</h3>
                  <div className="stat-value">{stats.verifiedDebts}</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">💰</div>
                <div className="stat-content">
                  <h3>Net Balance</h3>
                  <div className="stat-value">{stats.netBalance}</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">⏳</div>
                <div className="stat-content">
                  <h3>Pending</h3>
                  <div className="stat-value">{stats.activeTransactions}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="debts-section">
          <div className="section-header">
            <h2>Debt Records</h2>
            <div className="header-actions">
              <button 
                onClick={loadData} 
                className="refresh-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="debts-list">
            {filteredDebts.length === 0 ? (
              <div className="no-debts">
                <p>No debt records found</p>
                <button 
                  className="create-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Record
                </button>
              </div>
            ) : filteredDebts.map((debt, index) => (
              <div 
                className={`debt-item ${selectedDebt?.id === debt.id ? "selected" : ""} ${debt.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedDebt(debt)}
              >
                <div className="debt-header">
                  <div className="debt-title">{debt.name}</div>
                  <div className={`debt-status ${debt.isVerified ? "verified" : "pending"}`}>
                    {debt.isVerified ? "✅ Verified" : "🔓 Pending"}
                  </div>
                </div>
                <div className="debt-parties">
                  <span>👤 {debt.debtor}</span>
                  <span className="arrow">→</span>
                  <span>👤 {debt.creditor}</span>
                </div>
                <div className="debt-meta">
                  <span>Date: {new Date(debt.timestamp * 1000).toLocaleDateString()}</span>
                  {debt.isVerified && debt.decryptedValue && (
                    <span className="debt-amount">Amount: {debt.decryptedValue}</span>
                  )}
                </div>
                <div className="debt-creator">Creator: {debt.creator.substring(0, 6)}...{debt.creator.substring(38)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateDebt 
          onSubmit={createDebt} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingDebt} 
          debtData={newDebtData} 
          setDebtData={setNewDebtData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedDebt && (
        <DebtDetailModal 
          debt={selectedDebt} 
          onClose={() => { 
            setSelectedDebt(null); 
            setDecryptedData({ amount: null }); 
          }} 
          decryptedData={decryptedData} 
          setDecryptedData={setDecryptedData} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedDebt.amount)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateDebt: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  debtData: any;
  setDebtData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, debtData, setDebtData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'amount') {
      const intValue = value.replace(/[^\d]/g, '');
      setDebtData({ ...debtData, [name]: intValue });
    } else {
      setDebtData({ ...debtData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-debt-modal">
        <div className="modal-header">
          <h2>New Debt Record</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Encryption</strong>
            <p>Debt amount will be encrypted with Zama FHE 🔐 (Integer only)</p>
          </div>
          
          <div className="form-group">
            <label>Description *</label>
            <input 
              type="text" 
              name="name" 
              value={debtData.name} 
              onChange={handleChange} 
              placeholder="Enter debt description..." 
            />
          </div>
          
          <div className="form-group">
            <label>Amount (Integer only) *</label>
            <input 
              type="number" 
              name="amount" 
              value={debtData.amount} 
              onChange={handleChange} 
              placeholder="Enter amount..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Debtor *</label>
            <input 
              type="text" 
              name="debtor" 
              value={debtData.debtor} 
              onChange={handleChange} 
              placeholder="Enter debtor name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Creditor *</label>
            <input 
              type="text" 
              name="creditor" 
              value={debtData.creditor} 
              onChange={handleChange} 
              placeholder="Enter creditor name..." 
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !debtData.name || !debtData.amount || !debtData.debtor || !debtData.creditor} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting and Creating..." : "Create Record"}
          </button>
        </div>
      </div>
    </div>
  );
};

const DebtDetailModal: React.FC<{
  debt: DebtRecord;
  onClose: () => void;
  decryptedData: { amount: number | null };
  setDecryptedData: (value: { amount: number | null }) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ debt, onClose, decryptedData, setDecryptedData, isDecrypting, decryptData }) => {
  const handleDecrypt = async () => {
    if (decryptedData.amount !== null) { 
      setDecryptedData({ amount: null }); 
      return; 
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedData({ amount: decrypted });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="debt-detail-modal">
        <div className="modal-header">
          <h2>Debt Record Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="debt-info">
            <div className="info-item">
              <span>Description:</span>
              <strong>{debt.name}</strong>
            </div>
            <div className="info-item">
              <span>Creator:</span>
              <strong>{debt.creator.substring(0, 6)}...{debt.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date Created:</span>
              <strong>{new Date(debt.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Parties:</span>
              <strong>{debt.debtor} → {debt.creditor}</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Debt Data</h3>
            
            <div className="data-row">
              <div className="data-label">Amount:</div>
              <div className="data-value">
                {debt.isVerified && debt.decryptedValue ? 
                  `${debt.decryptedValue} (On-chain Verified)` : 
                  decryptedData.amount !== null ? 
                  `${decryptedData.amount} (Locally Decrypted)` : 
                  "🔒 FHE Encrypted Integer"
                }
              </div>
              <button 
                className={`decrypt-btn ${(debt.isVerified || decryptedData.amount !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "🔓 Verifying..."
                ) : debt.isVerified ? (
                  "✅ Verified"
                ) : decryptedData.amount !== null ? (
                  "🔄 Re-verify"
                ) : (
                  "🔓 Verify Decryption"
                )}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE 🔐 Self-Relaying Decryption</strong>
                <p>Debt amount is encrypted on-chain. Click "Verify Decryption" to perform offline decryption and on-chain verification.</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!debt.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              {isDecrypting ? "Verifying on-chain..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;



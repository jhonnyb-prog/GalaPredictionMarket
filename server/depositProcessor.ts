import { ethers } from 'ethers';
import { storage } from './storage';
import { notificationService } from './notifications';

// ERC-20 ABI for Transfer events
const ERC20_TRANSFER_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// Token contracts
const TOKEN_ADDRESSES = {
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
} as const;

const TOKEN_DECIMALS = {
  USDC: 6,
  USDT: 6
} as const;

// Ethereum provider for checking transactions
function getEthereumProvider(): ethers.JsonRpcProvider {
  // Using a reliable public RPC for mainnet
  return new ethers.JsonRpcProvider('https://eth.llamarpc.com');
}

export class DepositProcessor {
  private isProcessing = false;
  private provider: ethers.JsonRpcProvider;
  private treasuryAddress: string;

  constructor(treasuryAddress: string) {
    this.provider = getEthereumProvider();
    this.treasuryAddress = treasuryAddress;
  }

  /**
   * Process all pending deposits by checking the blockchain
   */
  async processPendingDeposits(): Promise<void> {
    if (this.isProcessing) {
      console.log('Deposit processing already in progress, skipping...');
      return;
    }

    this.isProcessing = true;
    console.log('🔍 Starting deposit processing...');

    try {
      // Get all pending deposits
      const pendingDeposits = await storage.getPendingDeposits();
      console.log(`Found ${pendingDeposits.length} pending deposits to check`);

      if (pendingDeposits.length === 0) {
        console.log('No pending deposits to process');
        return;
      }

      let processedCount = 0;
      let confirmedCount = 0;
      let failedCount = 0;

      // Process each pending deposit
      for (const deposit of pendingDeposits) {
        try {
          console.log(`Checking transaction: ${deposit.transactionHash}`);
          
          // Get transaction receipt from blockchain
          const receipt = await this.provider.getTransactionReceipt(deposit.transactionHash);
          
          if (!receipt) {
            console.log(`Transaction ${deposit.transactionHash} not yet mined`);
            continue;
          }

          if (receipt.status !== 1) {
            console.log(`Transaction ${deposit.transactionHash} failed on blockchain`);
            await this.markDepositFailed(deposit.id, 'Transaction failed on blockchain');
            failedCount++;
            continue;
          }

          // Verify this is a transfer to our treasury wallet
          const isValidDeposit = await this.verifyDepositTransaction(receipt, deposit);
          
          if (!isValidDeposit.valid) {
            console.log(`Transaction ${deposit.transactionHash} is not a valid deposit: ${isValidDeposit.reason}`);
            await this.markDepositFailed(deposit.id, isValidDeposit.reason);
            failedCount++;
            continue;
          }

          // Extract verified amount and sender from blockchain
          const blockchainAmount = isValidDeposit.amount!;
          const fromAddress = isValidDeposit.fromAddress!;

          // Check for sufficient confirmations (6 blocks for security)
          const currentBlock = await this.provider.getBlockNumber();
          const confirmations = currentBlock - receipt.blockNumber + 1;

          if (confirmations < 6) {
            console.log(`Transaction ${deposit.transactionHash} has ${confirmations} confirmations, need 6`);
            // Update confirmations count but keep pending
            await storage.updateDeposit(deposit.id, {
              blockNumber: receipt.blockNumber,
              confirmations: confirmations,
              fromAddress: fromAddress
            });
            continue;
          }

          // Deposit is confirmed! Credit user balance
          await this.creditUserDeposit(deposit, blockchainAmount, fromAddress, receipt.blockNumber, confirmations);
          confirmedCount++;

          console.log(`✅ Deposit ${deposit.id} confirmed and credited: ${blockchainAmount} ${deposit.tokenType}`);

        } catch (error) {
          console.error(`Error processing deposit ${deposit.id}:`, error);
          await this.markDepositFailed(deposit.id, `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          failedCount++;
        }

        processedCount++;
      }

      console.log(`📊 Deposit processing complete: ${processedCount} checked, ${confirmedCount} confirmed, ${failedCount} failed`);

    } catch (error) {
      console.error('Error in deposit processing:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Verify that a transaction receipt represents a valid deposit to our treasury
   */
  private async verifyDepositTransaction(receipt: ethers.TransactionReceipt, deposit: any): Promise<{
    valid: boolean;
    reason?: string;
    amount?: string;
    fromAddress?: string;
  }> {
    try {
      // Check if this is a transfer to our treasury address
      const expectedTokenAddress = deposit.tokenContract.toLowerCase();
      
      // Find Transfer event in the logs
      const transferTopic = ethers.id("Transfer(address,address,uint256)");
      
      const transferLog = receipt.logs.find(log => 
        log.address.toLowerCase() === expectedTokenAddress &&
        log.topics[0] === transferTopic
      );

      if (!transferLog) {
        return { valid: false, reason: 'No valid token transfer found in transaction' };
      }

      // Decode transfer details
      const fromAddress = ethers.getAddress('0x' + transferLog.topics[1].slice(26));
      const toAddress = ethers.getAddress('0x' + transferLog.topics[2].slice(26));
      const amount = ethers.getBigInt(transferLog.data);

      // Verify recipient is our treasury wallet
      if (toAddress.toLowerCase() !== this.treasuryAddress.toLowerCase()) {
        return { valid: false, reason: `Transfer not sent to treasury wallet. Expected: ${this.treasuryAddress}, Got: ${toAddress}` };
      }

      // Get token decimals and format amount
      const decimals = deposit.tokenType === 'USDC' ? TOKEN_DECIMALS.USDC : TOKEN_DECIMALS.USDT;
      const formattedAmount = ethers.formatUnits(amount, decimals);

      // Verify amount matches what user claimed (with small tolerance for rounding)
      const expectedAmount = parseFloat(deposit.amount);
      const actualAmount = parseFloat(formattedAmount);
      const tolerance = 0.000001; // 1 millionth tolerance

      if (Math.abs(actualAmount - expectedAmount) > tolerance) {
        return { 
          valid: false, 
          reason: `Amount mismatch. Expected: ${expectedAmount}, Actual: ${actualAmount}` 
        };
      }

      // Verify minimum amount (1 USDC/USDT)
      if (actualAmount < 1) {
        return { valid: false, reason: `Amount below minimum: ${actualAmount}` };
      }

      return {
        valid: true,
        amount: formattedAmount,
        fromAddress: fromAddress
      };

    } catch (error) {
      console.error('Error verifying transaction:', error);
      return { valid: false, reason: `Verification error: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  /**
   * Credit a confirmed deposit to user's balance
   */
  private async creditUserDeposit(deposit: any, amount: string, fromAddress: string, blockNumber: number, confirmations: number): Promise<void> {
    try {
      // Get current user balance
      const currentBalance = await storage.getUserBalance(deposit.userId);
      const currentAmount = parseFloat(currentBalance?.balance || '0');
      const depositAmount = parseFloat(amount);
      const newBalance = currentAmount + depositAmount;

      // Update user balance
      await storage.updateUserBalance(deposit.userId, newBalance.toString());

      // Mark deposit as confirmed and credited
      await storage.updateDeposit(deposit.id, {
        status: 'confirmed' as any,
        fromAddress: fromAddress,
        amount: amount,
        blockNumber: blockNumber,
        confirmations: confirmations,
        confirmedAt: new Date(),
        creditedAt: new Date()
      });

      console.log(`💰 Credited ${amount} ${deposit.tokenType} to user ${deposit.userId}. New balance: ${newBalance}`);

      // Send notification to user
      notificationService.notifyDepositConfirmed(
        deposit.userId, 
        amount, 
        deposit.tokenType, 
        deposit.transactionHash
      );

    } catch (error) {
      console.error('Error crediting deposit:', error);
      throw error;
    }
  }

  /**
   * Mark a deposit as failed
   */
  private async markDepositFailed(depositId: string, reason: string): Promise<void> {
    // Get deposit info for notification
    const deposit = await storage.getDeposit(depositId);
    
    await storage.updateDeposit(depositId, {
      status: 'failed' as any,
      failureReason: reason
    });

    // Send failure notification
    if (deposit) {
      notificationService.notifyDepositFailed(
        deposit.userId,
        deposit.tokenType,
        deposit.transactionHash,
        reason
      );
    }
  }

  /**
   * Start the background processing service
   */
  start(intervalMinutes: number = 2): void {
    console.log(`🚀 Starting deposit processor with ${intervalMinutes} minute intervals`);
    
    // Process immediately on start
    this.processPendingDeposits().catch(console.error);
    
    // Then process every N minutes
    setInterval(() => {
      this.processPendingDeposits().catch(console.error);
    }, intervalMinutes * 60 * 1000);
  }
}

// Factory function to safely create processor
export function createDepositProcessor(): DepositProcessor | null {
  const treasuryAddress = process.env.ONRAMP_WALLET_ETH;
  if (!treasuryAddress) {
    console.warn('⚠️ ONRAMP_WALLET_ETH not configured - deposit processing disabled');
    return null;
  }
  return new DepositProcessor(treasuryAddress);
}
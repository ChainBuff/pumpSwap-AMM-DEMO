import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  NATIVE_MINT,
} from "@solana/spl-token";

// WSOL 的 mint 地址
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

/**
 * 查询钱包的 WSOL 相关信息
 */
async function getWSOLInfo(
  connection: Connection,
  walletAddress: PublicKey
): Promise<{
  solBalance: number;
  wsolBalance: number;
  wsolAccount: string | null;
  wsolAccountExists: boolean;
  totalSolValue: number;
}> {
  console.log(`查询钱包 WSOL 信息: ${walletAddress.toString()}`);

  // 1. 查询 SOL 余额
  const solBalance = await connection.getBalance(walletAddress);
  const solBalanceInSol = solBalance / 1_000_000_000;

  console.log(`💰 SOL 余额: ${solBalanceInSol.toFixed(6)} SOL`);

  // 2. 计算 WSOL ATA 地址
  const wsolAta = await getAssociatedTokenAddress(WSOL_MINT, walletAddress);

  console.log(`🔗 WSOL ATA 地址: ${wsolAta.toString()}`);

  let wsolBalance = 0;
  let wsolAccountExists = false;

  try {
    // 3. 查询 WSOL 账户余额
    const wsolBalanceResp = await connection.getTokenAccountBalance(wsolAta);
    wsolBalance = parseFloat(wsolBalanceResp.value.uiAmountString || "0");
    wsolAccountExists = true;

    console.log(`🪙 WSOL 余额: ${wsolBalance.toFixed(6)} WSOL`);

    if (wsolBalance > 0) {
      console.log(`📊 原始余额: ${wsolBalanceResp.value.amount} lamports`);
      console.log(`🔢 小数位: ${wsolBalanceResp.value.decimals}`);
    }
  } catch (error) {
    console.log(`❌ WSOL 账户不存在或无余额`);
    wsolAccountExists = false;
  }

  // 4. 计算总价值
  const totalSolValue = solBalanceInSol + wsolBalance;

  console.log(`\n📈 总 SOL 价值: ${totalSolValue.toFixed(6)} SOL`);
  console.log(`   ├─ 原生 SOL: ${solBalanceInSol.toFixed(6)} SOL`);
  console.log(`   └─ WSOL: ${wsolBalance.toFixed(6)} SOL`);

  return {
    solBalance: solBalanceInSol,
    wsolBalance: wsolBalance,
    wsolAccount: wsolAccountExists ? wsolAta.toString() : null,
    wsolAccountExists: wsolAccountExists,
    totalSolValue: totalSolValue,
  };
}

/**
 * 检查 WSOL 账户详细信息
 */
async function getWSOLAccountDetails(
  connection: Connection,
  walletAddress: PublicKey
) {
  console.log("=== WSOL 账户详细信息 ===");

  const wsolAta = await getAssociatedTokenAddress(WSOL_MINT, walletAddress);

  try {
    // 获取账户信息
    const accountInfo = await connection.getAccountInfo(wsolAta);

    if (!accountInfo) {
      console.log("❌ WSOL 账户不存在");
      return null;
    }

    console.log("✅ WSOL 账户存在");
    console.log(`账户地址: ${wsolAta.toString()}`);
    console.log(`账户所有者: ${accountInfo.owner.toString()}`);
    console.log(`账户大小: ${accountInfo.data.length} bytes`);
    console.log(`租金豁免: ${accountInfo.lamports} lamports`);

    // 获取代币余额详情
    const balance = await connection.getTokenAccountBalance(wsolAta);

    console.log("\n💰 余额详情:");
    console.log(`UI 余额: ${balance.value.uiAmountString} WSOL`);
    console.log(`原始余额: ${balance.value.amount} lamports`);
    console.log(`小数位: ${balance.value.decimals}`);

    return {
      address: wsolAta.toString(),
      exists: true,
      owner: accountInfo.owner.toString(),
      lamports: accountInfo.lamports,
      dataSize: accountInfo.data.length,
      balance: balance.value,
    };
  } catch (error) {
    console.log(`❌ 获取 WSOL 账户信息失败: ${error.message}`);
    return null;
  }
}

/**
 * 查找所有与 WSOL 相关的账户（包括非 ATA）
 */
async function findAllWSOLAccounts(
  connection: Connection,
  walletAddress: PublicKey
) {
  console.log("=== 查找所有 WSOL 相关账户 ===");

  try {
    // 查询所有该钱包拥有的代币账户
    const tokenAccounts = await connection.getTokenAccountsByOwner(
      walletAddress,
      {
        mint: WSOL_MINT, // 只查询 WSOL
      }
    );

    console.log(`找到 ${tokenAccounts.value.length} 个 WSOL 账户`);

    const wsolAccounts = [];

    for (let i = 0; i < tokenAccounts.value.length; i++) {
      const account = tokenAccounts.value[i];

      try {
        const balance = await connection.getTokenAccountBalance(account.pubkey);
        const uiAmount = parseFloat(balance.value.uiAmountString || "0");

        // 检查是否是 ATA
        const expectedAta = await getAssociatedTokenAddress(
          WSOL_MINT,
          walletAddress
        );
        const isATA = expectedAta.equals(account.pubkey);

        wsolAccounts.push({
          address: account.pubkey.toString(),
          balance: uiAmount,
          rawBalance: balance.value.amount,
          decimals: balance.value.decimals,
          isATA: isATA,
          accountType: isATA
            ? "Associated Token Account"
            : "Regular Token Account",
        });

        console.log(`\n${i + 1}. WSOL 账户:`);
        console.log(`   地址: ${account.pubkey.toString()}`);
        console.log(`   余额: ${uiAmount} WSOL`);
        console.log(`   类型: ${isATA ? "ATA" : "普通代币账户"}`);
        console.log(`   原始余额: ${balance.value.amount}`);
      } catch (error) {
        console.log(`获取账户 ${account.pubkey.toString()} 余额失败`);
      }
    }

    return wsolAccounts;
  } catch (error) {
    console.log(`查询 WSOL 账户失败: ${error.message}`);
    return [];
  }
}

/**
 * 比较 SOL 和 WSOL 的余额分布
 */
async function compareSOLAndWSOL(
  connection: Connection,
  walletAddress: PublicKey
) {
  console.log("=== SOL vs WSOL 余额分析 ===");

  const info = await getWSOLInfo(connection, walletAddress);

  console.log(`\n📊 余额分布:`);

  const solPercentage = (info.solBalance / info.totalSolValue) * 100;
  const wsolPercentage = (info.wsolBalance / info.totalSolValue) * 100;

  console.log(
    `原生 SOL: ${info.solBalance.toFixed(6)} SOL (${solPercentage.toFixed(1)}%)`
  );
  console.log(
    `WSOL: ${info.wsolBalance.toFixed(6)} SOL (${wsolPercentage.toFixed(1)}%)`
  );
  console.log(`总计: ${info.totalSolValue.toFixed(6)} SOL`);

  // 建议
  console.log(`\n💡 建议:`);
  if (info.wsolBalance > 0.001) {
    console.log(
      `- 你有 ${info.wsolBalance.toFixed(6)} WSOL 可以转换回 SOL 以节省租金`
    );
  }
  if (!info.wsolAccountExists) {
    console.log(`- WSOL 账户不存在，如需使用 WSOL 需要先创建`);
  }
  if (info.wsolBalance === 0 && info.wsolAccountExists) {
    console.log(`- WSOL 账户存在但余额为0，可以关闭以回收租金`);
  }

  return {
    solBalance: info.solBalance,
    wsolBalance: info.wsolBalance,
    totalValue: info.totalSolValue,
    solPercentage: solPercentage,
    wsolPercentage: wsolPercentage,
    hasWSOLAccount: info.wsolAccountExists,
  };
}

/**
 * 快速检查 WSOL 状态
 */
async function quickWSOLCheck(
  connection: Connection,
  walletAddress: PublicKey
) {
  console.log("🔍 快速 WSOL 检查");

  const wsolAta = await getAssociatedTokenAddress(WSOL_MINT, walletAddress);

  try {
    const balance = await connection.getTokenAccountBalance(wsolAta);
    const wsolAmount = parseFloat(balance.value.uiAmountString || "0");

    if (wsolAmount > 0) {
      console.log(`✅ 有 WSOL 余额: ${wsolAmount} WSOL`);
      return {
        hasWSol: true,
        balance: wsolAmount,
        account: wsolAta.toString(),
      };
    } else {
      console.log(`⚪ WSOL 账户存在但余额为 0`);
      return { hasWSol: false, balance: 0, account: wsolAta.toString() };
    }
  } catch (error) {
    console.log(`❌ 没有 WSOL 账户`);
    return { hasWSol: false, balance: 0, account: null };
  }
}

// 使用示例
async function example() {
  const connection = new Connection("https://solana-rpc.publicnode.com");

  // 替换为你的钱包地址
  const walletAddress = new PublicKey(
    "4gBb4oW7EEGU3oD83ffRYyJPNxoL4qNhjYrT764Hra9e"
  );

  try {
    console.log("=== WSOL 查询示例 ===\n");

    // 1. 快速检查
    console.log("1. 快速检查:");
    await quickWSOLCheck(connection, walletAddress);

    console.log("\n" + "=".repeat(50) + "\n");

    // 2. 详细信息
    console.log("2. 详细信息:");
    await getWSOLInfo(connection, walletAddress);

    console.log("\n" + "=".repeat(50) + "\n");

    // 3. 账户详情
    console.log("3. 账户详情:");
    await getWSOLAccountDetails(connection, walletAddress);

    console.log("\n" + "=".repeat(50) + "\n");

    // 4. 查找所有 WSOL 账户
    console.log("4. 所有 WSOL 账户:");
    await findAllWSOLAccounts(connection, walletAddress);

    console.log("\n" + "=".repeat(50) + "\n");

    // 5. SOL vs WSOL 分析
    console.log("5. SOL vs WSOL 分析:");
    await compareSOLAndWSOL(connection, walletAddress);
  } catch (error) {
    console.error("查询失败:", error);
  }
}
example()
// CLI 命令行使用
async function cliWSOLCheck() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("使用方法: node wsol-checker.js <钱包地址>");
    return;
  }

  const walletAddress = new PublicKey(args[0]);
  const connection = new Connection("https://api.mainnet-beta.solana.com");

  await quickWSOLCheck(connection, walletAddress);
}

export {
  getWSOLInfo,
  getWSOLAccountDetails,
  findAllWSOLAccounts,
  compareSOLAndWSOL,
  quickWSOLCheck,
  WSOL_MINT,
};

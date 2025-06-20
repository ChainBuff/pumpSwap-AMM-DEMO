import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  Connection,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeAccountInstruction,
} from "@solana/spl-token";

// WSOL mint address
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

/**
 * 创建带种子的账户指令
 */
async function createAccountWithSeedInstruction(
  payer: PublicKey,
  base: PublicKey,
  seed: string,
  lamports: number,
  space: number,
  owner: PublicKey
) {
  // 根据 base + seed 计算新账户地址
  const newAccount = await PublicKey.createWithSeed(base, seed, owner);

  // 创建账户指令
  const instruction = SystemProgram.createAccountWithSeed({
    fromPubkey: payer,
    basePubkey: base,
    seed: seed,
    newAccountPubkey: newAccount,
    lamports: lamports,
    space: space,
    programId: owner,
  });

  return { instruction, newAccount };
}

/**
 * 计算lamports的几种方式
 */
function calculateLamports(
  type: "rent-only" | "wsol-wrap" | "custom",
  customAmount?: number
): number {
  // 方式1: 只支付租金豁免费用 (最小值)
  if (type === "rent-only") {
    // 代币账户165字节的租金豁免费用约为 2,039,280 lamports (约0.002 SOL)
    return 2_039_280; // 这是固定值，可以通过 connection.getMinimumBalanceForRentExemption(165) 获取准确值
  }

  // 方式2: 包装SOL (租金 + 要包装的SOL数量)
  if (type === "wsol-wrap") {
    const rentExemption = 2_039_280;
    const wrapAmount = Math.floor(0.007381057 * LAMPORTS_PER_SOL); // 你交易中的数量
    return rentExemption + wrapAmount;
  }

  // 方式3: 自定义金额
  if (type === "custom" && customAmount) {
    return Math.floor(customAmount * LAMPORTS_PER_SOL);
  }

  return 0;
}

/**
 * 初始化代币账户指令
 */
function createInitializeTokenAccountInstruction(
  account: PublicKey,
  mint: PublicKey,
  owner: PublicKey
): TransactionInstruction {
  return createInitializeAccountInstruction(
    account,
    mint,
    owner,
    TOKEN_PROGRAM_ID
  );
}

/**
 * 通用函数：创建WSOL账户指令
 */
async function createWSOLAccountInstructions(
  payer: PublicKey,
  base: PublicKey,
  seed: string,
  solAmount: number
) {
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  const space = 165;
  const owner = TOKEN_PROGRAM_ID;

  const { instruction: createAccountInstruction, newAccount } =
    await createAccountWithSeedInstruction(
      payer,
      base,
      seed,
      lamports,
      space,
      owner
    );

  const initializeAccountInstruction = createInitializeTokenAccountInstruction(
    newAccount,
    WSOL_MINT,
    payer
  );

  return {
    createAccountInstruction,
    initializeAccountInstruction,
    newAccountAddress: newAccount,
  };
}
async function getOrCreateAssociatedTokenAccount2(
  connection: Connection,
  ataAddress: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  payer: PublicKey
) {
  try {
    // 检查账户是否存在
    const accountInfo = await connection.getAccountInfo(ataAddress);

    if (accountInfo) {
      console.log("ATA账户已存在");
      return {
        ataAddress,
        instruction: null, // 账户已存在，不需要创建指令
        exists: true,
      };
    }

    console.log("ATA账户不存在，准备创建指令");

    // 创建ATA账户的指令
    const createAtaInstruction = createAssociatedTokenAccountInstruction(
      payer, // 支付者
      ataAddress, // ATA地址
      owner, // 账户所有者
      mint, // 代币mint
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    return {
      ataAddress,
      instruction: createAtaInstruction,
      exists: false,
    };
  } catch (error) {
    console.error("检查或创建ATA账户时出错:", error);
    throw error;
  }
}

export { createWSOLAccountInstructions, getOrCreateAssociatedTokenAccount2 };

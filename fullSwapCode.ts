import {
  Connection,
  PublicKey,
  Keypair,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
  AccountMeta,
  VersionedTransaction,
  TransactionMessage,
  GetProgramAccountsFilter,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createInitializeAccountInstruction,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import * as dotenv from "dotenv";
import {
  createWSOLAccountInstructions,
  getOrCreateAssociatedTokenAccount2,
} from "./utils";

dotenv.config();

// config
const RPC_ENDPOINT =
  process.env.SOLANA_NODE_RPC_ENDPOINT || "https://solana-rpc.publicnode.com";
const TOKEN_MINT = new PublicKey(
  "Dk7Xy5sYRvQrLLXXJ31fLWiB6E6Es773asXgedkSpump"
);
const PRIVATE_KEY = bs58.decode(process.env.SOLANA_PRIVATE_KEY || "");
const PAYER = Keypair.fromSecretKey(PRIVATE_KEY);

const SLIPPAGE = 0.05;
const TOKEN_DECIMALS = 6;

// 函数标识符 签名
const BUY_DISCRIMINATOR = Buffer.from("66063d1201daebea", "hex");

// Accounts
const SOL = new PublicKey("So11111111111111111111111111111111111111112");
const PUMP_AMM_PROGRAM_ID = new PublicKey(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
);
const PUMP_SWAP_GLOBAL_CONFIG = new PublicKey(
  "ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw"
);
const PUMP_PROTOCOL_FEE_RECIPIENT = new PublicKey(
  "7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ"
);
const PUMP_PROTOCOL_FEE_RECIPIENT_TOKEN_ACCOUNT = new PublicKey(
  "7GFUN3bWzJMKMRZ34JLsvcqdssDbXnp589SiE33KVwcC"
);
const PUMP_SWAP_EVENT_AUTHORITY = new PublicKey(
  "GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR"
);
// CU limit price
const LAMPORTS_PER_SOL = 1_000_000_000;
const COMPUTE_UNIT_PRICE = 6666666;
const COMPUTE_UNIT_BUDGET = 150_000;
interface MarketData {
  pool_bump: number;
  index: number;
  creator: string;
  base_mint: string;
  quote_mint: string;
  lp_mint: string;
  pool_base_token_account: string;
  pool_quote_token_account: string;
  lp_supply: number;
  coin_creator: string;
}

/**
 * find PoolAddress  pump fun 称之为market
 * @param baseMintAddressAddress 代币地址Mint账户
 * @param ammProgramId
 */
async function getMarketAddressByBaseMint(
  connection: Connection,
  baseMintAddress: PublicKey,
  ammProgramId: PublicKey
): Promise<PublicKey> {
  const baseMintBytes = baseMintAddress.toBuffer();
  const offset = 43;

  const filters: GetProgramAccountsFilter[] = [
    {
      memcmp: {
        offset: offset,
        bytes: bs58.encode(baseMintBytes),
      },
    },
  ];

  const response = await connection.getProgramAccounts(ammProgramId, {
    encoding: "base64",
    filters: filters,
  });

  if (response.length === 0) {
    throw new Error("No market found for the given token mint");
  }

  return response[0].pubkey;
}

/**
 * 池子数据
 * @param marketAddress 池子地址
 */
async function getMarketData(
  connection: Connection,
  marketAddress: PublicKey
): Promise<MarketData> {
  const response = await connection.getAccountInfo(marketAddress, "confirmed");

  if (!response || !response.data) {
    throw new Error("Market account not found");
  }

  const data = response.data;

  if (!Buffer.isBuffer(data)) {
    throw new Error("Expected Buffer data from account info");
  }
  const parsedData: Partial<MarketData> = {};

  // Start after the 8-byte discriminator
  let offset = 8;

  // Define the structure of the market account data
  const fields: Array<[keyof MarketData, string]> = [
    ["pool_bump", "u8"],
    ["index", "u16"],
    ["creator", "pubkey"],
    ["base_mint", "pubkey"],
    ["quote_mint", "pubkey"],
    ["lp_mint", "pubkey"],
    ["pool_base_token_account", "pubkey"],
    ["pool_quote_token_account", "pubkey"],
    ["lp_supply", "u64"],
    ["coin_creator", "pubkey"],
  ];

  for (const [fieldName, fieldType] of fields) {
    if (fieldType === "pubkey") {
      const value = data.subarray(offset, offset + 32);
      parsedData[fieldName] = bs58.encode(value) as any;
      offset += 32;
    } else if (fieldType === "u64" || fieldType === "i64") {
      const value = data.readBigUInt64LE(offset);
      parsedData[fieldName] = Number(value) as any;
      offset += 8;
    } else if (fieldType === "u16") {
      const value = data.readUInt16LE(offset);
      parsedData[fieldName] = value as any;
      offset += 2;
    } else if (fieldType === "u8") {
      const value = data.readUInt8(offset);
      parsedData[fieldName] = value as any;
      offset += 1;
    }
  }
  console.log(parsedData);
  return parsedData as MarketData;
}

/**
 * 手续费 coinCreatorFeeBasisPoints
 */
function findCoinCreatorVault(coinCreator: PublicKey): PublicKey {
  const [derivedAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator_vault"), coinCreator.toBuffer()],
    PUMP_AMM_PROGRAM_ID
  );
  return derivedAddress;
}
//
function calculateCoinCreatorVaultAta(
  coinCreatorVaultAuthority: PublicKey,
  quoteTokenProgram: PublicKey,
  quoteMint: PublicKey
): PublicKey {
  const seeds = [
    coinCreatorVaultAuthority.toBuffer(),
    quoteTokenProgram.toBuffer(),
    quoteMint.toBuffer(),
  ];

  const [pda] = PublicKey.findProgramAddressSync(
    seeds,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const targetAta = new PublicKey(
    "eG3Swe7yrufgCmohTV3wbvQnBLyXauQJyJ65uPfKsgX"
  );
  console.log("targetAta", targetAta);
  console.log("fetchResult", pda);
  return pda;
}
/**
 * 计算汇率
 */
async function calculateTokenPoolPrice(
  connection: Connection,
  poolBaseTokenAccount: PublicKey,
  poolQuoteTokenAccount: PublicKey
): Promise<number> {
  const [baseBalanceResp, quoteBalanceResp] = await Promise.all([
    connection.getTokenAccountBalance(poolBaseTokenAccount),
    connection.getTokenAccountBalance(poolQuoteTokenAccount),
  ]);

  // Extract the UI amounts (human-readable with decimals)
  const baseAmount = parseFloat(baseBalanceResp.value.uiAmountString || "0");
  const quoteAmount = parseFloat(quoteBalanceResp.value.uiAmountString || "0");

  if (baseAmount === 0) {
    throw new Error("Base token balance is zero");
  }

  console.log("baseAmount", baseAmount);
  console.log("quoteAmount", quoteAmount);
  return quoteAmount / baseAmount;
}

async function buyPumpSwap(
  connection: Connection,
  pumpFunAmmMarket: PublicKey,
  payer: Keypair,
  baseMint: PublicKey,
  userBaseTokenAccount: PublicKey,
  userQuoteTokenAccount: PublicKey,
  poolBaseTokenAccount: PublicKey,
  poolQuoteTokenAccount: PublicKey,
  coinCreatorVaultAuthority: PublicKey,
  coinCreatorVaultAta: PublicKey,
  solAmountToSpend: number,
  slippage: number = 0.25
): Promise<string | null> {
  try {
    // 汇率
    const tokenPriceSol = await calculateTokenPoolPrice(
      connection,
      poolBaseTokenAccount,
      poolQuoteTokenAccount
    );
    console.log(`Token price in SOL: ${tokenPriceSol.toFixed(10)} SOL`);

    // 滑点计算baseAmountOut ： solAmount / 汇率
    const baseAmountOut = Math.floor(
      (solAmountToSpend / tokenPriceSol) * Math.pow(10, TOKEN_DECIMALS)
    );
    const slippageFactor = 1 + slippage;
    // sol 滑点
    const maxSolInput = Math.floor(
      solAmountToSpend * slippageFactor * LAMPORTS_PER_SOL
    );

    console.log(
      `Buying ${baseAmountOut / Math.pow(10, TOKEN_DECIMALS)} tokens`
    );
    console.log(`Maximum SOL input: ${maxSolInput / LAMPORTS_PER_SOL} SOL`);
    const rentSolAmount = await connection.getMinimumBalanceForRentExemption(
      165
    );
    console.log("最小租金", rentSolAmount);
    const {
      createAccountInstruction,
      initializeAccountInstruction,
      newAccountAddress,
    } = await createWSOLAccountInstructions(
      payer.publicKey,
      payer.publicKey,
      "AjaC6Yz8tvuM2UmU5PsbM3BouEFo7QYS",
      maxSolInput / LAMPORTS_PER_SOL + rentSolAmount / LAMPORTS_PER_SOL
    );
    // 19个账户
    const accounts: AccountMeta[] = [
      { pubkey: pumpFunAmmMarket, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: PUMP_SWAP_GLOBAL_CONFIG, isSigner: false, isWritable: false },
      { pubkey: baseMint, isSigner: false, isWritable: false },
      { pubkey: SOL, isSigner: false, isWritable: false },
      {
        pubkey: userBaseTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      // { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true },
      { pubkey: newAccountAddress, isSigner: false, isWritable: true },
      { pubkey: poolBaseTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolQuoteTokenAccount, isSigner: false, isWritable: true },
      {
        pubkey: PUMP_PROTOCOL_FEE_RECIPIENT,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: PUMP_PROTOCOL_FEE_RECIPIENT_TOKEN_ACCOUNT,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: PUMP_SWAP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: PUMP_AMM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: coinCreatorVaultAta, isSigner: false, isWritable: true },
      { pubkey: coinCreatorVaultAuthority, isSigner: false, isWritable: false },
    ];

    // Create instruction data
    const baseAmountOutBuffer = Buffer.allocUnsafe(8);
    baseAmountOutBuffer.writeBigUInt64LE(BigInt(baseAmountOut), 0);

    const maxSolInputBuffer = Buffer.allocUnsafe(8);
    maxSolInputBuffer.writeBigUInt64LE(BigInt(maxSolInput), 0);

    const data = Buffer.concat([
      BUY_DISCRIMINATOR,
      baseAmountOutBuffer,
      maxSolInputBuffer,
    ]);

    // Create instructions
    const computeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: COMPUTE_UNIT_BUDGET,
    });

    const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: COMPUTE_UNIT_PRICE,
    });
    console.log("userBaseTokenAccount", userBaseTokenAccount.toString());
    console.log("baseMint", baseMint.toString());
    const mintInfo = await connection.getAccountInfo(baseMint);
    if (!mintInfo) {
      console.log("Mint account does not exist");
    }
    const ataInfo = await connection.getAccountInfo(userBaseTokenAccount);
    if (ataInfo) {
      console.log("userBaseTokenAccountATA already exists");
    }
    const idempotentAtaIx = createAssociatedTokenAccountInstruction(
      payer.publicKey, // payer (谁支付创建费用)
      userBaseTokenAccount, // associatedToken (要创建的 ATA 地址)
      payer.publicKey, // owner (ATA 的所有者)
      baseMint, // mint (代币的 mint 地址)
      TOKEN_PROGRAM_ID, // tokenProgramId (可选)
      ASSOCIATED_TOKEN_PROGRAM_ID // associatedTokenProgramId (可选)
    );
    console.log("userQuoteTokenAccount", userQuoteTokenAccount);
    let fullIx = [
      computeLimitIx,
      computePriceIx,
      // instruction!,
      createAccountInstruction,
      initializeAccountInstruction,
    ];
    const { instruction, ataAddress } =
      await getOrCreateAssociatedTokenAccount2(
        connection,
        userBaseTokenAccount,
        payer.publicKey,
        TOKEN_MINT,
        payer.publicKey
      );
    if (instruction) {
      fullIx.push(instruction);
    }
    const buyIx = new TransactionInstruction({
      programId: PUMP_AMM_PROGRAM_ID,
      data: data,
      keys: accounts,
    });

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();

    // Create versioned transaction
    const messageV0 = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [...fullIx, buyIx],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([payer]);

    // Send transaction
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: true,
      preflightCommitment: "confirmed",
    });

    console.log(`Transaction sent: https://solscan.io/tx/${signature}`);

    // Confirm transaction
    await connection.confirmTransaction(signature, "confirmed");
    console.log("Transaction confirmed");

    return signature;
    return "";
  } catch (error) {
    console.log(`Error sending transaction:`, error);
    return null;
  }
}

// test
async function main() {
  const solAmountToSpend = 0.001;

  const connection = new Connection(RPC_ENDPOINT, "confirmed");

  try {
    // pool
    const marketAddress = await getMarketAddressByBaseMint(
      connection,
      TOKEN_MINT,
      PUMP_AMM_PROGRAM_ID
    );
    console.log("marketAddress", marketAddress);
    // poll data
    // const marketData = await getMarketData(connection, marketAddress);
    const marketData = await getMarketData(
      connection,
      new PublicKey("A1wduQszZ2nZjC8HpKPst7UWStk5SsaRWXJoLwMEYw5i")
    );
    //
    const coinCreatorVaultAuthority = findCoinCreatorVault(
      new PublicKey(marketData.coin_creator)
    );
    //
    const coinCreatorVaultAta = calculateCoinCreatorVaultAta(
      coinCreatorVaultAuthority,
      TOKEN_PROGRAM_ID,
      SOL
    );
    // console.log(marketData.coin_creator);
    // console.log(coinCreatorVaultAuthority);
    // console.log(coinCreatorVaultAta);

    await buyPumpSwap(
      connection,
      new PublicKey("A1wduQszZ2nZjC8HpKPst7UWStk5SsaRWXJoLwMEYw5i"),
      PAYER,
      TOKEN_MINT,
      getAssociatedTokenAddressSync(TOKEN_MINT, PAYER.publicKey),
      getAssociatedTokenAddressSync(SOL, PAYER.publicKey),
      new PublicKey(marketData.pool_base_token_account),
      new PublicKey(marketData.pool_quote_token_account),
      coinCreatorVaultAuthority,
      coinCreatorVaultAta,
      solAmountToSpend,
      SLIPPAGE
    );
  } catch (error) {
    console.error("Error in main execution:", error);
  }
}
main().catch((err) => console.error(err));

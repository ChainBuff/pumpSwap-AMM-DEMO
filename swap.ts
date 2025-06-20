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
  createCloseAccountInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";

import {
  createWSOLAccountInstructions,
  getOrCreateAssociatedTokenAccount2,
} from "./utils";
import {
  BUY_DISCRIMINATOR,
  COMPUTE_UNIT_BUDGET,
  COMPUTE_UNIT_PRICE,
  LAMPORTS_PER_SOL,
  PAYER,
  PUMP_AMM_PROGRAM_ID,
  PUMP_PROTOCOL_FEE_RECIPIENT,
  PUMP_PROTOCOL_FEE_RECIPIENT_TOKEN_ACCOUNT,
  PUMP_SWAP_EVENT_AUTHORITY,
  PUMP_SWAP_GLOBAL_CONFIG,
  RPC_ENDPOINT,
  SLIPPAGE,
  SOL,
  TOKEN_DECIMALS,
  TOKEN_MINT,
} from "./constans";

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
 * 通过tokenMint账户找出池子地址  pump fun 称之为 market
 * 不过这个先不用 先放着吧
 * @param baseMintAddressAddress 代币地址Mint账户
 * @param ammProgramId
 */
async function getMarketAddressByBaseMint(
  connection: Connection,
  tokenMintAddress: PublicKey,
  ammProgramId: PublicKey
): Promise<PublicKey> {
  const baseMintBytes = tokenMintAddress.toBuffer();
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
 * 通过marketAddress找出相关池子数据
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
  console.log("parsedData -->", parsedData);
  return parsedData as MarketData;
}

/**
 * 手续费 coinCreatorFeeBasisPoints PDA 这是19个账户中的一个
 */
function findCoinCreatorVault(coinCreator: PublicKey): PublicKey {
  const [derivedAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator_vault"), coinCreator.toBuffer()],
    PUMP_AMM_PROGRAM_ID
  );
  return derivedAddress;
}
// coinCreator的ATA  这里是直接依据IDL的
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

  console.log("calculateCoinCreatorVaultAta -->", pda);
  return pda;
}
/**
 * 计算汇率 这里计算和axiom的 有误差  可能是公式不对  没有考虑
 * 后续用这个试试  先留在这
 * const tokenOut = (baseReserve * solInputAfterFee) / (quoteReserve + solInputAfterFee);
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
/**
 * 创建关闭代币账户的指令
 * @param {PublicKey} accountToClose - 要关闭的账户地址
 * @param {PublicKey} authority - 账户的授权者（通常是账户所有者）
 * @param {PublicKey} destination - 接收剩余 lamports 的地址（可选，默认为 authority）
 * @returns {TransactionInstruction} 关闭账户指令
 */
function createCloseTokenAccountInstruction(
  accountToClose: PublicKey,
  authority: PublicKey,
  destination?: PublicKey
): TransactionInstruction {
  const destinationAddress = destination || authority;

  return createCloseAccountInstruction(
    accountToClose,
    destinationAddress,
    authority,
    [],
    TOKEN_PROGRAM_ID
  );
}
/**
 *
 * @param connection
 * @param pumpFunAmmMarket 固定地址
 * @param payer
 * @param baseMint 就是token mint account
 * @param userBaseTokenAccount user 的 Token ATA
 * @param userQuoteTokenAccount user 的 WSol ATA
 * @param poolBaseTokenAccount 在 marketData 里
 * @param poolQuoteTokenAccount 在 marketData 里
 * @param coinCreatorVaultAuthority
 * @param coinCreatorVaultAta
 * @param solAmountToSpend 购买的sol数量
 * @param slippage 滑点
 * @returns
 */
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
    console.log("userBaseTokenAccount", userBaseTokenAccount.toString());
    console.log("userQuoteTokenAccount", userQuoteTokenAccount);
    console.log("baseMint", baseMint.toString());
    // 计算汇率
    const tokenPriceSol = await calculateTokenPoolPrice(
      connection,
      poolBaseTokenAccount,
      poolQuoteTokenAccount
    );
    console.log(`Token price in SOL: ${tokenPriceSol.toFixed(10)} SOL`);

    // 滑点计算 baseAmountOut 期望买到的 token 数量 ： solAmount / 汇率
    const baseAmountOut = Math.floor(
      (solAmountToSpend / tokenPriceSol) * Math.pow(10, TOKEN_DECIMALS)
    );
    // 计算滑点 最多为baseAmountOut 支付的sol数量  个人觉得这个滑点放在 baseAmountOut * (1 - 滑点)  然后sol的量不变 也是对的
    const slippageFactor = 1 + slippage;
    const maxSolInput = Math.floor(
      solAmountToSpend * slippageFactor * LAMPORTS_PER_SOL
    );

    console.log(
      `Buying ${baseAmountOut / Math.pow(10, TOKEN_DECIMALS)} tokens`
    );
    console.log(`Maximum SOL input: ${maxSolInput / LAMPORTS_PER_SOL} SOL`);
    // 这里是为了 WSOL 准备的 开通账户的最小豁免租金
    const rentSolAmount = await connection.getMinimumBalanceForRentExemption(
      165
    );
    console.log("最小租金", rentSolAmount);
    // 这里每次都会创建WSOL 交易的最后一个指令会关闭这个账户 将租金收回
    //  创建 WSOL ATA 指令
    const {
      createAccountInstruction,
      initializeAccountInstruction,
      newAccountAddress,
    } = await createWSOLAccountInstructions(
      payer.publicKey,
      payer.publicKey,
      "AjaC6Yz8tvuM2UmU5PsbM3BouEFo7QYS", // 这里可以使用随机的种子
      maxSolInput / LAMPORTS_PER_SOL + rentSolAmount / LAMPORTS_PER_SOL
      // deposit的sol的数量  maxSolInput + rentSolAmount 这里是为了保证WSOL 够用 不会因为租金问题 导致WSOL不够用 WSOL转移失败 导致整体交易失败
    );

    // Create instruction data
    const baseAmountOutBuffer = Buffer.allocUnsafe(8);
    baseAmountOutBuffer.writeBigUInt64LE(BigInt(baseAmountOut), 0);

    const maxSolInputBuffer = Buffer.allocUnsafe(8);
    maxSolInputBuffer.writeBigUInt64LE(BigInt(maxSolInput), 0);

    //  buy 函数签名
    const data = Buffer.concat([
      BUY_DISCRIMINATOR,
      baseAmountOutBuffer,
      maxSolInputBuffer,
    ]);

    // 创建指令
    // cu指令 这里不模拟了 直接使用一个固定值
    const computeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: COMPUTE_UNIT_BUDGET,
    });

    const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: COMPUTE_UNIT_PRICE,
    });

    const mintInfo = await connection.getAccountInfo(baseMint);
    if (!mintInfo) {
      console.log("Mint account does not exist");
    }

    const ataInfo = await connection.getAccountInfo(userBaseTokenAccount);
    if (ataInfo) {
      console.log("userBaseTokenAccountATA already exists");
    }
    // const idempotentAtaIx = createAssociatedTokenAccountInstruction(
    //   payer.publicKey, // payer (谁支付创建费用)
    //   userBaseTokenAccount, // associatedToken (要创建的 ATA 地址)
    //   payer.publicKey, // owner (ATA 的所有者)
    //   baseMint, // mint (代币的 mint 地址)
    //   TOKEN_PROGRAM_ID, // tokenProgramId (可选)
    //   ASSOCIATED_TOKEN_PROGRAM_ID // associatedTokenProgramId (可选)
    // );
    //  判断userBaseTokenAccount 这个ATA存不存在，不存在则输出创建ATA指令 存在instruction就是null
    const { instruction: userBaseTokenAccountInstruction, ataAddress } =
      await getOrCreateAssociatedTokenAccount2(
        connection,
        userBaseTokenAccount,
        payer.publicKey,
        TOKEN_MINT,
        payer.publicKey
      );
    let fullIx = [
      computeLimitIx,
      computePriceIx,
      createAccountInstruction,
      initializeAccountInstruction,
    ];
    if (userBaseTokenAccountInstruction) {
      fullIx.push(userBaseTokenAccountInstruction);
    }
    // 19个账户
    const accounts: AccountMeta[] = [
      { pubkey: pumpFunAmmMarket, isSigner: false, isWritable: true }, // pool
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // user
      { pubkey: PUMP_SWAP_GLOBAL_CONFIG, isSigner: false, isWritable: false }, // global
      { pubkey: baseMint, isSigner: false, isWritable: false }, // baseMint = token MInt
      { pubkey: SOL, isSigner: false, isWritable: false }, //Quote Mint
      {
        pubkey: userBaseTokenAccount,
        isSigner: false,
        isWritable: true,
      }, // User Base Token Account
      { pubkey: newAccountAddress, isSigner: false, isWritable: true }, //User Quote Token Account
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

    const buyIx = new TransactionInstruction({
      programId: PUMP_AMM_PROGRAM_ID,
      data: data,
      keys: accounts,
    });

    const closeWsolIx = createCloseTokenAccountInstruction(
      newAccountAddress,
      payer.publicKey
    );
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();

    // Create versioned transaction
    const messageV0 = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [...fullIx, buyIx, closeWsolIx],
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
    // const marketAddress = await getMarketAddressByBaseMint(
    //   connection,
    //   TOKEN_MINT,
    //   PUMP_AMM_PROGRAM_ID
    // );
    // console.log("marketAddress", marketAddress);
    // poll data
    // const marketData = await getMarketData(connection, marketAddress);

    //   直接拿一个池子地址 进行查询池子数据
    const marketAddress = new PublicKey(
      "A1wduQszZ2nZjC8HpKPst7UWStk5SsaRWXJoLwMEYw5i"
    );
    const marketData = await getMarketData(connection, marketAddress);
    // PDA
    const coinCreatorVaultAuthority = findCoinCreatorVault(
      new PublicKey(marketData.coin_creator)
    );
    // ATA
    const coinCreatorVaultAta = calculateCoinCreatorVaultAta(
      coinCreatorVaultAuthority,
      TOKEN_PROGRAM_ID,
      SOL
    );
    // console.log(marketData.coin_creator);
    // console.log(coinCreatorVaultAuthority);
    // console.log(coinCreatorVaultAta);
    // https://solscan.io/tx/2wmCC8dURbMU9fShXCFswB1AbnDYqwx2yVF3DCgCQaNVQv1w1Gg8yeKAWEvhiNsbsVCZwPJ4iNMrE8MZRMyrXJqB
    await buyPumpSwap(
      connection,
      // 池子地址
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
